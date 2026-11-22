import { useEffect, useMemo, useState } from "react";
import { chamarFuncao, supabase } from "../lib/supabase";
import { CapituloResumo, Livro, NOME_STATUS, Status, Voz, duracaoEstimada, fmtNum, fmtTempo } from "../lib/tipos";
import { assinarGeracao, estadoGeracao, gerarCapitulo } from "../lib/geracao";
import { ir } from "../App";
import Capa from "./Capa";

interface Estimativa {
  blocos_total: number;
  blocos_prontos: number;
  caracteres_a_gerar: number;
  creditos_estimados: number;
  modelo: string;
  saldo: { plano: string; restantes: number; limite: number; renova_em: string | null } | null;
}

const MODELOS = [
  { id: "eleven_multilingual_v2", nome: "Mais natural (1 crédito por letra)" },
  { id: "eleven_flash_v2_5", nome: "Econômico (½ crédito por letra)" },
];

let cacheVozes: Voz[] | null = null;

export default function LivroTela({ livroId }: { livroId: string }) {
  const [livro, setLivro] = useState<Livro | null>(null);
  const [caps, setCaps] = useState<CapituloResumo[]>([]);
  const [prontos, setProntos] = useState<Map<string, Set<number>>>(new Map());
  const [vozes, setVozes] = useState<Voz[] | null>(cacheVozes);
  const [erroVozes, setErroVozes] = useState("");
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
    if (!cacheVozes) {
      chamarFuncao<{ vozes: Voz[] }>("gerar-voz", { acao: "vozes" })
        .then((r) => {
          cacheVozes = r.vozes.sort((a, b) => Number(b.idioma === "pt") - Number(a.idioma === "pt"));
          setVozes(cacheVozes);
        })
        .catch((e) => setErroVozes(e.message));
    }
    return assinarGeracao(() => forcar((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livroId]);

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

  async function abrirEstimativa(c: CapituloResumo) {
    if (!livro?.voz_id) return setErro("Escolha uma voz primeiro.");
    setErro("");
    setEstimando(c);
    setEst(null);
    try {
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
        <button className="botao" disabled={!algumAudio} onClick={() => ir(`ouvir/${livro.id}`)}>▶ Ouvir (voz ElevenLabs)</button>
        <button className="botao secundario" disabled={!caps.length} onClick={() => ir(`ouvir/${livro.id}?modo=celular`)}>🔊 Voz do celular (grátis)</button>
      </div>
      {!algumAudio && caps.length > 0 && <p className="fraco pequeno margem">Para ouvir com a voz do ElevenLabs, gere o áudio de um capítulo abaixo.</p>}

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
        <h3>Voz</h3>
        {erroVozes && <p className="erro pequeno">{erroVozes}</p>}
        {!vozes && !erroVozes && <p className="fraco pequeno">Carregando as vozes…</p>}
        {vozes && (
          <>
            <select value={livro.voz_id ?? ""} onChange={(e) => escolherVoz(e.target.value)} aria-label="Voz">
              <option value="">Escolha uma voz</option>
              {vozes.map((v) => (
                <option key={v.voz_id} value={v.voz_id}>
                  {v.nome}{v.idioma === "pt" ? " 🇧🇷" : ""}{v.genero ? ` · ${v.genero === "male" ? "masculina" : v.genero === "female" ? "feminina" : v.genero}` : ""}
                </option>
              ))}
            </select>
            {vozAtual?.amostra_url && (
              <audio className="amostra" controls preload="none" src={vozAtual.amostra_url}>Amostra</audio>
            )}
            <select value={livro.modelo} onChange={(e) => atualizar({ modelo: e.target.value })} aria-label="Qualidade">
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <p className="fraco pequeno">Dica: gere primeiro só o capítulo 1 para testar se a voz soa bem em português.</p>
          </>
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
                      <span className="aviso">gerando {g.feitos} de {g.total}…</span>
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
                <p className="grande">≈ {fmtNum(est.creditos_estimados)} créditos</p>
                <p className="fraco pequeno">
                  {fmtNum(est.caracteres_a_gerar)} letras para gerar.
                  {est.blocos_prontos > 0 && ` ${est.blocos_prontos} de ${est.blocos_total} partes já existem e não gastam de novo.`}
                </p>
                {est.saldo ? (
                  <p className="pequeno">
                    Seu saldo: <strong>{fmtNum(est.saldo.restantes)}</strong> de {fmtNum(est.saldo.limite)} (plano {est.saldo.plano})
                    {est.saldo.renova_em && ` · renova em ${new Date(est.saldo.renova_em).toLocaleDateString("pt-BR")}`}
                  </p>
                ) : (
                  <p className="fraco pequeno">Não consegui ler seu saldo no ElevenLabs.</p>
                )}
                {semCredito && <p className="erro pequeno">Seu saldo não cobre este capítulo. Troque para “Econômico” ou use a voz do celular.</p>}
                <p className="fraco pequeno">É uma estimativa pela tabela do ElevenLabs. O valor exato fica no painel do ElevenLabs.</p>
                <div className="acoes">
                  <button className="botao secundario" onClick={() => setEstimando(null)}>Cancelar</button>
                  <button className="botao" disabled={!!semCredito || est.caracteres_a_gerar === 0} onClick={confirmarGeracao}>Confirmar e gerar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
