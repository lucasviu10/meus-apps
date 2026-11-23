import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Os mesmos cabeçalhos da Vercel: deixam a voz grátis (Piper) usar todos os núcleos do celular.
const isolamento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// Versão = data e hora do build (horário de Brasília), mostrada na tela de login.
const versao = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default defineConfig({
  plugins: [react()],
  define: { __VERSAO__: JSON.stringify(versao) },
  build: { target: "es2022" },
  optimizeDeps: { esbuildOptions: { target: "es2022" }, exclude: ["@mintplex-labs/piper-tts-web", "onnxruntime-web"] },
  server: { headers: isolamento },
  preview: { headers: isolamento },
});
