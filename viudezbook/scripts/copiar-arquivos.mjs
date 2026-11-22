// Copia para public/ os arquivos pesados que o app usa no celular (OCR e voz grátis Piper),
// para não depender de sites de fora. Roda antes do build.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(raiz, "node_modules");

function copiar(lista, pasta) {
  const destino = join(raiz, "public", pasta);
  mkdirSync(destino, { recursive: true });
  for (const [de, para] of lista) copyFileSync(join(nm, de), join(destino, para));
}

copiar([
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", "por.traineddata.gz"],
], "ocr");

const ort = readdirSync(join(nm, "onnxruntime-web/dist"))
  .filter((f) => /^ort-wasm(-simd)?(-threaded)?\.wasm$/.test(f))
  .map((f) => [`onnxruntime-web/dist/${f}`, `ort/${f}`]);
mkdirSync(join(raiz, "public", "piper", "ort"), { recursive: true });
copiar([
  ...ort,
  ["@diffusionstudio/piper-wasm/build/piper_phonemize.wasm", "piper_phonemize.wasm"],
  ["@diffusionstudio/piper-wasm/build/piper_phonemize.data", "piper_phonemize.data"],
], "piper");
console.log("OCR e Piper prontos em public/");
