import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Livro, NOME_STATUS, Status, fmtNum } from "../lib/tipos";
import { ir } from "../App";
import Logo from "./Logo";
import Capa from "./Capa";

type Aba = "todos" | Status | "favoritos";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "ouvindo", nome: "Ouvindo" },
  { id: "quero_ler", nome: "Quero ler" },
  { id: "li", nome: "Li" },
  { id: "favoritos", nome: "★ Favoritos" },
];

interface Achado { livro_id: string; titulo: string | null; numero: number }

export default function Biblioteca({ email }: { email: string }) {
  const [livros, setLivros] = useState<Livro[] | null>(null);
  const [continuar, setContinuar] = useState<{ livro_id: string; atualizado_em: string } | null>(null);
  const [aba, setAba] = useState<Aba>(() => (sessionStorage.getItem("vb-aba") as Aba) || "todos");
  const [busca, setBusca] = useState("");
  const [noTexto, setNoTexto] = useState<Achado[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("vb_livros").select("*").order("criado_em", { ascending: false });
      if (error) setErro(error.message);
      setLivros((data as Livro[]) ?? []);
      const p = await supabase.from("vb_progresso").select("livro_id, atualizado_em").order("atualizado_em", { ascending: false }).limit(1);
      setContinuar(p.data?.[0] ?? null);
    })();
  }, []);

  useEffect(() => sessionStorage.setItem("vb-aba", aba), [aba]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (livros ?? []).filter((l) => {
      if (aba === "favoritos" && !l.favorito) return false;
      if (aba !== "todos" && aba !== "favoritos" && l.status !== aba) return false;
      if (!t) return true;
      return l.titulo.toLowerCase().includes(t) || (l.autor ?? "").toLowerCase().includes(t);
    });
  }, [livros, aba, busca]);

  async function buscarNoTexto() {
    const t = busca.trim();
    if (!t) return;
    const { data, error } = await supabase
      .from("vb_capitulos")
      .select("livro_id, titulo, numero")
      .textSearch("busca", t, { type: "websearch", config: "portuguese" })
      .limit(30);
    if (error) setErro(error.message);
    setNoTexto((data as Achado[]) ?? []);
  }

  async function exportar() {
    const [l, p] = await Promise.all([
      supabase.from("vb_livros").select("*"),
      supabase.from("vb_progresso").select("*"),
    ]);
    const arquivo = new Blob(
      [JSON.stringify({ app: "Viudezbook", exportado_em: new Date().toISOString(), livros: l.data, progresso: p.data }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(arquivo);
    a.download = `viudezbook-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMenu(false);
  }

  const livroContinuar = continuar && livros?.find((l) => l.id === continuar.livro_id);
  const porId = new Map((livros ?? []).map((l) => [l.id, l]));

  return (
    <main className="tela">
      <header className="topo">
        <div className="marca-linha">
          <Logo tamanho={34} />
          <span className="marca">Viudezbook</span>
        </div>
        <button className="icone" aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button>
      </header>
      {menu && (
        <div className="cartao menu">
          <p className="fraco pequeno">Conectado como {email}</p>
          <button className="botao secundario" onClick={exportar}>Exportar biblioteca</button>
          <button className="botao secundario" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      )}

      <div className="busca">
        <input
          type="search"
          placeholder="Buscar por título ou autor"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setNoTexto(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && buscarNoTexto()}
        />
        {busca.trim() && (
          <button className="link" onClick={buscarNoTexto}>Buscar “{busca.trim()}” dentro dos livros</button>
        )}
      </div>

      {noTexto && (
        <section className="cartao">
          <h3>Dentro dos livros</h3>
          {noTexto.length === 0 && <p className="fraco">Nada encontrado no texto.</p>}
          {noTexto.map((a, i) => (
            <button key={i} className="linha-lista" onClick={() => ir(`livro/${a.livro_id}`)}>
              <strong>{porId.get(a.livro_id)?.titulo ?? "Livro"}</strong>
              <span className="fraco"> · Cap. {a.numero} {a.titulo ? `— ${a.titulo}` : ""}</span>
            </button>
          ))}
        </section>
      )}

      {livroContinuar && !busca && (
        <button className="cartao continuar" onClick={() => ir(`ouvir/${livroContinuar.id}`)}>
          <Capa livro={livroContinuar} tamanho={56} />
          <div>
            <span className="fraco pequeno">Continuar ouvindo</span>
            <strong>{livroContinuar.titulo}</strong>
          </div>
          <span className="play">▶</span>
        </button>
      )}

      <div className="acoes">
        <button className="botao" onClick={() => ir("descobrir")}>🔎 Descobrir livros</button>
        <button className="botao secundario" onClick={() => ir("enviar")}>＋ Enviar PDF</button>
      </div>

      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
            {a.nome}
          </button>
        ))}
      </nav>

      {erro && <p className="erro">{erro}</p>}
      {livros === null && <p className="fraco">Carregando…</p>}
      {livros?.length === 0 && (
        <div className="cartao vazio">
          <p><strong>Sua biblioteca está vazia.</strong></p>
          <p className="fraco">Toque em <strong>Descobrir livros</strong> para pesquisar clássicos em domínio público, ou em <strong>Enviar PDF</strong>.</p>
        </div>
      )}
      {livros && livros.length > 0 && filtrados.length === 0 && <p className="fraco">Nenhum livro aqui.</p>}

      <ul className="lista-livros">
        {filtrados.map((l) => (
          <li key={l.id}>
            <button onClick={() => ir(`livro/${l.id}`)}>
              <Capa livro={l} tamanho={64} />
              <div className="info">
                <strong>{l.titulo}</strong>
                <span className="fraco">{l.autor ?? "Autor desconhecido"}</span>
                <span className="pequeno">
                  <span className={`selo ${l.status}`}>{NOME_STATUS[l.status]}</span>
                  {l.estado === "processando" && <span className="fraco"> · preparando…</span>}
                  {l.estado === "erro" && <span className="erro"> · erro</span>}
                  {l.estado === "pronto" && <span className="fraco"> · {l.num_capitulos} cap. · {fmtNum(Math.round(l.total_caracteres / 1000))} mil letras</span>}
                </span>
              </div>
              {l.favorito && <span className="estrela">★</span>}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
