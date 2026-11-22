// Duração exata de um MP3, lendo os quadros (serve para qualquer qualidade).

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  // MPEG-2 / 2.5 Layer III
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const TAXAS: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

export function duracaoMp3(b: Uint8Array): number {
  let i = 0;
  // pula etiqueta ID3
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  let segundos = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versao = (b[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const camada = (b[i + 1] >> 1) & 0x03; // 1 = Layer III
    const indBit = (b[i + 2] >> 4) & 0x0f;
    const indTaxa = (b[i + 2] >> 2) & 0x03;
    const enchimento = (b[i + 2] >> 1) & 0x01;
    if (versao === 1 || camada !== 1 || indBit === 0 || indBit === 15 || indTaxa === 3) {
      i++;
      continue;
    }
    const kbps = BITRATES[versao === 3 ? "1" : "2"][indBit];
    const taxa = TAXAS[versao][indTaxa];
    const amostras = versao === 3 ? 1152 : 576;
    const tamanho = Math.floor(((amostras / 8) * kbps * 1000) / taxa) + enchimento;
    if (tamanho < 4) {
      i++;
      continue;
    }
    segundos += amostras / taxa;
    i += tamanho;
  }
  return segundos;
}
