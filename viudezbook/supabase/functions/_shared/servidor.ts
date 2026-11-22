// Peças comuns das funções de servidor.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { blocosDoCapitulo } from "./texto.ts";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function resposta(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function erro(mensagem: string, status = 400): Response {
  return resposta({ erro: mensagem }, status);
}

/**
 * Cliente do Supabase agindo COMO o usuário logado: a proteção RLS vale
 * aqui também, então uma função nunca mexe nos livros de outra pessoa.
 */
export async function clienteDoUsuario(
  req: Request,
): Promise<{ db: SupabaseClient; usuarioId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth) return erro("Faça login de novo.", 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) return erro("Faça login de novo.", 401);
  return { db, usuarioId: data.user.id };
}

export async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salva os capítulos de um livro (substitui os antigos) e atualiza o livro. */
export async function salvarCapitulos(
  db: SupabaseClient,
  livroId: string,
  capitulos: { numero: number; titulo: string; texto: string }[],
) {
  const del = await db.from("vb_capitulos").delete().eq("livro_id", livroId);
  if (del.error) throw del.error;
  const linhas = capitulos.map((c) => ({
    livro_id: livroId,
    numero: c.numero,
    titulo: c.titulo,
    texto: c.texto,
    caracteres: c.texto.length,
    blocos: blocosDoCapitulo(c.titulo, c.texto).length,
  }));
  for (let i = 0; i < linhas.length; i += 50) {
    const ins = await db.from("vb_capitulos").insert(linhas.slice(i, i + 50));
    if (ins.error) throw ins.error;
  }
  const total = linhas.reduce((s, c) => s + c.caracteres, 0);
  const up = await db
    .from("vb_livros")
    .update({ num_capitulos: linhas.length, total_caracteres: total, estado: "pronto", erro: null })
    .eq("id", livroId);
  if (up.error) throw up.error;
  return { capitulos: linhas.length, caracteres: total };
}
