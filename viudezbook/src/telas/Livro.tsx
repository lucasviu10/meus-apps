import { useEffect, useMemo, useState } from "react";
import { chamarFuncao, supabase } from "../lib/supabase";
import { CapituloResumo, Livro, NOME_STATUS, Status, Voz, duracaoEstimada, fmtNum, fmtTempo } from "../lib/tipos";
import { assinarGeracao, estadoGeracao, gerarCapitulo, planoLocal } from "../lib/geracao";
import { MOTORES, gerarAmostra, motoresDisponiveis, opcao, vozesDoMotor } from "../lib/motores";
import { ir } from "../App";
import Capa from "./Capa";

interface Estimativa {
  blocos_total: number;
  blocos_prontos: number;
  caracteres_a_gerar: number;
  creditos_estimados: number;
  unidade: string;
  modelo: string;
  local?: boolean;
  saldo: { plano: string; restantes: number; limite: number; renova_em: string | null } | null;
}

export default function LivroTela({ livroId }: { livroId: string }) {
  const [livro, setLivro] = useState<Livro | null>(null);
  const [caps, setCaps] = useState<CapituloResumo[]>([]);
  const [prontos, setProntos] = useState<Map<string, Set<number>>>(new Map());
  const [vozes, setVozes] = useState<Voz[] | null>(null);
  const [erroVozes, setErroVozes] = useState("");
  const [disponiveis, setDisponiveis] = useState<Record<string, boolean>>({ piper: true });
  const [amostra, setAmostra] = useState<{ url?: string; msg?: string }>({});
  const [estimando, setEstimando] = useState<CapituloResumo | null>(null);
  const [est, setEst] = useState<Estimativa | null>(null);
  const [erro, setErro] = useState("");
  const [, forcar] = useState(0);

  async function carregar() {
    const [l, c] = await Promise.all([
      supabase.from("vb_livros").select("*").eq("id", livroId).maybeSingle(),
      supabase.from("vb_capitulos").select("id, numero, titulo, caracteres, blocos").eq("livro_id", livroId).order("numero"),
    ]);
    if (l.error) setErro(l.error.message);
    setLivro(l.data as Livro);
    setCaps((c.data as CapituloResumo[]) ?? []);
  }

  async function carregarAudios(l: Livro) {
    if (!l.voz_id) return setProntos(new Map());
    const { data } = await supabase
      .from("vb_audios")
      .select("capitulo_id, bloco")
      .eq("livro_id", l.id)
      .eq("voz_id", l.voz_id)
      .eq("modelo", l.modelo);
    const m = new Map<string, Set<number>>();
    (data ?? []).forEach((a: any) => {
      if (!m.has(a.capitulo_id)) m.set(a.capitulo_id, new Set());
      m.get(a.capitulo_id)!.add(a.bloco);
    });
    setProntos(m);
  }

  useEffect(() => {
    carregar();
    motoresDisponiveis().then(setDisponiveis);
    return assinarGeracao(() => forcar((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livroId]);

  // Vozes do serviço escolhido.
  useEffect(() => {
    if (!livro) return;
    setVozes(null);
    setErroVozes("");
    setAmostra({});
    vozesDoMotor(opcao(livro.modelo).motor).then(setVozes).catch((e) => setErroVozes(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livro?.modelo]);

  useEffect(() => {
    if (livro) carregarAudios(livro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livro?.voz_id, livro?.modelo, livro?.id]);

  // Atualiza a contagem quando a geração avança.
  useEffect(() => assinarGeracao(() => livro && carregarAudios(livro)), [livro]);

  // Se o livro ainda está sendo preparado, confere de novo em alguns segundos.
  useEffect(() => {
    if (livro?.estado !== "processando") return;
    const t = setTimeout(carregar, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livro]);

  async function atualizar(campos: Partial<Livro>) {
    if (!livro) return;
    setLivro({ ...livro, ...campos });
    const { error } = await supabase.from("vb_livros").update(campos).eq("id", livro.id);
    if (error) setErro(error.message);
  }

  function mudarStatus(s: Status) {
    const campos: Partial<Livro> = { status: s };
    if (s === "ouvindo" && !livro?.iniciado_em) campos.iniciado_em = new Date().toISOString();
    if (s === "li") campos.terminado_em = new Date().toISOString();
    atualizar(campos);
  }

  function escolherVoz(id: string) {
    const v = vozes?.find((x) => x.voz_id === id);
    atualizar({ voz_id: id || null, voz_nome: v?.nome ?? null });
  }

  function mudarMotor(modelo: string) {
    atualizar({ modelo, voz_id: null, voz_nome: null });
  }

  async function ouvirAmostra() {
    if (!livro?.voz_id) return;
    setAmostra({ msg: "Gerando amostra…" });
    try {
      let texto = "";
      if (caps[0]) {
        const { data } = await supabase.from("vb_capitulos").select("texto").eq("id", caps[0].id).single();
        texto = (data?.texto ?? "").slice(0, 300);
      }
      const url = await gerarAmostra(livro.modelo, livro.voz_id, texto || "Olá! Esta é uma amostra da voz.", (m) => setAmostra({ msg: m }));
      setAmostra({ url });
    } catch (e) {
      setAmostra({ msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function abrirEstimativa(c: CapituloResumo) {
    if (!livro?.voz_id) return setErro("Escolha uma voz primeiro.");
    setErro("");
    setEstimando(c);
    setEst(null);
    try {
      if (opcao(livro.modelo).local) {
        const { blocos, prontos } = await planoLocal(c.id, livro.voz_id, livro.modelo);
        const aGerar = blocos.reduce((s, b, i) => s + (prontos.has(i) ? 0 : b.length), 0);
        setEst({ blocos_total: blocos.length, blocos_prontos: prontos.size, caracteres_a_gerar: aGerar, creditos_estimados: 0, unidade: "", modelo: "Piper (grátis)", local: true, saldo: null });
        return;
      }
      setEst(await chamarFuncao<Estimativa>("gerar-voz", { acao: "estimar", capitulo_id: c.id, voz_id: livro.voz_id, modelo: livro.modelo }));
    } catch (e) {
      setEstimando(null);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function confirmarGeracao() {
    if (!livro?.voz_id || !estimando || !est) return;
    gerarCapitulo({ capituloId: estimando.id, vozId: livro.voz_id, modelo: livro.modelo, blocos: est.blocos_total });
    setEstimando(null);
  }

  async function apagar() {
    if (!livro || !confirm(`Apagar “${livro.titulo}” e todos os áudios dele?`)) return;
    const { data: arquivos } = await supabase.from("vb_audios").select("caminho").eq("livro_id", livro.id);
    const caminhos = (arquivos ?? []).map((a: any) => a.caminho);
    for (let i = 0; i < caminhos.length; i += 100) await supabase.storage.from("vb-audios").remove(caminhos.slice(i, i + 100));
    if (livro.pdf_caminho) await supabase.storage.from("vb-pdfs").remove([livro.pdf_caminho]);
    await supabase.from("vb_livros").delete().eq("id", livro.id);
    ir("");
  }

  const vozAtual = useMemo(() => vozes?.find((v) => v.voz_id === livro?.voz_id), [vozes, livro?.voz_id]);
  const algumAudio = [...prontos.values()].some((s) => s.has(0));

  if (!livro) {
    return (
      <main className="tela">
        <header className="topo"><button className="icone" onClick={() => ir("")}>←</button><span /><span /></header>
        <p className="fraco">{erro || "Carregando…"}</p>
      </main>
    );
  }

  const semCredito = est?.saldo && est.creditos_estimados > est.saldo.restantes;

  return (
    <main className="tela">
      <header className="topo">
        <button className="icone" onClick={() => ir("")} aria-label="Voltar">←</button>
        <span />
        <button className={`icone estrela-botao ${livro.favorito ? "ligada" : ""}`} aria-label="Favorito" onClick={() => atualizar({ favorito: !livro.favorito })}>
          {livro.favorito ? "★" : "☆"}
        </button>
      </header>

      <section className="cabeca-livro">
        <Capa livro={livro} tamanho={96} />
        <div>
          <h2>{livro.titulo}</h2>
          <p className="fraco">{livro.autor ?? "Autor desconhecido"}</p>
          <p className="pequeno fraco">
            {livro.num_capitulos} capítulos · {fmtNum(livro.total_caracteres)} letras · cerca de {fmtTempo(duracaoEstimada(livro.total_caracteres))} de áudio
          </p>
        </div>
      </section>

      {livro.estado === "processando" && <p className="aviso">Preparando o texto… isso leva alguns segundos.</p>}
      {livro.estado === "erro" && <p className="erro">Deu erro ao preparar: {livro.erro}</p>}

      <div className="acoes">
        <button className="botao" disabled={!algumAudio} onClick={() => ir(`ouvir/${livro.id}`)}>▶ Ouvir</button>
        <button className="botao secundario" disabled={!caps.length} onClick={() => ir(`ouvir/${livro.id}?modo=celular`)}>🗣 Leitura ao vivo</button>
      </div>
      {caps.length > 0 && (
        <p className="fraco pequeno margem">
          {!algumAudio && "Para ouvir com a tela apagada, gere o áudio de um capítulo abaixo (a voz Piper é grátis). "}
          “Leitura ao vivo” usa a voz do celular na hora, mas pode parar quando a tela apaga.
        </p>
      )}

      <section className="cartao">
        <div className="linha">
          <label htmlFor="status">Status</label>
          <select id="status" value={livro.status} onChange={(e) => mudarStatus(e.target.value as Status)}>
            {(Object.keys(NOME_STATUS) as Status[]).map((s) => <option key={s} value={s}>{NOME_STATUS[s]}</option>)}
          </select>
        </div>
        {livro.status === "li" && (
          <div className="linha">
            <span>Sua nota</span>
            <span className="nota">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={n <= (livro.nota ?? 0) ? "ligada" : ""} onClick={() => atualizar({ nota: n })} aria-label={`Nota ${n}`}>★</button>
              ))}
            </span>
          </div>
        )}
      </section>

      <section className="cartao">
        <div className="linha">
          <h3>Voz</h3>
          <button className="link" onClick={() => ir(`vozes?livro=${livro.id}`)}>Comparar todas as vozes</button>
        </div>
        <select value={livro.modelo} onChange={(e) => mudarMotor(e.target.value)} aria-label="Serviço de voz">
          {MOTORES.map((m) => (
            <option key={m.modelo} value={m.modelo} disabled={!disponiveis[m.motor]}>
              {m.nome} — {m.resumo}{!disponiveis[m.motor] ? " (falta configurar)" : ""}
            </option>
          ))}
        </select>
        {erroVozes && <p className="erro pequeno">{erroVozes}</p>}
        {!vozes && !erroVozes && <p className="fraco pequeno">Carregando as vozes…</p>}
        {vozes && (
          <select value={livro.voz_id ?? ""} onChange={(e) => escolherVoz(e.target.value)} aria-label="Voz">
            <option value="">Escolha uma voz</option>
            {vozes.map((v) => (
              <option key={v.voz_id} value={v.voz_id}>
                {v.nome}{v.idioma === "pt" && opcao(livro.modelo).motor === "elevenlabs" ? " 🇧🇷" : ""}
                {v.genero ? ` · ${v.genero === "male" ? "masculina" : v.genero === "female" ? "feminina" : v.genero}` : ""}
                {v.categoria && opcao(livro.modelo).motor !== "elevenlabs" ? ` · ${v.categoria}` : ""}
              </option>
            ))}
          </select>
        )}
        {vozAtual?.amostra_url && (
          <>
            <span className="fraco pequeno">Amostra pronta do serviço (grátis):</span>
            <audio className="amostra" controls preload="none" src={vozAtual.amostra_url} />
          </>
        )}
        {livro.voz_id && (
          <button className="botao secundario" onClick={ouvirAmostra} disabled={amostra.msg === "Gerando amostra…"}>
            🔈 Ouvir amostra com o texto do livro{opcao(livro.modelo).motor === "elevenlabs" ? " (gasta ~300 créditos)" : ""}
          </button>
        )}
        {amostra.msg && <p className="fraco pequeno">{amostra.msg}</p>}
        {amostra.url && <audio className="amostra" controls autoPlay src={amostra.url} />}
        {opcao(livro.modelo).local && (
          <p className="fraco pequeno">A voz grátis é gerada no seu celular: na 1ª vez baixa a voz (use Wi-Fi) e, enquanto gera, deixe o app aberto.</p>
        )}
      </section>

      {erro && <p className="erro">{erro}</p>}

      <section>
        <h3 className="margem">Capítulos</h3>
        <ul className="capitulos">
          {caps.map((c) => {
            const feitos = prontos.get(c.id)?.size ?? 0;
            const g = estadoGeracao(c.id);
            const completo = feitos >= c.blocos;
            return (
              <li key={c.id}>
                <div className="info">
                  <strong>{c.numero}. {c.titulo}</strong>
                  <span className="fraco pequeno">
                    ~{fmtTempo(duracaoEstimada(c.caracteres))} · {fmtNum(c.caracteres)} letras ·{" "}
                    {g?.gerando ? (
                      <span className="aviso">{g.mensagem || `gerando ${g.feitos} de ${g.total}…`}</span>
                    ) : completo ? (
                      <span className="ok">áudio pronto</span>
                    ) : feitos ? (
                      <span>{feitos} de {c.blocos} partes</span>
                    ) : (
                      "sem áudio"
                    )}
                  </span>
                  {g?.erro && <span className="erro pequeno">{g.erro}</span>}
                </div>
                <div className="botoes">
                  {feitos > 0 && prontos.get(c.id)?.has(0) && (
                    <button className="botao pequeno" onClick={() => ir(`ouvir/${livro.id}?cap=${c.id}`)} aria-label="Ouvir capítulo">▶</button>
                  )}
                  {!completo && !g?.gerando && (
                    <button className="botao secundario pequeno" disabled={!livro.voz_id} onClick={() => abrirEstimativa(c)}>Gerar voz</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cartao pequeno">
        <h3>Origem</h3>
        <p><strong>Fonte:</strong> {livro.fonte ?? "—"}</p>
        {livro.link_original && <p><strong>Link:</strong> <a href={livro.link_original} target="_blank" rel="noreferrer">{livro.link_original}</a></p>}
        <p><strong>Licença:</strong> {livro.licenca ?? "—"} {livro.licenca_confirmada && <span className="ok">(confirmada pela fonte)</span>}</p>
        <p><strong>Coletado em:</strong> {livro.coletado_em ? new Date(livro.coletado_em).toLocaleString("pt-BR") : "—"}</p>
      </section>

      <button className="link perigo margem" onClick={apagar}>Apagar livro</button>

      {estimando && (
        <div className="fundo-modal" onClick={() => setEstimando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Gerar voz: {estimando.numero}. {estimando.titulo}</h3>
            {!est ? (
              <p className="fraco">Calculando o custo…</p>
            ) : (
              <>
                <p>Voz: <strong>{livro.voz_nome}</strong> · {est.modelo}</p>
                {est.local ? (
                  <>
                    <p className="grande">Grátis</p>
                    <p className="fraco pequeno">
                      {fmtNum(est.caracteres_a_gerar)} letras. O celular gera cada parte e guarda.
                      Deixe o app aberto até terminar; depois toca até com a tela apagada.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="grande">≈ {fmtNum(est.creditos_estimados)} {est.unidade}</p>
                    <p className="fraco pequeno">{fmtNum(est.caracteres_a_gerar)} letras para gerar.</p>
                  </>
                )}
                {est.blocos_prontos > 0 && <p className="fraco pequeno">{est.blocos_prontos} de {est.blocos_total} partes já existem e não gastam de novo.</p>}
                {est.saldo && (
                  <p className="pequeno">
                    Seu saldo: <strong>{fmtNum(est.saldo.restantes)}</strong> de {fmtNum(est.saldo.limite)} (plano {est.saldo.plano})
                    {est.saldo.renova_em && ` · renova em ${new Date(est.saldo.renova_em).toLocaleDateString("pt-BR")}`}
                  </p>
                )}
                {!est.local && !est.saldo && <p className="fraco pequeno">A cota grátis do mês aparece no painel do serviço (preciso confirmar o valor no site).</p>}
                {semCredito && <p className="erro pequeno">Seu saldo não cobre este capítulo. Troque para a voz grátis (Piper) ou outro serviço.</p>}
                {!est.local && <p className="fraco pequeno">É uma estimativa pela tabela do serviço. O valor exato fica no painel dele.</p>}
                <div className="acoes">
                  <button className="botao secundario" onClick={() => setEstimando(null)}>Cancelar</button>
                  <button className="botao" disabled={!!semCredito || est.caracteres_a_gerar === 0} onClick={confirmarGeracao}>{est.local ? "Gerar no celular" : "Confirmar e gerar"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
