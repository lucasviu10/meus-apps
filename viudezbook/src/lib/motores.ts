// Catálogo de todas as vozes do app, num lugar só.
import { chamarFuncao } from "./supabase";
import type { Voz } from "./tipos";

// Vozes em português do Brasil disponíveis no Piper.
export const VOZES_PIPER = [
  { voz_id: "pt_BR-faber-medium", nome: "Faber (masculina, qualidade média)" },
  { voz_id: "pt_BR-edresson-low", nome: "Edresson (masculina, mais leve e rápida)" },
];

export type Motor = "piper" | "elevenlabs";

export interface OpcaoMotor {
  modelo: string; // o que fica salvo no livro e nos áudios
  motor: Motor;
  nome: string;
  resumo: string;
  local?: boolean; // gera no celular
}

export const MOTORES: OpcaoMotor[] = [
  { modelo: "piper", motor: "piper", nome: "Piper", resumo: "Grátis e ilimitada. Gera no celular.", local: true },
  { modelo: "eleven_multilingual_v2", motor: "elevenlabs", nome: "ElevenLabs · mais natural", resumo: "A mais humana. Plano grátis: ~10 mil letras por mês." },
  { modelo: "eleven_flash_v2_5", motor: "elevenlabs", nome: "ElevenLabs · econômico", resumo: "Rende o dobro do plano grátis." },
];

export const opcao = (modelo: string) => MOTORES.find((m) => m.modelo === modelo) ?? MOTORES[0];

let cacheMotores: Promise<Record<string, boolean>> | null = null;

/** Quais serviços têm chave cadastrada no Supabase. O Piper sempre está disponível. */
export function motoresDisponiveis(): Promise<Record<string, boolean>> {
  if (!cacheMotores) {
    cacheMotores = chamarFuncao<{ motores: Record<string, boolean> }>("gerar-voz", { acao: "motores" })
      .then((r) => ({ ...r.motores, piper: true }))
      .catch(() => ({ piper: true }));
  }
  return cacheMotores;
}

const cacheVozes = new Map<Motor, Promise<Voz[]>>();

/** Esquece as listas de vozes (ex.: depois de criar a sua voz). */
export function limparCacheVozes() {
  cacheVozes.clear();
}

export function vozesDoMotor(motor: Motor): Promise<Voz[]> {
  if (motor === "piper") {
    return Promise.resolve(VOZES_PIPER.map((v) => ({ ...v, categoria: "grátis", idioma: "pt", sotaque: null, genero: "male", amostra_url: null })));
  }
  if (!cacheVozes.has(motor)) {
    const p = chamarFuncao<{ vozes: Voz[] }>("gerar-voz", { acao: "vozes", motor }).then((r) => r.vozes);
    p.catch(() => cacheVozes.delete(motor));
    cacheVozes.set(motor, p);
  }
  return cacheVozes.get(motor)!;
}

export const TEXTO_AMOSTRA =
  "Era uma manhã calma na pequena cidade. — Bom dia! — disse o padeiro, abrindo a porta com um sorriso. " +
  "Ninguém imaginava que, naquele dia, uma simples carta mudaria a vida de todos.";

/** Gera uma amostra curta e devolve um endereço para tocar. */
export async function gerarAmostra(modelo: string, vozId: string, texto: string, progresso?: (m: string) => void): Promise<string> {
  const t = texto.trim().slice(0, 400);
  if (opcao(modelo).local) {
    const { sintetizarPiper } = await import("./piper");
    const { mp3 } = await sintetizarPiper(vozId, t, progresso);
    return URL.createObjectURL(mp3);
  }
  const r = await chamarFuncao<{ audio_base64: string }>("gerar-voz", { acao: "amostra", modelo, voz_id: vozId, texto: t });
  const bytes = Uint8Array.from(atob(r.audio_base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}
