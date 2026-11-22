// coletar-livro: busca livros em domínio público no Projeto Gutenberg
// (pela API pública Gutendex) e adiciona o escolhido à biblioteca.
import { clienteDoUsuario, cors, erro, resposta, salvarCapitulos } from "../_shared/servidor.ts";
import { dividirCapitulos, limparGutenberg } from "../_shared/texto.ts";

// O endereço pode ser trocado só para testes automáticos.
const GUTENDEX = Deno.env.get("GUTENDEX_URL") ?? "https://gutendex.com/books";

interface Autor { name: string; birth_year: number | null; death_year: number | null }
interface LivroGutendex {
  id: number;
  title: string;
  authors: Autor[];
  languages: string[];
  copyright: boolean | null;
  formats: Record<string, string>;
  download_count: number;
}

// "Assis, Machado de" -> "Machado de Assis"
function nomeAutor(a?: Autor): string {
  if (!a) return "Autor desconhecido";
  const [sobrenome, nome] = a.name.split(", ");
  return nome ? `${nome} ${sobrenome}` : a.name;
}

// Lei 9.610/1998: domínio público 70 anos após a morte, contados de 1º de janeiro do ano seguinte.
function dominioPublicoBrasil(autores: Autor[]): boolean | null {
  if (!autores.length) return null;
  const ano = new Date().getFullYear();
  if (autores.some((a) => !a.death_year)) return null;
  return autores.every((a) => ano >= (a.death_year as number) + 71);
}

function urlTexto(f: Record<string, string>): string | null {
  const chaves = Object.keys(f).filter((k) => k.startsWith("text/plain") && !f[k].endsWith(".zip"));
  chaves.sort((a, b) => Number(b.includes("utf-8")) - Number(a.includes("utf-8")));
  return chaves.length ? f[chaves[0]] : null;
}

function resumo(l: LivroGutendex) {
  const br = dominioPublicoBrasil(l.authors);
  return {
    gutenberg_id: l.id,
    titulo: l.title,
    autor: l.authors.map(nomeAutor).join(", ") || "Autor desconhecido",
    morte_autor: l.authors[0]?.death_year ?? null,
    idioma: l.languages[0] ?? null,
    capa_url: l.formats["image/jpeg"] ?? null,
    tem_texto: !!urlTexto(l.formats),
    link_original: `https://www.gutenberg.org/ebooks/${l.id}`,
    dominio_publico_eua: l.copyright === false,
    dominio_publico_brasil: br,
    downloads: l.download_count,
  };
}

async function buscarJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "Viudezbook/0.1 (app pessoal)" } });
  if (!r.ok) throw new Error(`A fonte respondeu ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cli = await clienteDoUsuario(req);
  if (cli instanceof Response) return cli;
  const { db } = cli;

  let corpo: { acao?: string; termo?: string; idioma?: string; pagina?: number; gutenberg_id?: number };
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }

  try {
    if (corpo.acao === "buscar") {
      const p = new URLSearchParams();
      if (corpo.termo?.trim()) p.set("search", corpo.termo.trim());
      if (corpo.idioma && corpo.idioma !== "todos") p.set("languages", corpo.idioma);
      p.set("copyright", "false"); // só domínio público
      if (corpo.pagina && corpo.pagina > 1) p.set("page", String(corpo.pagina));
      const dados = await buscarJson(`${GUTENDEX}/?${p}`);
      const livros = (dados.results as LivroGutendex[]).map(resumo).filter((l) => l.tem_texto);
      return resposta({ total: dados.count, tem_mais: !!dados.next, livros });
    }

    if (corpo.acao === "adicionar") {
      const id = Number(corpo.gutenberg_id);
      if (!id) return erro("Faltou o livro.");
      const link = `https://www.gutenberg.org/ebooks/${id}`;

      const { data: existe } = await db.from("vb_livros").select("id").eq("link_original", link).maybeSingle();
      if (existe) return resposta({ ok: true, livro_id: existe.id, duplicado: true });

      const l: LivroGutendex = await buscarJson(`${GUTENDEX}/${id}`);
      const url = urlTexto(l.formats);
      if (!url) return erro("Esse livro não tem versão em texto.");
      if (l.copyright !== false) return erro("O Gutenberg não confirma domínio público para esse livro.");

      const r = await fetch(url, { headers: { "User-Agent": "Viudezbook/0.1 (app pessoal)" } });
      if (!r.ok) throw new Error(`Não consegui baixar o texto (${r.status}).`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const charset = (r.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
      let bruto: string;
      try {
        bruto = new TextDecoder(charset, { fatal: true }).decode(bytes);
      } catch {
        bruto = new TextDecoder("iso-8859-1").decode(bytes);
      }

      const r0 = resumo(l);
      const br = r0.dominio_publico_brasil;
      const licenca =
        "Domínio público nos EUA, segundo o Projeto Gutenberg." +
        (br === true
          ? ` No Brasil também: o autor morreu em ${r0.morte_autor}, há mais de 70 anos.`
          : br === false
          ? " No Brasil ainda pode ter direitos: conferir antes de compartilhar."
          : " No Brasil: preciso confirmar (sem data de morte do autor).");

      const { data: novo, error } = await db
        .from("vb_livros")
        .insert({
          titulo: l.title.split(/\r?\n|\$/)[0].trim(),
          autor: r0.autor,
          idioma: r0.idioma,
          capa_url: r0.capa_url,
          status: "quero_ler",
          fonte: "Projeto Gutenberg",
          link_original: link,
          licenca,
          licenca_confirmada: true, // a fonte diz que é domínio público
          coletado_em: new Date().toISOString(),
          estado: "processando",
        })
        .select("id")
        .single();
      if (error) throw error;

      const capitulos = dividirCapitulos(limparGutenberg(bruto));
      const res = await salvarCapitulos(db, novo.id, capitulos);
      return resposta({ ok: true, livro_id: novo.id, ...res });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 502);
  }
});
