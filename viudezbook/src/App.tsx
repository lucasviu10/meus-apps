import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configurado, supabase } from "./lib/supabase";
import Login from "./telas/Login";
import Biblioteca from "./telas/Biblioteca";
import EnviarPdf from "./telas/EnviarPdf";
import Descobrir from "./telas/Descobrir";
import LivroTela from "./telas/Livro";
import Player from "./telas/Player";
import Vozes from "./telas/Vozes";

function lerRota() {
  const h = location.hash.replace(/^#\/?/, "");
  const [caminho, busca = ""] = h.split("?");
  return { partes: caminho.split("/").filter(Boolean), params: new URLSearchParams(busca) };
}

export function ir(caminho: string) {
  location.hash = "#/" + caminho.replace(/^\//, "");
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [rota, setRota] = useState(lerRota);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    const aoMudar = () => setRota(lerRota());
    window.addEventListener("hashchange", aoMudar);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("hashchange", aoMudar);
    };
  }, []);

  if (!configurado) {
    return (
      <main className="tela centro">
        <h1>Viudezbook</h1>
        <p>Falta ligar o app ao Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY). Veja o README.</p>
      </main>
    );
  }
  if (sessao === undefined) return <main className="tela centro"><p className="fraco">Abrindo…</p></main>;
  if (!sessao) return <Login />;

  const [p0, p1] = rota.partes;
  if (p0 === "enviar") return <EnviarPdf />;
  if (p0 === "descobrir") return <Descobrir />;
  if (p0 === "vozes") return <Vozes livroId={rota.params.get("livro")} />;
  if (p0 === "livro" && p1) return <LivroTela key={p1} livroId={p1} />;
  if (p0 === "ouvir" && p1) {
    return <Player key={p1 + rota.params.get("modo")} livroId={p1} modo={rota.params.get("modo") === "celular" ? "celular" : "elevenlabs"} capituloId={rota.params.get("cap")} />;
  }
  return <Biblioteca email={sessao.user.email ?? ""} />;
}
