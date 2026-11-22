import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { MOTORES, Motor, TEXTO_AMOSTRA, gerarAmostra, motoresDisponiveis, vozesDoMotor } from "../lib/motores";
import type { Voz } from "../lib/tipos";
import { ir } from "../App";

// Um grupo por serviço; o ElevenLabs usa o modelo "mais natural" na amostra.
const GRUPOS = MOTORES.filter((m) => m.modelo !== "eleven_flash_v2_5");
const MOSTRAR = 8;

export default function Vozes({ livroId }: { livroId: string | null }) {
  const [texto, setTexto] = useState(TEXTO_AMOSTRA);
  const [disponiveis, setDisponiveis] = useState<Record<string, boolean> | null>(null);
  const [vozes, setVozes] = useState<Partial<Record<Motor, Voz[] | string>>>({});
  const [todas, setTodas] = useState<Partial<Record<Motor, boolean>>>({});
  const [tocando, setTocando] = useState<{ chave: string; url?: string; msg?: string } | null>(null);
  const [titulo, setTitulo] = useState("");

  useEffect(() => {
    motoresDisponiveis().then((d) => {
      setDisponiveis(d);
      GRUPOS.forEach((g) => {
        if (!d[g.motor]) return;
        vozesDoMotor(g.motor)
          .then((v) => setVozes((x) => ({ ...x, [g.motor]: v })))
          .catch((e) => setVozes((x) => ({ ...x, [g.motor]: e.message })));
      });
    });
    if (livroId) {
      (async () => {
        const { data: l } = await supabase.from("vb_livros").select("titulo").eq("id", livroId).single();
        setTitulo(l?.titulo ?? "");
        const { data } = await supabase.from("vb_capitulos").select("texto").eq("livro_id", livroId).order("numero").limit(1);
        const t = data?.[0]?.texto as string | undefined;
        if (t) setTexto(t.slice(0, 300).replace(/\s+\S*$/, "") + ".");
      })();
    }
  }, [livroId]);

  async function tocar(modelo: string, v: Voz, chave: string) {
    setTocando({ chave, msg: "Gerando amostra…" });
    try {
      const url = await gerarAmostra(modelo, v.voz_id, texto, (m) => setTocando({ chave, msg: m }));
      setTocando({ chave, url });
    } catch (e) {
      setTocando({ chave, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function usar(modelo: string, v: Voz) {
    if (!livroId) return;
    await supabase.from("vb_livros").update({ modelo, voz_id: v.voz_id, voz_nome: v.nome }).eq("id", livroId);
    ir(`livro/${livroId}`);
  }

  return (
    <main className="tela">
      <header className="topo">
        <button className="icone" onClick={() => ir(livroId ? `livro/${livroId}` : "")} aria-label="Voltar">←</button>
        <h2>Comparar vozes</h2>
        <span />
      </header>

      <section className="cartao">
        <label htmlFor="amostra">Texto da amostra{titulo ? ` (de “${titulo}”)` : ""}</label>
        <textarea id="amostra" rows={4} value={texto} maxLength={400} onChange={(e) => setTexto(e.target.value)} />
        <p className="fraco pequeno">Toque em ▶ para ouvir cada voz lendo este texto. Use fone para comparar melhor.</p>
      </section>

      {disponiveis === null && <p className="fraco">Carregando…</p>}

      {disponiveis && GRUPOS.map((g) => {
        const lista = vozes[g.motor];
        const ligado = disponiveis[g.motor];
        const visiveis = Array.isArray(lista) ? (todas[g.motor] ? lista : lista.slice(0, MOSTRAR)) : [];
        return (
          <section key={g.motor} className="cartao grupo-voz">
            <div>
              <h3>{g.nome.replace(" · mais natural", "")}</h3>
              <p className="fraco pequeno">{g.motor === "elevenlabs" ? "A mais humana. Gasta créditos do seu plano." : g.resumo}</p>
            </div>
            {!ligado && <p className="aviso pequeno">Falta configurar a chave deste serviço (passo a passo no README).</p>}
            {ligado && lista === undefined && <p className="fraco pequeno">Carregando vozes…</p>}
            {typeof lista === "string" && <p className="erro pequeno">{lista}</p>}
            {visiveis.map((v) => {
              const chave = `${g.modelo}:${v.voz_id}`;
              const t = tocando?.chave === chave ? tocando : null;
              return (
                <div key={chave} className="linha-voz">
                  <div className="linha">
                    <span className="info">
                      <strong>{v.nome}</strong>
                      <span className="fraco pequeno">
                        {[v.genero === "male" ? "masculina" : v.genero === "female" ? "feminina" : null, v.categoria, v.idioma === "pt" && g.motor === "elevenlabs" ? "🇧🇷" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <button className="botao pequeno" aria-label={`Ouvir ${v.nome}`} onClick={() => tocar(g.modelo, v, chave)} disabled={t?.msg === "Gerando amostra…"}>▶</button>
                    {livroId && <button className="botao secundario pequeno" onClick={() => usar(g.modelo, v)}>Usar</button>}
                  </div>
                  {g.motor === "elevenlabs" && v.amostra_url && !t && (
                    <audio className="amostra" controls preload="none" src={v.amostra_url} aria-label={`Amostra grátis de ${v.nome}`} />
                  )}
                  {t?.msg && <p className="fraco pequeno">{t.msg}</p>}
                  {t?.url && <audio className="amostra" controls autoPlay src={t.url} />}
                </div>
              );
            })}
            {g.motor === "elevenlabs" && Array.isArray(lista) && (
              <p className="fraco pequeno">O player pequeno é a amostra pronta (grátis). O ▶ lê o seu texto e gasta ~{texto.length} créditos.</p>
            )}
            {Array.isArray(lista) && lista.length > MOSTRAR && !todas[g.motor] && (
              <button className="link" onClick={() => setTodas((x) => ({ ...x, [g.motor]: true }))}>Ver todas as {lista.length} vozes</button>
            )}
          </section>
        );
      })}
    </main>
  );
}
