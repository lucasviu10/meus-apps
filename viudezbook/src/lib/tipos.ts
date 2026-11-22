export type Status = "quero_ler" | "ouvindo" | "li" | "abandonado";

export const NOME_STATUS: Record<Status, string> = {
  quero_ler: "Quero ler",
  ouvindo: "Ouvindo",
  li: "Li",
  abandonado: "Abandonado",
};

export interface Livro {
  id: string;
  titulo: string;
  autor: string | null;
  idioma: string | null;
  ano: number | null;
  capa_url: string | null;
  status: Status;
  favorito: boolean;
  nota: number | null;
  iniciado_em: string | null;
  terminado_em: string | null;
  num_capitulos: number;
  total_caracteres: number;
  voz_id: string | null;
  voz_nome: string | null;
  modelo: string;
  pdf_caminho: string | null;
  fonte: string | null;
  link_original: string | null;
  licenca: string | null;
  licenca_confirmada: boolean;
  coletado_em: string | null;
  estado: "novo" | "processando" | "pronto" | "erro";
  erro: string | null;
  criado_em: string;
}

export interface CapituloResumo {
  id: string;
  numero: number;
  titulo: string | null;
  caracteres: number;
  blocos: number;
}

export interface AudioBloco {
  id: string;
  capitulo_id: string;
  bloco: number;
  voz_id: string;
  modelo: string;
  caminho: string;
  duracao: number;
  gerado_em: string;
}

export interface Progresso {
  livro_id: string;
  capitulo_id: string | null;
  segundo: number;
  trecho: number;
  velocidade: number;
  modo: "elevenlabs" | "celular";
  atualizado_em: string;
}

export interface Voz {
  voz_id: string;
  nome: string;
  categoria: string;
  idioma: string | null;
  sotaque: string | null;
  genero: string | null;
  amostra_url: string | null;
}

export const fmtNum = (n: number) => n.toLocaleString("pt-BR");

export function fmtTempo(seg: number): string {
  if (!isFinite(seg) || seg < 0) seg = 0;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return (h ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

/** Duração aproximada de leitura: ~15 caracteres por segundo em voz natural. */
export const duracaoEstimada = (caracteres: number) => caracteres / 15;
