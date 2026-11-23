// Envio de PDF como TAREFA DE FUNDO: continua mesmo se você trocar de tela.
// Ordem: 1) cria o livro  2) guarda o PDF na nuvem  3) lê o texto  4) prepara os capítulos.
// Se algo falhar, o PDF já está guardado e o botão "Tentar de novo" retoma do passo 3.
import { chamarFuncao, supabase, usuarioId } from "./supabase";

export interface Envio {
  id: string; // id do livro
  titulo: string;
  etapa: "guardando" | "lendo" | "preparando" | "pronto" | "erro";
  mensagem: string;
  fracao: number;
  erro: string | null;
}

const envios = new Map<string, Envio>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function listarEnvios(): Envio[] {
  return [...envios.values()];
}

export function envioDoLivro(livroId: string): Envio | undefined {
  return envios.get(livroId);
}

export function assinarEnvios(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function algumEnvioAtivo(): boolean {
  return [...envios.values()].some((e) => e.etapa !== "pronto" && e.etapa !== "erro");
}

/** Mensagem legível de qualquer erro (Error, erro do Supabase ou texto). */
export function textoDoErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function manterTelaAcesa(): Promise<() => void> {
  try {
    const trava = await (navigator as any).wakeLock?.request("screen");
    return () => trava?.release?.();
  } catch {
    return () => {};
  }
}

function atualizar(e: Envio, parcial: Partial<Envio>) {
  Object.assign(e, parcial);
  avisar();
}

async function lerEPreparar(e: Envio, arquivo: File) {
  const etapaErro = (nome: string, err: unknown) => new Error(`${nome}: ${textoDoErro(err)}`);

  atualizar(e, { etapa: "lendo", mensagem: "Lendo o PDF…", fracao: 0 });
  let paginas: string[];
  let paginasComOcr = 0;
  let ocrFalhou = 0;
  try {
    const { extrairPaginas } = await import("./pdf");
    const r = await extrairPaginas(arquivo, (mensagem, fracao) => atualizar(e, { mensagem, fracao }));
    paginas = r.paginas;
    paginasComOcr = r.paginasComOcr;
    ocrFalhou = r.paginasOcrFalhou;
  } catch (err) {
    throw etapaErro("Erro ao ler o PDF", err);
  }

  atualizar(e, {
    etapa: "preparando",
    fracao: 1,
    mensagem:
      "Limpando o texto e dividindo em capítulos…" +
      (paginasComOcr ? ` (${paginasComOcr} páginas lidas com OCR)` : "") +
      (ocrFalhou ? ` (${ocrFalhou} páginas de imagem puladas)` : ""),
  });
  try {
    await chamarFuncao("preparar-texto", { livro_id: e.id, paginas });
  } catch (err) {
    throw etapaErro("Erro ao preparar os capítulos", err);
  }
  atualizar(e, { etapa: "pronto", mensagem: "Pronto!" });
}

async function executar(e: Envio, passo: () => Promise<void>) {
  const soltar = await manterTelaAcesa();
  try {
    await passo();
  } catch (err) {
    const msg = textoDoErro(err);
    atualizar(e, { etapa: "erro", erro: msg, mensagem: msg });
    await supabase.from("vb_livros").update({ estado: "erro", erro: msg }).eq("id", e.id);
  } finally {
    soltar();
  }
}

/** Começa um envio novo. Devolve o id do livro assim que ele é criado. */
export async function enviarPdf(arquivo: File, titulo: string, autor: string): Promise<string> {
  const uid = await usuarioId();
  const { data: livro, error } = await supabase
    .from("vb_livros")
    .insert({
      titulo: titulo.trim() || "Sem título",
      autor: autor.trim() || null,
      status: "quero_ler",
      fonte: "Upload pessoal",
      licenca: "Uso pessoal: PDF enviado por mim. O áudio gerado não é compartilhado.",
      licenca_confirmada: false,
      coletado_em: new Date().toISOString(),
      estado: "processando",
    })
    .select("id")
    .single();
  if (error) throw new Error("Erro ao criar o livro: " + textoDoErro(error));

  const e: Envio = { id: livro.id, titulo: titulo.trim(), etapa: "guardando", mensagem: "Guardando o PDF na nuvem…", fracao: 0, erro: null };
  envios.set(livro.id, e);
  avisar();

  // Roda em segundo plano: quem chamou não espera.
  void executar(e, async () => {
    const caminho = `${uid}/${livro.id}.pdf`;
    const up = await supabase.storage.from("vb-pdfs").upload(caminho, arquivo, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error("Erro ao guardar o PDF: " + textoDoErro(up.error));
    await supabase.from("vb_livros").update({ pdf_caminho: caminho }).eq("id", livro.id);
    await lerEPreparar(e, arquivo);
  });
  return livro.id;
}

/** Tenta de novo a partir do PDF já guardado na nuvem. */
export async function retomarEnvio(livroId: string, titulo: string, pdfCaminho: string) {
  if (algumEnvioAtivo() && envios.get(livroId) && envios.get(livroId)!.etapa !== "erro") return;
  const e: Envio = { id: livroId, titulo, etapa: "lendo", mensagem: "Baixando o PDF guardado…", fracao: 0, erro: null };
  envios.set(livroId, e);
  avisar();
  await supabase.from("vb_livros").update({ estado: "processando", erro: null }).eq("id", livroId);
  void executar(e, async () => {
    const { data, error } = await supabase.storage.from("vb-pdfs").download(pdfCaminho);
    if (error || !data) throw new Error("Erro ao baixar o PDF guardado: " + textoDoErro(error));
    await lerEPreparar(e, new File([data], `${livroId}.pdf`, { type: "application/pdf" }));
  });
}

export function esquecerEnvio(livroId: string) {
  envios.delete(livroId);
  avisar();
}
