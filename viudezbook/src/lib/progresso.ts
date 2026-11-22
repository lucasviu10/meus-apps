// Onde parei: salvo no banco (vale em qualquer aparelho) e no celular (vale sem internet).
import { supabase, usuarioId } from "./supabase";
import type { Progresso } from "./tipos";

const chaveLocal = (livroId: string) => `vb-progresso-${livroId}`;

function aparelho(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  return "Computador";
}

export async function lerProgresso(livroId: string): Promise<Progresso | null> {
  let local: Progresso | null = null;
  try {
    const s = localStorage.getItem(chaveLocal(livroId));
    if (s) local = JSON.parse(s);
  } catch { /* sem armazenamento local */ }
  const { data } = await supabase.from("vb_progresso").select("*").eq("livro_id", livroId).maybeSingle();
  const nuvem = data as Progresso | null;
  if (!nuvem) return local;
  if (!local) return nuvem;
  return new Date(local.atualizado_em) > new Date(nuvem.atualizado_em) ? local : nuvem;
}

export async function salvarProgresso(p: Omit<Progresso, "atualizado_em">) {
  const completo: Progresso = { ...p, atualizado_em: new Date().toISOString() };
  try {
    localStorage.setItem(chaveLocal(p.livro_id), JSON.stringify(completo));
  } catch { /* sem armazenamento local */ }
  try {
    const uid = await usuarioId();
    await supabase
      .from("vb_progresso")
      .upsert({ ...completo, usuario_id: uid, aparelho: aparelho() }, { onConflict: "usuario_id,livro_id" });
  } catch { /* sem internet: fica o salvo no celular e sobe na próxima vez */ }
}
