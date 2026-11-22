import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Os mesmos cabeçalhos da Vercel: deixam a voz grátis (Piper) usar todos os núcleos do celular.
const isolamento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022" },
  optimizeDeps: { esbuildOptions: { target: "es2022" }, exclude: ["@mintplex-labs/piper-tts-web", "onnxruntime-web"] },
  server: { headers: isolamento },
  preview: { headers: isolamento },
});
