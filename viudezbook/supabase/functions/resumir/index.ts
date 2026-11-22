// resumir: escreve um resumo do livro para ouvir em ~12 minutos.
// Quem escreve: Gemini (Google, cota grátis) ou Claude (Anthropic, pago por uso).
// O resumo vira o capítulo 0 do livro, então usa as mesmas vozes e o mesmo player.
// Ações: provedores | estimar | gerar
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";
import { clienteDoUsuario, cors, erro, resposta } from "../_shared/servidor.ts";
import { blocosDoCapitulo } from "../_shared/texto.ts";

type Provedor = "gemini" | "claude";

const MODELO_CLAUDE = "claude-opus-5-5";
const MODELO_GEMINI = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash"; // conferir no site do Google qual modelo é grátis
const GEMINI_URL = Deno.env.get("GEMINI_URL") ?? "https://generativelanguage.googleapis.com/v1beta";

// Preço do Claude Opus 5.5 por milhão de tokens (tabela da Anthropic; conferir no site se mudar).
const USD_ENTRADA = 4;
const USD_SAIDA = 20;
const TOKENS_SAIDA_ESTIMADOS = 8000; // resumo + raciocínio
const LIMITE_TOKENS_LIVRO = 800_000; // cabe com folga na janela de 1 milhão

const PALAVRAS_ALVO = 1800; // ~12 minutos em ritmo de leitura falada

const chaves: Record<Provedor, string> = { gemini: "GEMINI_API_KEY", claude: "ANTHROPIC_API_KEY" };
const temChave = (p: Provedor) => !!Deno.env.get(chaves[p]);

// Português gasta mais tokens por letra que inglês; estimativa conservadora.
const tokensAprox = (letras: number) => Math.ceil(letras / 3.2);

const SISTEMA = `Você escreve resumos de livros para serem OUVIDOS em áudio, em português do Brasil.

Regras:
- Tamanho: cerca de ${PALAVRAS_ALVO} palavras (uns 12 minutos ouvindo). Não passe de ${PALAVRAS_ALVO + 300}.
- Texto corrido, em parágrafos. Sem títulos, listas, marcadores, negrito, emojis ou qualquer formatação: tudo vai ser lido em voz alta.
- Tom de conversa, claro e envolvente, como alguém contando o livro para um amigo. Frases de tamanho médio, fáceis de acompanhar só ouvindo.
- Comece dizendo o nome do livro e do autor e, em uma ou duas frases, do que ele trata.
- Livro de não ficção: apresente as ideias principais na ordem em que aparecem, com os exemplos mais marcantes, e feche com as lições práticas.
- Ficção: conte a história principal com os personagens centrais. Avise logo no começo que o resumo revela o final.
- Use só o que está no livro. Não invente fatos, dados, citações ou opiniões que o livro não tem. Se uma parte do texto estiver confusa (erro de leitura do PDF), ignore essa parte.
- Escreva números e siglas como devem ser falados quando isso ajudar a leitura.
- Responda apenas com o texto do resumo.`;

async function textoDoLivro(db: any, livroId: string) {
  const [{ data: livro }, { data: caps }] = await Promise.all([
    db.from("vb_livros").select("id, titulo, autor").eq("id", livroId).maybeSingle(),
    db.from("vb_capitulos").select("numero, titulo, texto").eq("livro_id", livroId).gt("numero", 0).order("numero"),
  ]);
  if (!livro) throw new Error("Livro não encontrado.");
  const texto = (caps ?? []).map((c: any) => `${c.titulo ?? ""}\n\n${c.texto}`).join("\n\n");
  return { livro, texto };
}

async function comClaude(titulo: string, autor: string, texto: string) {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do servidor
  const msg = await client.beta.messages.create({
    model: MODELO_CLAUDE,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // se o modelo recusar, o próprio servidor tenta outro modelo
    output_config: { effort: "medium" },
    system: SISTEMA,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `<livro titulo="${titulo}" autor="${autor}">\n${texto}\n</livro>` },
          { type: "text", text: `Escreva o resumo para ouvir de "${titulo}".` },
        ],
      },
    ],
  });
  if (msg.stop_reason === "refusal") throw new Error("O Claude não quis resumir este livro.");
  if (msg.stop_reason === "max_tokens") throw new Error("O resumo ficou grande demais. Tente de novo.");
  const out = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { texto: out, modelo: msg.model };
}

