import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = !!(url && chave);

export const supabase = createClient(url ?? "https://exemplo.supabase.co", chave ?? "sem-chave", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Chama uma função de servidor e devolve o JSON, com mensagem de erro em português. */
export async function chamarFuncao<T = any>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context as Response | undefined;
      const j = ctx ? await ctx.json() : null;
      if (j?.erro) msg = j.erro;
    } catch { /* mantém a mensagem original */ }
    if (/Failed to send|fetch/i.test(msg)) msg = "Sem conexão com o servidor. Confira a internet.";
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data as T;
}

export async function usuarioId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Faça login de novo.");
  return id;
}
