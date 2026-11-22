import { useState } from "react";
import { chamarFuncao, supabase, usuarioId } from "../lib/supabase";
import { ir } from "../App";

export default function EnviarPdf() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [passo, setPasso] = useState("");
  const [fracao, setFracao] = useState(0);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function escolher(f: File | null) {
    setArquivo(f);
    setErro("");
    setAviso("");
    if (f && !titulo) setTitulo(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim());
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    setErro("");
    setOcupado(true);
    let livroId: string | null = null;
    try {
      // Duplicado?
      const { data: iguais } = await supabase.from("vb_livros").select("id").ilike("titulo", titulo.trim());
      if (iguais?.length && !aviso) {
        setAviso("Já existe um livro com esse título na biblioteca. Toque em “Enviar PDF” de novo para adicionar mesmo assim.");
        setOcupado(false);
        return;
      }

      setPasso("Lendo o PDF…");
      const { extrairPaginas } = await import("../lib/pdf");
      const { paginas, paginasComOcr } = await extrairPaginas(arquivo, (m, f) => {
        setPasso(m);
        setFracao(f);
      });

      setPasso("Guardando o PDF na nuvem…");
      const uid = await usuarioId();
      const { data: livro, error } = await supabase
        .from("vb_livros")
        .insert({
          titulo: titulo.trim() || "Sem título",
          autor: autor.trim() || null,
          status: "quero_ler",
          fonte: "Upload pessoal",
          licenca: "Uso pessoal: PDF enviado por mim. O áudio gerado não é compartilhado.",
          licenca_confirmada: false,
          coletado_em: new Date().toISOString(),
          estado: "processando",
        })
        .select("id")
        .single();
      if (error) throw error;
      livroId = livro.id;

      const caminho = `${uid}/${livro.id}.pdf`;
      const up = await supabase.storage.from("vb-pdfs").upload(caminho, arquivo, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error("Não consegui guardar o PDF: " + up.error.message);
      await supabase.from("vb_livros").update({ pdf_caminho: caminho }).eq("id", livro.id);

      setPasso(paginasComOcr ? `Limpando o texto (${paginasComOcr} páginas lidas com OCR)…` : "Limpando o texto e dividindo em capítulos…");
      await chamarFuncao("preparar-texto", { livro_id: livro.id, paginas });
      ir(`livro/${livro.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
      if (livroId) await supabase.from("vb_livros").update({ estado: "erro", erro: msg }).eq("id", livroId);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="tela">
      <header className="topo">
        <button className="icone" onClick={() => ir("")} aria-label="Voltar">←</button>
        <h2>Enviar PDF</h2>
        <span />
      </header>
      <form className="cartao" onSubmit={enviar}>
        <label className="arquivo">
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => escolher(e.target.files?.[0] ?? null)} disabled={ocupado} />
          <span>{arquivo ? `📄 ${arquivo.name}` : "Toque para escolher o PDF"}</span>
        </label>
        <label htmlFor="titulo">Título</label>
        <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required disabled={ocupado} />
        <label htmlFor="autor">Autor (opcional)</label>
        <input id="autor" value={autor} onChange={(e) => setAutor(e.target.value)} disabled={ocupado} />
        <button className="botao" disabled={!arquivo || ocupado}>{ocupado ? "Trabalhando…" : "Enviar PDF"}</button>

        {passo && ocupado && (
          <div className="progresso">
            <div className="barra"><div style={{ width: `${Math.round(fracao * 100)}%` }} /></div>
            <p className="fraco pequeno">{passo}</p>
            <p className="fraco pequeno">Deixe esta tela aberta até terminar.</p>
          </div>
        )}
        {aviso && <p className="aviso">{aviso}</p>}
        {erro && <p className="erro">{erro}</p>}
      </form>
      <p className="fraco pequeno margem">
        PDF que você comprou é só para uso pessoal: o áudio gerado dele fica na sua conta e nunca é compartilhado.
        PDF escaneado (foto da página) passa por OCR, que pode errar algumas palavras.
      </p>
    </main>
  );
}
