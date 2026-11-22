import { useEffect, useRef, useState } from "react";
import { supabase, usuarioId } from "../lib/supabase";
import { Gravador, Resultado, TEXTO_PARA_LER, avaliar } from "../lib/gravador";
import { fmtTempo } from "../lib/tipos";
import { ir } from "../App";

interface Gravacao { nome: string; caminho: string; url?: string }

export default function MinhaVoz() {
  const [autorizo, setAutorizo] = useState(false);
  const [estado, setEstado] = useState<"parado" | "gravando" | "processando">("parado");
  const [nivel, setNivel] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [urlNova, setUrlNova] = useState("");
  const [salvas, setSalvas] = useState<Gravacao[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const gravador = useRef<Gravador | null>(null);

  async function listar() {
    const uid = await usuarioId();
    const { data } = await supabase.storage.from("vb-audios").list(`${uid}/minha-voz`, { sortBy: { column: "name", order: "desc" } });
    const lista = (data ?? []).filter((f) => f.name.endsWith(".mp3")).map((f) => ({ nome: f.name, caminho: `${uid}/minha-voz/${f.name}` }));
    if (lista.length) {
      const { data: urls } = await supabase.storage.from("vb-audios").createSignedUrls(lista.map((l) => l.caminho), 3600);
      lista.forEach((l, i) => ((l as Gravacao).url = urls?.[i]?.signedUrl ?? undefined));
    }
    setSalvas(lista);
  }

  useEffect(() => {
    listar();
    return () => gravador.current?.cancelar();
  }, []);

  async function gravar() {
    setErro("");
    setMsg("");
    setResultado(null);
    setUrlNova("");
    try {
      const g = new Gravador();
      gravador.current = g;
      await g.comecar((m) => {
        setNivel(m.nivel);
        setTempo(m.segundos);
      });
      setEstado("gravando");
    } catch (e) {
      setErro(/Permission|NotAllowed/i.test(String(e)) ? "O celular não liberou o microfone. Toque no cadeado ao lado do endereço e permita o Microfone." : String(e));
    }
  }

  async function parar() {
    setEstado("processando");
    try {
      const r = await gravador.current!.parar();
      setResultado(r);
      setUrlNova(URL.createObjectURL(r.mp3));
    } catch (e) {
      setErro("Não consegui processar a gravação: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEstado("parado");
      setNivel(0);
    }
  }

  async function salvar() {
    if (!resultado) return;
    const uid = await usuarioId();
    const caminho = `${uid}/minha-voz/${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`;
    const up = await supabase.storage.from("vb-audios").upload(caminho, resultado.mp3, { contentType: "audio/mpeg" });
    if (up.error) return setErro(up.error.message);
    setResultado(null);
    setUrlNova("");
    setMsg("Gravação guardada na sua conta.");
    listar();
  }

  async function apagar(g: Gravacao) {
    if (!confirm("Apagar esta gravação?")) return;
    await supabase.storage.from("vb-audios").remove([g.caminho]);
    listar();
  }

  const avisos = resultado ? avaliar(resultado) : [];

  return (
    <main className="tela">
      <header className="topo">
        <button className="icone" onClick={() => ir("")} aria-label="Voltar">←</button>
        <h2>Minha voz</h2>
        <span />
      </header>

      <section className="cartao">
        <p>Grave você lendo o texto abaixo, de 1 a 2 minutos. A gravação fica guardada para criar uma voz igual à sua, de graça, na próxima etapa.</p>
        <ul className="dicas pequeno">
          <li>Lugar silencioso, sem TV ou ventilador.</li>
          <li>Celular a uns 20 cm da boca.</li>
          <li>Leia no seu tom normal, como se contasse uma história.</li>
        </ul>
        <label className="marcar">
          <input type="checkbox" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} />
          <span>Esta é a <strong>minha própria voz</strong> e autorizo usar só na minha conta.</span>
        </label>
      </section>

      <section className="cartao texto-ler">
        {TEXTO_PARA_LER.map((p, i) => <p key={i}>{p}</p>)}
      </section>

      <section className="cartao barra-gravar">
        {estado === "gravando" ? (
          <>
            <div className="linha"><span className="gravando">● Gravando</span><strong>{fmtTempo(tempo)}</strong></div>
            <div className="barra medidor"><div style={{ width: `${Math.round(nivel * 100)}%` }} /></div>
            <button className="botao" onClick={parar}>■ Parar</button>
          </>
        ) : (
          <button className="botao" disabled={!autorizo || estado === "processando" || !Gravador.disponivel()} onClick={gravar}>
            {estado === "processando" ? "Preparando…" : resultado ? "● Gravar de novo" : "● Começar a gravar"}
          </button>
        )}
        {!Gravador.disponivel() && <p className="erro pequeno">Este navegador não deixa gravar. Use o Chrome.</p>}

        {resultado && urlNova && (
          <>
            <p className="pequeno">Gravação: <strong>{fmtTempo(resultado.segundos)}</strong></p>
            <audio className="amostra" controls src={urlNova} />
            {avisos.length ? (
              avisos.map((a) => <p key={a} className="aviso pequeno">⚠ {a}</p>)
            ) : (
              <p className="ok pequeno">✓ Gravação boa.</p>
            )}
            <button className="botao" onClick={salvar}>Guardar gravação</button>
          </>
        )}
        {msg && <p className="ok">{msg}</p>}
        {erro && <p className="erro">{erro}</p>}
      </section>

      {salvas.length > 0 && (
        <section className="cartao">
          <h3>Gravações guardadas</h3>
          {salvas.map((g) => (
            <div key={g.caminho} className="linha-voz">
              <div className="linha">
                <span className="pequeno">{g.nome.replace(/\.mp3$/, "").slice(0, 16).replace("T", " ")}</span>
                <button className="link perigo" onClick={() => apagar(g)}>Apagar</button>
              </div>
              {g.url && <audio className="amostra" controls preload="none" src={g.url} />}
            </div>
          ))}
          <p className="fraco pequeno">
            As gravações ficam guardadas na sua conta. Na próxima etapa, elas vão gerar a sua voz de graça (pelo Kaggle) para ler os livros.
          </p>
        </section>
      )}
    </main>
  );
}
