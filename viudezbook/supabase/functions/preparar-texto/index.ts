// preparar-texto: recebe o texto de cada página do PDF (extraído no celular,
// com OCR quando a página é imagem), limpa e divide em capítulos.
import { clienteDoUsuario, cors, erro, resposta, salvarCapitulos } from "../_shared/servidor.ts";
import { dividirCapitulos, limparPaginas } from "../_shared/texto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cli = await clienteDoUsuario(req);
  if (cli instanceof Response) return cli;
  const { db } = cli;

  let corpo: { livro_id?: string; paginas?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido.");
  }
  const { livro_id, paginas } = corpo;
  if (!livro_id || !Array.isArray(paginas)) return erro("Faltou o livro ou as páginas.");

  const { data: livro } = await db.from("vb_livros").select("id").eq("id", livro_id).maybeSingle();
  if (!livro) return erro("Livro não encontrado.", 404);

  try {
    const texto = limparPaginas(paginas.map((p) => String(p ?? "")));
    if (texto.length < 50) {
      await db.from("vb_livros").update({ estado: "erro", erro: "Não achei texto no PDF." }).eq("id", livro_id);
      return erro("Não consegui ler texto nesse PDF.");
    }
    const capitulos = dividirCapitulos(texto);
    const r = await salvarCapitulos(db, livro_id, capitulos);
    return resposta({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("vb_livros").update({ estado: "erro", erro: msg }).eq("id", livro_id);
    return erro("Falhou ao preparar o texto: " + msg, 500);
  }
});
