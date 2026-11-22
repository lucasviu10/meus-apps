import { useEffect, useState } from "react";
import { chamarFuncao, supabase } from "../lib/supabase";
import { ir } from "../App";
import Capa from "./Capa";

interface Resultado {
  gutenberg_id: number;
  titulo: string;
  autor: string;
  morte_autor: number | null;
  idioma: string | null;
  capa_url: string | null;
  link_original: string;
  dominio_publico_brasil: boolean | null;
  downloads: number;
}

const IDIOMAS = [
  { id: "pt", nome: "Português" },
  { id: "en", nome: "Inglês" },
  { id: "es", nome: "Espanhol" },
  { id: "fr", nome: "Francês" },
  { id: "todos", nome: "Todos" },
];

export default function Descobrir() {
  const [termo, setTermo] = useState("");
  const [idioma, setIdioma] = useState("pt");
  const [pagina, setPagina] = useState(1);
  const [res, setRes] = useState<Resultado[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [naBiblioteca, setNaBiblioteca] = useState<Map<string, string>>(new Map());
  const [adicionando, setAdicionando] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("vb_livros").select("id, link_original").not("link_original", "is", null).then(({ data }) => {
      setNaBiblioteca(new Map((data ?? []).map((l: any) => [l.link_original, l.id])));
    });
    buscar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idioma]);

  async function buscar(p: number) {
    setCarregando(true);
    setErro("");
    try {
      const r = await chamarFuncao<{ livros: Resultado[]; tem_mais: boolean }>("coletar-livro", { acao: "buscar", termo, idioma, pagina: p });
      setRes(p === 1 ? r.livros : [...res, ...r.livros]);
      setTemMais(r.tem_mais);
      setPagina(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  async function adicionar(l: Resultado) {
    setAdicionando(l.gutenberg_id);
    setErro("");
    try {
      const r = await chamarFuncao<{ livro_id: string }>("coletar-livro", { acao: "adicionar", gutenberg_id: l.gutenberg_id });
      setNaBiblioteca(new Map(naBiblioteca).set(l.link_original, r.livro_id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAdicionando(null);
    }
  }

  return (
    <main className="tela">
      <header className="topo">
        <button className="icone" onClick={() => ir("")} aria-label="Voltar">←</button>
        <h2>Descobrir</h2>
        <span />
      </header>

      <form className="busca" onSubmit={(e) => { e.preventDefault(); buscar(1); }}>
        <input type="search" placeholder="Título ou autor (ex.: Machado de Assis)" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <div className="linha">
          <select value={idioma} onChange={(e) => setIdioma(e.target.value)} aria-label="Idioma">
            {IDIOMAS.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
          <button className="botao">Buscar</button>
        </div>
      </form>

      <p className="aviso pequeno">
        Só aparecem livros que o Projeto Gutenberg marca como domínio público. No Brasil, a obra fica livre 70 anos
        depois da morte do autor. Cada livro guarda a fonte, o link e a data da coleta.
      </p>

      {erro && <p className="erro">{erro}</p>}
      {!termo && res.length > 0 && <h3 className="margem">Mais baixados</h3>}

      <ul className="lista-livros">
        {res.map((l) => {
          const id = naBiblioteca.get(l.link_original);
          return (
            <li key={l.gutenberg_id}>
              <div className="item-descobrir">
                <Capa livro={{ titulo: l.titulo, capa_url: l.capa_url }} tamanho={56} />
                <div className="info">
                  <strong>{l.titulo}</strong>
                  <span className="fraco">{l.autor}{l.morte_autor ? ` (†${l.morte_autor})` : ""}</span>
                  <span className="pequeno">
                    <span className="selo li">Domínio público</span>
                    {l.dominio_publico_brasil === false && <span className="aviso"> · conferir no Brasil</span>}
                  </span>
                </div>
                {id ? (
                  <button className="botao secundario pequeno" onClick={() => ir(`livro/${id}`)}>Abrir</button>
                ) : (
                  <button className="botao pequeno" disabled={adicionando !== null} onClick={() => adicionar(l)}>
                    {adicionando === l.gutenberg_id ? "Baixando…" : "Adicionar"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {carregando && <p className="fraco centro-texto">Buscando…</p>}
      {!carregando && res.length === 0 && !erro && <p className="fraco centro-texto">Nada encontrado. Tente outro nome.</p>}
      {temMais && !carregando && <button className="botao secundario largo" onClick={() => buscar(pagina + 1)}>Ver mais</button>}
    </main>
  );
}
