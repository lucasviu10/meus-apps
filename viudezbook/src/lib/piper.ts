// Voz grátis e ilimitada: Piper (código aberto), gerada no próprio celular.
// Na 1ª vez baixa a voz (dezenas de MB) e guarda no aparelho; depois funciona sem internet.
// O resultado vira MP3, então toca como música, com a tela apagada.
import { Mp3Encoder } from "@breezystack/lamejs";

const CAMINHOS = {
  onnxWasm: "/piper/ort/",
  piperData: "/piper/piper_phonemize.data",
  piperWasm: "/piper/piper_phonemize.wasm",
};

type Progresso = (mensagem: string) => void;

let sessao: { voz: string; s: any } | null = null;

async function obterSessao(voz: string, progresso?: Progresso) {
  if (sessao?.voz === voz) return sessao.s;
  const piper = await import("@mintplex-labs/piper-tts-web");
  // A biblioteca guarda uma sessão única e não troca de voz sozinha: zeramos para trocar.
  (piper.TtsSession as any)._instance = null;
  progresso?.("Preparando a voz grátis… (na 1ª vez baixa a voz, use Wi-Fi)");
  const s = await piper.TtsSession.create({
    voiceId: voz,
    wasmPaths: CAMINHOS,
    progress: (p: { loaded: number; total: number }) => {
      if (p.total) progresso?.(`Baixando a voz: ${Math.round((p.loaded / p.total) * 100)}%`);
    },
  });
  sessao = { voz, s };
  return s;
}

/** Lê o WAV de 16 bits que o Piper devolve. */
function lerWav(buf: ArrayBuffer): { pcm: Int16Array; taxa: number } {
  const v = new DataView(buf);
  const taxa = v.getUint32(24, true);
  let pos = 12;
  while (pos + 8 <= buf.byteLength) {
    const id = v.getUint32(pos, false);
    const tam = v.getUint32(pos + 4, true);
    if (id === 0x64617461) return { pcm: new Int16Array(buf.slice(pos + 8, pos + 8 + tam)), taxa }; // "data"
    pos += 8 + tam;
  }
  return { pcm: new Int16Array(buf.slice(44)), taxa };
}

/** Para testes automáticos: troca a voz real por um som falso. */
type Falso = (texto: string) => Promise<ArrayBuffer>;
const falso = (): Falso | undefined => (import.meta.env.DEV ? (window as any).__vbPiperFalso : undefined);

function frases(texto: string): { frase: string; fimParagrafo: boolean }[] {
  const out: { frase: string; fimParagrafo: boolean }[] = [];
  for (const p of texto.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)) {
    const fs = p.match(/[^.!?…]+[.!?…]+["”»)]*|[^.!?…]+$/g) ?? [p];
    fs.map((f) => f.trim()).filter(Boolean).forEach((f, i, a) => out.push({ frase: f, fimParagrafo: i === a.length - 1 }));
  }
  return out;
}

/** Gera o áudio de um texto e devolve o MP3 e a duração em segundos. */
export async function sintetizarPiper(
  voz: string,
  texto: string,
  progresso?: Progresso,
): Promise<{ mp3: Blob; duracao: number }> {
  const f = falso();
  let s: any = null;
  if (!f) {
    try {
      s = await obterSessao(voz, progresso);
    } catch (e) {
      sessao = null;
      throw new Error("Não consegui baixar a voz grátis. Na 1ª vez ela precisa de internet (de preferência Wi-Fi). Detalhe: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  const pedacos: Int16Array[] = [];
  let taxa = 22050;
  const lista = frases(texto);
  for (let i = 0; i < lista.length; i++) {
    const { frase, fimParagrafo } = lista[i];
    const wav = f ? await f(frase) : await (await s.predict(frase)).arrayBuffer();
    const { pcm, taxa: t } = lerWav(wav);
    taxa = t;
    pedacos.push(pcm);
    // pausa natural: curta entre frases, maior entre parágrafos
    pedacos.push(new Int16Array(Math.round(taxa * (fimParagrafo ? 0.6 : 0.25))));
  }

  const enc = new Mp3Encoder(1, taxa, 64);
  const saida: Uint8Array[] = [];
  let amostras = 0;
  for (const p of pedacos) {
    amostras += p.length;
    for (let i = 0; i < p.length; i += 1152) {
      const b = enc.encodeBuffer(p.subarray(i, i + 1152));
      if (b.length) saida.push(new Uint8Array(b));
    }
  }
  const fim = enc.flush();
  if (fim.length) saida.push(new Uint8Array(fim));
  return { mp3: new Blob(saida, { type: "audio/mpeg" }), duracao: amostras / taxa };
}
