import { useEffect, useState } from "react";
import { chamarFuncao, supabase } from "../lib/supabase";
import { fmtNum } from "../lib/tipos";

type Provedor = "gemini";
interface Estado { estado: "gerando" | "pronto" | "erro"; provedor: Provedor; palavras: number | null; erro: string | null; capitulo_id: string | null }
interface Estimativa { letras: number; custo_usd: number; gratis: boolean }


export default function ResumoCard({ livroId, aoFicarPronto }: { livroId: string; aoFicarPronto: () => void }) {
  const [disp, setDisp] = useState<Record<Provedor, boolean> | null>(null);
  const provedor: Provedor = "gemini";
  const [estado, setEstado] = useState<Estado | null>(null);
  const [est, setEst] = useState<Estimativa | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function lerEstado() {
    const { data } = await supabase.from("vb_resumos").select("estado, provedor, palavras, erro, capitulo_id").eq("livro_id", livroId).maybeSingle();
    setEstado((data as Estado) ?? null);
    return data as Estado | null;
  }

  useEffect(() => {
    lerEstado();
    chamarFuncao<{ gemini: boolean }>("resumir", { acao: "provedores" })
      .then((r) => setDisp({ gemini: r.gemini }))
      .catch(() => setDisp({ gemini: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livroId]);

  // Enquanto escreve, confere a cada 5 segundos.
  useEffect(() => {
    if (estado?.estado !== "gerando") return;
    const t = setInterval(async () => {
      const e = await lerEstado();
      if (e?.estado === "pronto") aoFicarPronto();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.estado]);

  async function estimar() {
    setMsg("");
    setEst(null);
    try {
      setEst(await chamarFuncao<Estimativa>("resumir", { acao: "estimar", livro_id: livroId, provedor }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function gerar() {
    setMsg("");
    try {
      await chamarFuncao("resumir", { acao: "gerar", livro_id: livroId, provedor, confirmado: true });
      setEst(null);
      setTexto(null);
      await lerEstado();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function ler() {
    if (texto !== null) return setTexto(null);
    if (!estado?.capitulo_id) return;
    const { data } = await supabase.from("vb_capitulos").select("texto").eq("id", estado.capitulo_id).single();
    setTexto(data?.texto ?? "");
  }

  const nenhum = disp && !disp.gemini;
  const minutos = estado?.palavras ? Math.max(1, Math.round(estado.palavras / 150)) : null;

  return (
    <section className="cartao" aria-label="Resumo">
      <h3>Resumo em ~12 minutos</h3>

      {estado?.estado === "pronto" && (
        <>
          <p className="ok pequeno">
            ✓ Resumo pronto: {fmtNum(estado.palavras ?? 0)} palavras, cerca de {minutos} min ouvindo.
          </p>
          <p className="fraco pequeno">Ele aparece no topo da lista de capítulos como “★ Resumo”: gere a voz e ouça como um capítulo.</p>
          <button className="botao secundario" onClick={ler}>{texto === null ? "Ler o resumo" : "Esconder o texto"}</button>
          {texto !== null && <div className="texto-resumo">{texto.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
        </>
      )}

      {estado?.estado === "gerando" && <p className="aviso pequeno">Escrevendo o resumo… leva de 1 a 3 minutos. Pode sair desta tela.</p>}
      {estado?.estado === "erro" && <p className="erro pequeno">Não deu certo: {estado.erro}</p>}

      {nenhum && <p className="aviso pequeno">Falta cadastrar a chave grátis do Gemini no Supabase (passo a passo no README).</p>}

      {disp && !nenhum && estado?.estado !== "gerando" && (
        <>
          <p className="fraco pequeno">Quem escreve: Gemini (Google), grátis dentro da cota diária.</p>
          {!est ? (
            <button className="botao" onClick={estimar}>{estado?.estado === "pronto" ? "Refazer o resumo" : "Fazer resumo"}</button>
          ) : (
            <div className="confirmar-resumo">
              <p className="grande">Grátis</p>
              <p className="fraco pequeno">
                {fmtNum(est.letras)} letras do livro. Usa a cota grátis do Google (pode acabar no dia; aí é só tentar mais tarde).
              </p>
              <div className="acoes">
                <button className="botao secundario" onClick={() => setEst(null)}>Cancelar</button>
                <button className="botao" onClick={gerar}>Confirmar e gerar</button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="erro pequeno">{msg}</p>}
      <p className="fraco pequeno">O resumo é só para você ouvir (uso pessoal). Ele resume o que está no livro, mas pode errar detalhes.</p>
    </section>
  );
}
