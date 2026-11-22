// gerar-voz: a ÚNICA peça que conhece a chave do ElevenLabs.
// Ações:
//   vozes   -> lista as vozes da conta
//   estimar -> quantos caracteres/créditos um capítulo vai gastar (nada é gerado)
//   gerar   -> gera UM bloco do capítulo; se já existe, devolve o que existe sem gastar
import { clienteDoUsuario, cors, erro, resposta, sha256 } from "../_shared/servidor.ts";
import { blocosDoCapitulo } from "../_shared/texto.ts";

// O endereço pode ser trocado só para testes automáticos.
const API = Deno.env.get("ELEVENLABS_API_URL") ?? "https://api.elevenlabs.io/v1";
const FORMATO = "mp3_44100_128";
const KBPS = 128;

// Créditos por caractere (tabela do ElevenLabs; conferir no site se mudar).
const MODELOS: Record<string, { nome: string; creditosPorCaractere: number }> = {
  eleven_multilingual_v2: { nome: "Mais natural", creditosPorCaractere: 1 },
  eleven_flash_v2_5: { nome: "Econômico", creditosPorCaractere: 0.5 },
};

function chave(): string | null {
  return Deno.env.get("ELEVENLABS_API_KEY") ?? null;
}

async function eleven(caminho: string, init: RequestInit = {}) {
  return fetch(API + caminho, {
    ...init,
    headers: { "xi-api-key": chave()!, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function mensagemErro(r: Response): Promise<string> {
  let detalhe = "";
  try {
    const j = await r.json();
    detalhe = j?.detail?.message ?? j?.detail?.status ?? JSON.stringify(j?.detail ?? j);
  } catch { /* sem corpo */ }
  if (r.status === 401) return "A chave do ElevenLabs foi recusada. Confira o segredo ELEVENLABS_API_KEY no Supabase. " + detalhe;
  if (/quota|credit/i.test(detalhe)) return "Acabaram os créditos do ElevenLabs deste mês. Use a voz do celular ou espere renovar.";
  return `ElevenLabs respondeu ${r.status}: ${detalhe}`;
}

async function saldo() {
  const r = await eleven("/user/subscription");
  if (!r.ok) return null; // a chave pode não ter permissão de leitura da conta
  const s = await r.json();
  return {
    plano: s.tier,
    usados: s.character_count,
    limite: s.character_limit,
    restantes: Math.max(0, s.character_limit - s.character_count),
    renova_em: s.next_character_count_reset_unix
      ? new Date(s.next_character_count_reset_unix * 1000).toISOString()
      : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cli = await clienteDoUsuario(req);
  if (cli instanceof Response) return cli;
  const { db, usuarioId } = cli;
  if (!chave()) return erro("Falta cadastrar a chave do ElevenLabs no Supabase (segredo ELEVENLABS_API_KEY).", 500);

  let c: { acao?: string; capitulo_id?: string; voz_id?: string; modelo?: string; bloco?: number; confirmado?: boolean };
  try {
    c = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }

  try {
    if (c.acao === "vozes") {
      const r = await eleven("/voices");
      if (!r.ok) return erro(await mensagemErro(r), 502);
      const j = await r.json();
      const vozes = (j.voices as any[]).map((v) => ({
        voz_id: v.voice_id,
        nome: v.name,
        categoria: v.category,
        idioma: v.labels?.language ?? null,
        sotaque: v.labels?.accent ?? null,
        genero: v.labels?.gender ?? null,
        amostra_url: v.preview_url ?? null,
      }));
      return resposta({ vozes, modelos: MODELOS, saldo: await saldo() });
    }

    // As outras ações trabalham com um capítulo.
    const modelo = c.modelo ?? "eleven_multilingual_v2";
    if (!MODELOS[modelo]) return erro("Modelo de voz desconhecido.");
    if (!c.capitulo_id || !c.voz_id) return erro("Faltou o capítulo ou a voz.");

    const { data: cap } = await db
      .from("vb_capitulos")
      .select("id, livro_id, titulo, texto")
      .eq("id", c.capitulo_id)
      .maybeSingle();
    if (!cap) return erro("Capítulo não encontrado.", 404);

    const blocos = blocosDoCapitulo(cap.titulo ?? "", cap.texto);
    const hashes = await Promise.all(blocos.map((b) => sha256(`${modelo}|${c.voz_id}|${b}`)));
    const { data: existentes } = await db
      .from("vb_audios")
      .select("bloco, hash")
      .eq("capitulo_id", cap.id)
      .in("hash", hashes);
    const prontos = new Set((existentes ?? []).filter((e) => hashes[e.bloco] === e.hash).map((e) => e.bloco));

    if (c.acao === "estimar") {
      const aGerar = blocos.reduce((s, b, i) => s + (prontos.has(i) ? 0 : b.length), 0);
      return resposta({
        blocos_total: blocos.length,
        blocos_prontos: prontos.size,
        caracteres_total: blocos.reduce((s, b) => s + b.length, 0),
        caracteres_a_gerar: aGerar,
        creditos_estimados: Math.ceil(aGerar * MODELOS[modelo].creditosPorCaractere),
        modelo: MODELOS[modelo].nome,
        saldo: await saldo(),
      });
    }

    if (c.acao === "gerar") {
      if (c.confirmado !== true) return erro("Confirme a estimativa de custo antes de gerar.");
      const i = Number(c.bloco);
      if (!Number.isInteger(i) || i < 0 || i >= blocos.length) return erro("Bloco inválido.");

      // Cache: se esse texto já foi gerado com essa voz e esse modelo, não gasta nada.
      if (prontos.has(i)) return resposta({ ok: true, bloco: i, gerado: false, creditos: 0 });

      const corpo: Record<string, unknown> = {
        text: blocos[i],
        model_id: modelo,
        previous_text: i > 0 ? blocos[i - 1].slice(-300) : undefined,
        next_text: i < blocos.length - 1 ? blocos[i + 1].slice(0, 300) : undefined,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      };
      if (modelo === "eleven_flash_v2_5") corpo.language_code = "pt";

      const r = await eleven(`/text-to-speech/${encodeURIComponent(c.voz_id)}?output_format=${FORMATO}`, {
        method: "POST",
        body: JSON.stringify(corpo),
        headers: { Accept: "audio/mpeg" },
      });
      if (!r.ok) return erro(await mensagemErro(r), 502);
      const audio = new Uint8Array(await r.arrayBuffer());

      const caminho = `${usuarioId}/${cap.livro_id}/${cap.id}/${i}-${hashes[i].slice(0, 16)}.mp3`;
      const up = await db.storage.from("vb-audios").upload(caminho, audio, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;

      const duracao = (audio.byteLength * 8) / (KBPS * 1000);
      const ins = await db.from("vb_audios").upsert(
        {
          livro_id: cap.livro_id,
          capitulo_id: cap.id,
          bloco: i,
          voz_id: c.voz_id,
          modelo,
          hash: hashes[i],
          caminho,
          caracteres: blocos[i].length,
          duracao,
          tamanho: audio.byteLength,
        },
        { onConflict: "capitulo_id,bloco,hash" },
      );
      if (ins.error) throw ins.error;
      return resposta({
        ok: true,
        bloco: i,
        gerado: true,
        creditos: Math.ceil(blocos[i].length * MODELOS[modelo].creditosPorCaractere),
        duracao,
      });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
});
