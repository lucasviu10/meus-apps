import { useState } from "react";
import { supabase } from "../lib/supabase";
import Logo from "./Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "enviado">("livre");
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEstado("enviando");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin },
    });
    if (error) {
      setErro(/rate|limit/i.test(error.message) ? "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." : error.message);
      setEstado("livre");
    } else {
      setEstado("enviado");
    }
  }

  return (
    <main className="tela centro">
      <Logo tamanho={96} />
      <h1 className="marca">Viudezbook</h1>
      <p className="fraco">Seus livros, na voz que você escolher.</p>
      {estado === "enviado" ? (
        <div className="cartao">
          <p><strong>Pronto!</strong> Abra o seu e-mail e toque em <strong>“Log In”</strong> (ou “Entrar”) no link que chegou.</p>
          <p className="fraco">Não chegou? Olhe a caixa de spam.</p>
          <button className="botao secundario" onClick={() => setEstado("livre")}>Usar outro e-mail</button>
        </div>
      ) : (
        <form className="cartao" onSubmit={enviar}>
          <label htmlFor="email">Seu e-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          <button className="botao" disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando…" : "Enviar link de acesso"}
          </button>
          {erro && <p className="erro">{erro}</p>}
          <p className="fraco pequeno">Sem senha: você recebe um link no e-mail e entra com um toque.</p>
        </form>
      )}
    </main>
  );
}
