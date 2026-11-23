// Faixa no topo de TODAS as telas: mostra envios de PDF e gerações de voz em andamento.
import { useEffect, useState } from "react";
import { assinarEnvios, esquecerEnvio, listarEnvios, algumEnvioAtivo } from "../lib/envios";
import { algumaGeracaoAtiva, assinarGeracao } from "../lib/geracao";
import { ir } from "../App";

export default function FaixaTarefas() {
  const [, setTique] = useState(0);

  useEffect(() => {
    const f = () => setTique((n) => n + 1);
    const a = assinarEnvios(f);
    const b = assinarGeracao(f);
    // Avisa antes de fechar o app no meio de uma tarefa.
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (algumEnvioAtivo() || algumaGeracaoAtiva()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", antesDeSair);
    return () => {
      a();
      b();
      window.removeEventListener("beforeunload", antesDeSair);
    };
  }, []);

  const envios = listarEnvios();
  const gerando = algumaGeracaoAtiva();
  if (!envios.length && !gerando) return null;

  return (
    <div className="faixa-tarefas" role="status">
      {envios.map((e) => (
        <div key={e.id} className={`tarefa ${e.etapa}`}>
          <button className="link" onClick={() => ir(`livro/${e.id}`)}>
            📄 <strong>{e.titulo}</strong>: {e.etapa === "pronto" ? "pronto! Toque para abrir." : e.mensagem}
          </button>
          {e.etapa !== "pronto" && e.etapa !== "erro" && (
            <div className="barra"><div style={{ width: `${Math.round(e.fracao * 100)}%` }} /></div>
          )}
          {(e.etapa === "pronto" || e.etapa === "erro") && (
            <button className="icone pequeno" aria-label="Fechar aviso" onClick={() => esquecerEnvio(e.id)}>✕</button>
          )}
        </div>
      ))}
      {gerando && <div className="tarefa">🔊 Gerando voz em segundo plano… pode continuar usando o app.</div>}
    </div>
  );
}
