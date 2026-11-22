// gerar-voz: a ÚNICA peça que conhece as chaves dos serviços de voz.
// Motor: ElevenLabs no plano grátis. (O Piper, grátis e ilimitado, roda no celular.)
// Ações:
//   motores -> quais serviços estão configurados (sem chamar ninguém)
//   vozes   -> lista as vozes de um serviço
//   amostra -> gera um trecho curto para ouvir (não guarda)
//   estimar -> quanto um capítulo vai gastar (nada é gerado)
//   gerar   -> gera UM bloco do capítulo; se já existe, devolve sem gastar
import { clienteDoUsuario, cors, erro, resposta, sha256 } from "../_shared/servidor.ts";
import { blocosDoCapitulo } from "../_shared/texto.ts";
import { duracaoMp3 } from "../_shared/mp3.ts";

// Os endereços podem ser trocados só para testes automáticos.
const ELEVEN = Deno.env.get("ELEVENLABS_API_URL") ?? "https://api.elevenlabs.io/v1";

type Motor = "elevenlabs";

// Custo por letra, pela tabela de cada serviço (conferir no site se mudar).
const MODELOS: Record<string, { motor: Motor; nome: string; porLetra: number; unidade: string }> = {
  eleven_multilingual_v2: { motor: "elevenlabs", nome: "ElevenLabs · mais natural", porLetra: 1, unidade: "créditos" },
  eleven_flash_v2_5: { motor: "elevenlabs", nome: "ElevenLabs · econômico", porLetra: 0.5, unidade: "créditos" },
};

const CHAVES: Record<Motor, string> = {
  elevenlabs: "ELEVENLABS_API_KEY",
};
const chave = (m: Motor) => Deno.env.get(CHAVES[m]) ?? null;

interface VozInfo {
  voz_id: string;
  nome: string;
  idioma: string | null;
  genero: string | null;
  categoria: string | null;
  amostra_url: string | null;
}

async function falha(servico: string, r: Response): Promise<Error> {
  let detalhe = "";
  try {
    const t = await r.text();
    try {
      const j = JSON.parse(t);
      detalhe = j?.detail?.message ?? j?.detail?.status ?? j?.error?.message ?? t;
    } catch {
      detalhe = t;
    }
  } catch { /* sem corpo */ }
  if (r.status === 401 || r.status === 403) {
    return new Error(`${servico} recusou a chave. Confira o segredo no Supabase. ${detalhe}`.trim());
  }
  if (/quota|credit|exceeded/i.test(detalhe) || r.status === 429) {
    return new Error(`${servico}: acabou a cota deste mês. Use a voz grátis (Piper) ou espere renovar.`);
  }
  return new Error(`${servico} respondeu ${r.status}: ${String(detalhe).slice(0, 300)}`);
}

