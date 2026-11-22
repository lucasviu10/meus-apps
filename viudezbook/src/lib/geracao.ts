// Fila de geração de voz. Continua rodando mesmo se você trocar de tela,
// e avisa o player quando um bloco novo fica pronto ("ouvir já").
import { chamarFuncao, supabase, usuarioId } from "./supabase";
import { opcao } from "./motores";
import { blocosDoCapitulo } from "../../supabase/functions/_shared/texto.ts";

export interface EstadoGeracao {
  capituloId: string;
  total: number;
  feitos: number;
  gerando: boolean;
  creditos: number;
  mensagem: string;
  erro: string | null;
}

const estados = new Map<string, EstadoGeracao>();
const ouvintes = new Set<(capituloId: string) => void>();

export function estadoGeracao(capituloId: string): EstadoGeracao | undefined {
  return estados.get(capituloId);
}

export function algumaGeracaoAtiva(): boolean {
  return [...estados.values()].some((e) => e.gerando);
}

export function assinarGeracao(fn: (capituloId: string) => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(id: string) {
  ouvintes.forEach((f) => f(id));
}

export async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Blocos que ainda faltam gerar no celular (voz grátis). Mesma regra de cache do servidor. */
export async function planoLocal(capituloId: string, vozId: string, modelo: string) {
  const { data: cap, error } = await supabase.from("vb_capitulos").select("id, livro_id, titulo, texto").eq("id", capituloId).single();
  if (error || !cap) throw new Error("Capítulo não encontrado.");
  const blocos = blocosDoCapitulo(cap.titulo ?? "", cap.texto);
  const hashes = await Promise.all(blocos.map((b) => sha256(`${modelo}|${vozId}|${b}`)));
  const { data: existentes } = await supabase.from("vb_audios").select("bloco, hash").eq("capitulo_id", cap.id).in("hash", hashes);
  const prontos = new Set((existentes ?? []).filter((e: any) => hashes[e.bloco] === e.hash).map((e: any) => e.bloco as number));
  return { cap, blocos, hashes, prontos };
}

// Mantém a tela acesa enquanto o celular gera a voz grátis.
async function manterTelaAcesa(): Promise<() => void> {
  try {
    const trava = await (navigator as any).wakeLock?.request("screen");
    return () => trava?.release?.();
  } catch {
    return () => {};
  }
}

export async function gerarCapitulo(p: { capituloId: string; vozId: string; modelo: string; blocos: number }) {
  if (estados.get(p.capituloId)?.gerando) return;
  const est: EstadoGeracao = { capituloId: p.capituloId, total: p.blocos, feitos: 0, gerando: true, creditos: 0, mensagem: "", erro: null };
  estados.set(p.capituloId, est);
  avisar(p.capituloId);
  const local = opcao(p.modelo).local;
  const soltar = local ? await manterTelaAcesa() : () => {};
  try {
    if (local) {
      const uid = await usuarioId();
      const { sintetizarPiper } = await import("./piper");
      const { cap, blocos, hashes, prontos } = await planoLocal(p.capituloId, p.vozId, p.modelo);
      est.total = blocos.length;
      for (let i = 0; i < blocos.length; i++) {
        if (!prontos.has(i)) {
          est.mensagem = `Gerando parte ${i + 1} de ${blocos.length} no celular…`;
          avisar(p.capituloId);
          const { mp3, duracao } = await sintetizarPiper(p.vozId, blocos[i], (m) => {
            est.mensagem = m;
            avisar(p.capituloId);
          });
          const caminho = `${uid}/${cap.livro_id}/${cap.id}/${i}-${hashes[i].slice(0, 16)}.mp3`;
          const up = await supabase.storage.from("vb-audios").upload(caminho, mp3, { contentType: "audio/mpeg", upsert: true });
          if (up.error) throw new Error("Não consegui guardar o áudio: " + up.error.message);
          const ins = await supabase.from("vb_audios").upsert(
            { livro_id: cap.livro_id, capitulo_id: cap.id, bloco: i, voz_id: p.vozId, modelo: p.modelo, hash: hashes[i], caminho, caracteres: blocos[i].length, duracao, tamanho: mp3.size },
            { onConflict: "capitulo_id,bloco,hash" },
          );
          if (ins.error) throw new Error(ins.error.message);
        }
        est.feitos = i + 1;
        est.mensagem = "";
        avisar(p.capituloId);
      }
    } else {
      for (let i = 0; i < p.blocos; i++) {
        const r = await chamarFuncao<{ creditos: number }>("gerar-voz", {
          acao: "gerar",
          capitulo_id: p.capituloId,
          voz_id: p.vozId,
          modelo: p.modelo,
          bloco: i,
          confirmado: true, // só chega aqui depois que você confirmou a estimativa
        });
        est.feitos = i + 1;
        est.creditos += r.creditos ?? 0;
        avisar(p.capituloId);
      }
    }
  } catch (e) {
    est.erro = e instanceof Error ? e.message : String(e);
  } finally {
    est.gerando = false;
    est.mensagem = "";
    soltar();
    avisar(p.capituloId);
  }
}
