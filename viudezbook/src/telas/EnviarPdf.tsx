import { useState } from "react";
import { supabase } from "../lib/supabase";
import { enviarPdf, textoDoErro } from "../lib/envios";
import { ir } from "../App";

export default function EnviarPdf() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function escolher(f: File | null) {
    setArquivo(f);
    setErro("");
    setAviso("");
    if (f && !titulo) setTitulo(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    setErro("");
    setOcupado(true);
    try {
      const { data: iguais } = await supabase.from("vb_livros").select("id").ilike("titulo", titulo.trim());
      if (iguais?.length && !aviso) {
        setAviso("Já existe um livro com esse título na biblioteca. Toque em “Enviar PDF” de novo para adicionar mesmo assim.");
        return;
      }
      // Começa a tarefa de fundo e já vai para a biblioteca: o envio continua sozinho.
      await enviarPdf(arquivo, titulo, autor);
      ir("");
    } catch (err) {
      setErro(textoDoErro(err));
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
        <button className="botao" disabled={!arquivo || ocupado}>{ocupado ? "Começando…" : "Enviar PDF"}</button>
        {aviso && <p className="aviso">{aviso}</p>}
        {erro && <p className="erro">{erro}</p>}
        <p className="fraco pequeno">O envio continua em segundo plano: pode trocar de tela. O andamento aparece no topo do app.</p>
      </form>
      <p className="fraco pequeno margem">
        Use só PDFs que são seus (comprados ou de domínio público). Ficam na sua conta, para uso pessoal, e o áudio nunca é
        compartilhado. PDF escaneado (foto da página) passa por OCR, que pode errar algumas palavras.
      </p>
    </main>
  );
}
