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
    // Se não conseguir começar, esquece a tentativa para poder tentar de novo depois.
    trabalhador.catch(() => {
      trabalhador = null;
    });
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
  const t = trabalhador;
  trabalhador = null;
  try {
    const w = await t;
    await w.terminate();
  } catch {
    /* o OCR nem tinha começado */
  }
}