async function comGemini(titulo: string, autor: string, texto: string) {
  const r = await fetch(`${GEMINI_URL}/models/${MODELO_GEMINI}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `<livro titulo="${titulo}" autor="${autor}">\n${texto}\n</livro>\n\nEscreva o resumo para ouvir de "${titulo}".` }],
        },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw new Error("A cota grátis do Gemini acabou por agora. Tente mais tarde.");
    throw new Error(`Gemini respondeu ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  const out = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  if (!out) throw new Error("O Gemini não devolveu o resumo (pode ter bloqueado o conteúdo).");
  return { texto: out, modelo: MODELO_GEMINI };
}

/** Tira qualquer formatação que escape (o texto vai ser lido em voz alta). */
function limparParaVoz(t: string) {
  return t
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*?|__/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function gerar(db: any, usuarioId: string, livroId: string, provedor: Provedor) {
  try {
    const { livro, texto } = await textoDoLivro(db, livroId);
    const r = provedor === "claude"
      ? await comClaude(livro.titulo, livro.autor ?? "", texto)
      : await comGemini(livro.titulo, livro.autor ?? "", texto);
    const resumo = limparParaVoz(r.texto);
    const titulo = "Resumo em 12 minutos";
    const { data: cap, error } = await db
      .from("vb_capitulos")
      .upsert(
        { livro_id: livroId, usuario_id: usuarioId, numero: 0, titulo, texto: resumo, caracteres: resumo.length, blocos: blocosDoCapitulo(titulo, resumo).length },
        { onConflict: "livro_id,numero" },
      )
      .select("id")
      .single();
    if (error) throw error;
    await db.from("vb_resumos").update({
      estado: "pronto", modelo: r.modelo, capitulo_id: cap.id, palavras: resumo.split(/\s+/).length, erro: null, atualizado_em: new Date().toISOString(),
    }).eq("livro_id", livroId);
  } catch (e) {
    await db.from("vb_resumos").update({
      estado: "erro", erro: e instanceof Error ? e.message : String(e), atualizado_em: new Date().toISOString(),
    }).eq("livro_id", livroId);
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cli = await clienteDoUsuario(req);
  if (cli instanceof Response) return cli;
  const { db, usuarioId } = cli;

  let c: { acao?: string; livro_id?: string; provedor?: Provedor; confirmado?: boolean };
  try {
    c = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }

  try {
    if (c.acao === "provedores") {
      return resposta({ gemini: temChave("gemini"), claude: temChave("claude"), modelo_gemini: MODELO_GEMINI, modelo_claude: MODELO_CLAUDE });
    }

    const provedor = c.provedor;
    if (provedor !== "gemini" && provedor !== "claude") return erro("Escolha quem escreve o resumo.");
    if (!temChave(provedor)) return erro(`Falta cadastrar a chave ${chaves[provedor]} no Supabase.`);
    if (!c.livro_id) return erro("Faltou o livro.");

    const { texto } = await textoDoLivro(db, c.livro_id);
    const tokens = tokensAprox(texto.length);
    if (tokens > LIMITE_TOKENS_LIVRO) return erro("Este livro é grande demais para resumir de uma vez.");

    if (c.acao === "estimar") {
      const usd = provedor === "claude" ? (tokens * USD_ENTRADA + TOKENS_SAIDA_ESTIMADOS * USD_SAIDA) / 1_000_000 : 0;
      return resposta({ letras: texto.length, tokens, custo_usd: Math.round(usd * 100) / 100, gratis: provedor === "gemini" });
    }

    if (c.acao === "gerar") {
      if (c.confirmado !== true) return erro("Confirme a estimativa antes de gerar.");
      const { data: atual } = await db.from("vb_resumos").select("estado, atualizado_em").eq("livro_id", c.livro_id).maybeSingle();
      if (atual?.estado === "gerando" && Date.now() - new Date(atual.atualizado_em).getTime() < 5 * 60_000) {
        return resposta({ ok: true, ja_gerando: true });
      }
      const up = await db.from("vb_resumos").upsert(
        { livro_id: c.livro_id, estado: "gerando", provedor, modelo: null, erro: null, atualizado_em: new Date().toISOString() },
        { onConflict: "livro_id" },
      );
      if (up.error) throw up.error;
      // Roda em segundo plano: a tela acompanha pelo estado em vb_resumos.
      const tarefa = gerar(db, usuarioId, c.livro_id, provedor);
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa);
      return resposta({ ok: true });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
});
