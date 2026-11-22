// Copia os arquivos do OCR (Tesseract) para public/ocr, para o app não depender de sites de fora.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(raiz, "node_modules");
const destino = join(raiz, "public", "ocr");
mkdirSync(destino, { recursive: true });

const arquivos = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", "por.traineddata.gz"],
];
for (const [de, para] of arquivos) copyFileSync(join(nm, de), join(destino, para));
console.log("OCR pronto em public/ocr");