// ---------- ElevenLabs ----------
const eleven = (caminho: string, init: RequestInit = {}) =>
  fetch(ELEVEN + caminho, {
    ...init,
    headers: { "xi-api-key": chave("elevenlabs")!, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

async function saldoEleven() {
  const r = await eleven("/user/subscription");
  if (!r.ok) return null;
  const s = await r.json();
  return {
    plano: s.tier,
    restantes: Math.max(0, s.character_limit - s.character_count),
    limite: s.character_limit,
    renova_em: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

// ---------- Lista de vozes ----------
async function listarVozes(motor: Motor): Promise<VozInfo[]> {
  {
    const r = await eleven("/voices");
    if (!r.ok) throw await falha("ElevenLabs", r);
    const j = await r.json();
    return (j.voices as any[])
      .map((v) => ({
        voz_id: v.voice_id,
        nome: v.name,
        idioma: v.labels?.language ?? null,
        genero: v.labels?.gender ?? null,
        categoria: v.category ?? null,
        amostra_url: v.preview_url ?? null,
      }))
      .sort((a, b) => Number(b.idioma === "pt") - Number(a.idioma === "pt"));
  }
}

// ---------- Gerar áudio ----------
async function sintetizar(modelo: string, voz: string, texto: string, antes?: string, depois?: string): Promise<Uint8Array> {
  {
    const corpo: Record<string, unknown> = {
      text: texto,
      model_id: modelo,
      previous_text: antes,
      next_text: depois,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    };
    if (modelo === "eleven_flash_v2_5") corpo.language_code = "pt";
    const r = await eleven(`/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { Accept: "audio/mpeg" },
    });
    if (!r.ok) throw await falha("ElevenLabs", r);
    return new Uint8Array(await r.arrayBuffer());
  }
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cli = await clienteDoUsuario(req);
  if (cli instanceof Response) return cli;
  const { db, usuarioId } = cli;

  let c: { acao?: string; motor?: Motor; capitulo_id?: string; voz_id?: string; modelo?: string; bloco?: number; confirmado?: boolean; texto?: string };
  try {
    c = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }

  try {
    if (c.acao === "motores") {
      return resposta({
        motores: Object.fromEntries((Object.keys(CHAVES) as Motor[]).map((m) => [m, !!chave(m)])),
        modelos: MODELOS,
      });
    }

    if (c.acao === "vozes") {
      const motor = (c.motor ?? "elevenlabs") as Motor;
      if (!CHAVES[motor]) return erro("Serviço de voz desconhecido.");
      if (!chave(motor)) return erro(`Falta cadastrar a chave ${CHAVES[motor]} no Supabase.`);
      return resposta({ vozes: await listarVozes(motor), saldo: motor === "elevenlabs" ? await saldoEleven() : null });
    }


    const modelo = c.modelo ?? "eleven_multilingual_v2";
    const m = MODELOS[modelo];
    if (!m) return erro("Modelo de voz desconhecido.");
    if (!chave(m.motor)) return erro(`Falta cadastrar a chave ${CHAVES[m.motor]} no Supabase.`);
    if (!c.voz_id) return erro("Faltou escolher a voz.");

    if (c.acao === "amostra") {
      const texto = (c.texto ?? "").trim().slice(0, 400);
      if (!texto) return erro("Faltou o texto da amostra.");
      const audio = await sintetizar(modelo, c.voz_id, texto);
      return resposta({ audio_base64: base64(audio), caracteres: texto.length, gasto: Math.ceil(texto.length * m.porLetra), unidade: m.unidade });
    }

    if (!c.capitulo_id) return erro("Faltou o capítulo.");
    const { data: cap } = await db.from("vb_capitulos").select("id, livro_id, titulo, texto").eq("id", c.capitulo_id).maybeSingle();
    if (!cap) return erro("Capítulo não encontrado.", 404);

    const blocos = blocosDoCapitulo(cap.titulo ?? "", cap.texto);
    const hashes = await Promise.all(blocos.map((b) => sha256(`${modelo}|${c.voz_id}|${b}`)));
    const { data: existentes } = await db.from("vb_audios").select("bloco, hash").eq("capitulo_id", cap.id).in("hash", hashes);
    const prontos = new Set((existentes ?? []).filter((e) => hashes[e.bloco] === e.hash).map((e) => e.bloco));

    if (c.acao === "estimar") {
      const aGerar = blocos.reduce((s, b, i) => s + (prontos.has(i) ? 0 : b.length), 0);
      return resposta({
        blocos_total: blocos.length,
        blocos_prontos: prontos.size,
        caracteres_a_gerar: aGerar,
        creditos_estimados: Math.ceil(aGerar * m.porLetra),
        unidade: m.unidade,
        modelo: m.nome,
        saldo: m.motor === "elevenlabs" ? await saldoEleven() : null,
      });
    }

    if (c.acao === "gerar") {
      if (c.confirmado !== true) return erro("Confirme a estimativa de custo antes de gerar.");
      const i = Number(c.bloco);
      if (!Number.isInteger(i) || i < 0 || i >= blocos.length) return erro("Bloco inválido.");
      // Cache: esse texto já foi gerado com essa voz e esse modelo? Então não gasta nada.
      if (prontos.has(i)) return resposta({ ok: true, bloco: i, gerado: false, creditos: 0 });

      const audio = await sintetizar(modelo, c.voz_id, blocos[i], blocos[i - 1]?.slice(-300), blocos[i + 1]?.slice(0, 300));
      const caminho = `${usuarioId}/${cap.livro_id}/${cap.id}/${i}-${hashes[i].slice(0, 16)}.mp3`;
      const up = await db.storage.from("vb-audios").upload(caminho, audio, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;
      const duracao = duracaoMp3(audio);
      const ins = await db.from("vb_audios").upsert(
        { livro_id: cap.livro_id, capitulo_id: cap.id, bloco: i, voz_id: c.voz_id, modelo, hash: hashes[i], caminho, caracteres: blocos[i].length, duracao, tamanho: audio.byteLength },
        { onConflict: "capitulo_id,bloco,hash" },
      );
      if (ins.error) throw ins.error;
      return resposta({ ok: true, bloco: i, gerado: true, creditos: Math.ceil(blocos[i].length * m.porLetra), duracao });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
});
