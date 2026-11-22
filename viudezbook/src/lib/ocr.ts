// OCR em português com Tesseract, carregado só quando precisa.
import type { Worker } from "tesseract.js";

let trabalhador: Promise<Worker> | null = null;

async function obter(): Promise<Worker> {
  if (!trabalhador) {
    // Arquivos do OCR servidos pelo próprio app (pasta public/ocr).
    trabalhador = import("tesseract.js").then((t) =>
      t.createWorker("por", t.OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        gzip: true,
      }),
    );
  }
  return trabalhador;
}

export async function lerImagemComOcr(canvas: HTMLCanvasElement): Promise<string> {
  const w = await obter();
  const { data } = await w.recognize(canvas);
  return data.text ?? "";
}

export async function encerrarOcr() {
  if (!trabalhador) return;
  const w = await trabalhador;
  trabalhador = null;
  await w.terminate();
}
