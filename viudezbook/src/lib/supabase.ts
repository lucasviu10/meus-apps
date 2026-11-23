import { createClient } from "@supabase/supabase-js";

// Endereço e chave PÚBLICA (anon) do projeto meus-apps. São públicos por natureza:
// quem protege os dados é a regra RLS no banco. Variáveis de ambiente só valem
// se forem diferentes daqui por um motivo (ex.: testes).
const PADRAO_URL = "https://janvqfbjxgfslwxzlurd.supabase.co";
const PADRAO_CHAVE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphbnZxZmJqeGdmc2x3eHpsdXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNTE1NzQsImV4cCI6MjEwOTkyNzU3NH0.cWZ9NZpXCqG8uRuTQBWAxavFjnmx3ABDgNHeakAgbew";

const urlEnv = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const chaveEnv = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.replace(/\s+/g, "");
// Só usa a variável de ambiente se ela apontar para OUTRO projeto (ex.: testes locais).
const usarEnv = !!(urlEnv && chaveEnv && urlEnv !== PADRAO_URL);
const url = usarEnv ? urlEnv : PADRAO_URL;
const chave = usarEnv ? chaveEnv : PADRAO_CHAVE;

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
