// Grava a sua voz pelo microfone do celular, mede o volume e entrega um MP3.
import { Mp3Encoder } from "@breezystack/lamejs";

export interface Medida {
  nivel: number; // 0 a 1, volume agora
  segundos: number;
}

export interface Resultado {
  mp3: Blob;
  segundos: number;
  volumeMedio: number; // 0 a 1
  estourou: number; // fração do tempo com som alto demais
  silencio: number; // fração do tempo sem voz
}

export class Gravador {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private analisador: AnalyserNode | null = null;
  private pedacos: Blob[] = [];
  private inicio = 0;
  private quadro = 0;

  static disponivel() {
    return !!navigator.mediaDevices?.getUserMedia && "MediaRecorder" in window;
  }

  async comecar(aoMedir: (m: Medida) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, tipo ? { mimeType: tipo } : undefined);
    this.pedacos = [];
    this.rec.ondataavailable = (e) => e.data.size && this.pedacos.push(e.data);
    this.rec.start(1000);
    this.inicio = performance.now();

    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const fonte = this.ctx.createMediaStreamSource(this.stream);
    this.analisador = this.ctx.createAnalyser();
    this.analisador.fftSize = 2048;
    fonte.connect(this.analisador);
    const dados = new Float32Array(this.analisador.fftSize);
    const medir = () => {
      if (!this.analisador) return;
      this.analisador.getFloatTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) soma += v * v;
      aoMedir({ nivel: Math.min(1, Math.sqrt(soma / dados.length) * 4), segundos: (performance.now() - this.inicio) / 1000 });
      this.quadro = requestAnimationFrame(medir);
    };
    medir();
  }

  async parar(): Promise<Resultado> {
    cancelAnimationFrame(this.quadro);
    const rec = this.rec!;
    const fim = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.stop();
    await fim;
    this.stream?.getTracks().forEach((t) => t.stop());
    const bruto = new Blob(this.pedacos, { type: rec.mimeType });
    const ctx = this.ctx!;
    this.analisador = null;
    const audio = await ctx.decodeAudioData(await bruto.arrayBuffer());
    await ctx.close();
    this.ctx = null;
    return codificar(audio.getChannelData(0), audio.sampleRate);
  }

  cancelar() {
    cancelAnimationFrame(this.quadro);
    try {
      this.rec?.stop();
    } catch { /* já parado */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analisador = null;
  }
}

/** Mede a qualidade da gravação e converte para MP3 de boa qualidade. */
export function codificar(amostras: Float32Array, taxa: number): Resultado {
  const janela = Math.round(taxa * 0.05);
  let janelas = 0, silenciosas = 0, somaVoz = 0, comVoz = 0, estouros = 0;
  for (let i = 0; i < amostras.length; i += janela) {
    let soma = 0, pico = 0;
    const fim = Math.min(amostras.length, i + janela);
    for (let k = i; k < fim; k++) {
      soma += amostras[k] * amostras[k];
      pico = Math.max(pico, Math.abs(amostras[k]));
    }
    const rms = Math.sqrt(soma / (fim - i));
    janelas++;
    if (rms < 0.01) silenciosas++;
    else {
      somaVoz += rms;
      comVoz++;
    }
    if (pico > 0.98) estouros++;
  }

  const pcm = new Int16Array(amostras.length);
  for (let i = 0; i < amostras.length; i++) pcm[i] = Math.max(-1, Math.min(1, amostras[i])) * 32767;
  const enc = new Mp3Encoder(1, taxa, 128);
  const saida: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) saida.push(new Uint8Array(b));
  }
  const f = enc.flush();
  if (f.length) saida.push(new Uint8Array(f));

  return {
    mp3: new Blob(saida, { type: "audio/mpeg" }),
    segundos: amostras.length / taxa,
    volumeMedio: comVoz ? Math.min(1, (somaVoz / comVoz) * 4) : 0,
    estourou: janelas ? estouros / janelas : 0,
    silencio: janelas ? silenciosas / janelas : 1,
  };
}

/** Conselho simples sobre a gravação. Vazio = está boa. */
export function avaliar(r: Resultado): string[] {
  const avisos: string[] = [];
  if (r.segundos < 45) avisos.push("Ficou curta. Leia o texto inteiro (o ideal é de 1 a 2 minutos).");
  if (r.volumeMedio < 0.08) avisos.push("Volume baixo. Fale um pouco mais alto ou aproxime o celular (uns 20 cm).");
  if (r.estourou > 0.02) avisos.push("Som estourado em alguns trechos. Afaste um pouco o celular.");
  if (r.silencio > 0.6) avisos.push("Muito silêncio na gravação. Leia sem pausas longas.");
  return avisos;
}

// Texto para ler: mistura narração, diálogo, pergunta e números, para a voz aprender o seu jeito.
export const TEXTO_PARA_LER = [
  "Olá! Esta é a minha voz, gravada para o Viudezbook. Vou ler com calma, do meu jeito de sempre, como se estivesse contando uma história para um amigo.",
  "Naquela manhã, a cidade acordou devagar. O padeiro abriu a porta, o cheiro de pão quente tomou a rua e as crianças passaram correndo para a escola.",
  "— Você viu o que aconteceu ontem? — perguntou a vizinha, curiosa. — Vi, sim! Ninguém esperava por aquilo — respondeu ele, rindo.",
  "Às vezes a gente só precisa de um bom livro, de um café e de um pouco de silêncio. É nessas horas que as ideias aparecem e tudo começa a fazer sentido.",
  "Em mil novecentos e oito, numa terça-feira, chegaram três cartas e duas encomendas. Uma delas trazia um bilhete curto: volte logo, estamos esperando.",
  "Será que amanhã vai chover? Talvez. Mas, aconteça o que acontecer, a história continua no próximo capítulo.",
];
