// Fila de geração de voz. Continua rodando mesmo se você trocar de tela,
// e avisa o player quando um bloco novo fica pronto ("ouvir já").
import { chamarFuncao } from "./supabase";

export interface EstadoGeracao {
  capituloId: string;
  total: number;
  feitos: number;
  gerando: boolean;
  creditos: number;
  erro: string | null;
}

const estados = new Map<string, EstadoGeracao>();
const ouvintes = new Set<(capituloId: string) => void>();

export function estadoGeracao(capituloId: string): EstadoGeracao | undefined {
  return estados.get(capituloId);
}

export function assinarGeracao(fn: (capituloId: string) => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(id: string) {
  ouvintes.forEach((f) => f(id));
}

export async function gerarCapitulo(p: { capituloId: string; vozId: string; modelo: string; blocos: number }) {
  if (estados.get(p.capituloId)?.gerando) return;
  const est: EstadoGeracao = { capituloId: p.capituloId, total: p.blocos, feitos: 0, gerando: true, creditos: 0, erro: null };
  estados.set(p.capituloId, est);
  avisar(p.capituloId);
  try {
    for (let i = 0; i < p.blocos; i++) {
      const r = await chamarFuncao<{ creditos: number }>("gerar-voz", {
        acao: "gerar",
        capitulo_id: p.capituloId,
        voz_id: p.vozId,
        modelo: p.modelo,
        bloco: i,
        confirmado: true, // só chega aqui depois que você confirmou a estimativa
      });
      est.feitos = i + 1;
      est.creditos += r.creditos ?? 0;
      avisar(p.capituloId);
    }
  } catch (e) {
    est.erro = e instanceof Error ? e.message : String(e);
  } finally {
    est.gerando = false;
    avisar(p.capituloId);
  }
}
