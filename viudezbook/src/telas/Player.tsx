import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { CapituloResumo, Livro, fmtTempo } from "../lib/tipos";
import { Faixa, TocadorBlocos } from "../lib/tocador";
import { FalaCelular, vozesDoCelular } from "../lib/falaCelular";
import { lerProgresso, salvarProgresso } from "../lib/progresso";
import { assinarGeracao, estadoGeracao } from "../lib/geracao";
import { trechosParaFala } from "../../supabase/functions/_shared/texto.ts";
import { ir } from "../App";
import Capa from "./Capa";

type Modo = "elevenlabs" | "celular";
const VELOCIDADES_RAPIDAS = [0.75, 1, 1.25, 1.5, 2];

export default function Player({ livroId, modo, capituloId }: { livroId: string; modo: Modo; capituloId: string | null }) {
  const [livro, setLivro] = useState<Livro | null>(null);
  const [caps, setCaps] = useState<CapituloResumo[]>([]);
  const [comAudio, setComAudio] = useState<Set<string>>(new Set());
  const [capAtual, setCapAtual] = useState<CapituloResumo | null>(null);
  const [vel, setVel] = useState(1);
  const [, setTique] = useState(0);
  const [aviso, setAviso] = useState("");
  const [trechoTexto, setTrechoTexto] = useState("");
  const [vozesCel, setVozesCel] = useState<SpeechSynthesisVoice[]>([]);
  const [vozCel, setVozCel] = useState<string>(() => localStorage.getItem("vb-voz-celular") ?? "");

  const tocadorRef = useRef<TocadorBlocos | null>(null);
  const falaRef = useRef<FalaCelular | null>(null);
  const capRef = useRef<CapituloResumo | null>(null);
  const livroRef = useRef<Livro | null>(null);
  const capsRef = useRef<CapituloResumo[]>([]);
  const comAudioRef = useRef<Set<string>>(new Set());
  const velRef = useRef(1);
  const trechosRef = useRef<string[]>([]);

  const atualizarTela = useCallback(() => setTique((n) => n + 1), []);

  const tocando = () => (modo === "celular" ? falaRef.current?.tocando() : tocadorRef.current?.tocando()) ?? false;

  // ---------- salvar onde parei ----------
  const salvar = useCallback(() => {
    const cap = capRef.current;
    if (!cap) return;
    salvarProgresso({
      livro_id: livroId,
      capitulo_id: cap.id,
      segundo: modo === "elevenlabs" ? tocadorRef.current?.posicao() ?? 0 : 0,
      trecho: modo === "celular" ? falaRef.current?.posicao() ?? 0 : 0,
      velocidade: velRef.current,
      modo,
    });
  }, [livroId, modo]);

  // ---------- carregar um capítulo ----------
  async function faixasDoCapitulo(cap: CapituloResumo): Promise<Faixa[]> {
    const l = livroRef.current!;
    const { data } = await supabase
      .from("vb_audios")
      .select("bloco, caminho, duracao, gerado_em")
      .eq("capitulo_id", cap.id)
      .eq("voz_id", l.voz_id ?? "")
      .eq("modelo", l.modelo)
      .order("bloco")
      .order("gerado_em", { ascending: false });
    const porBloco = new Map<number, any>();
    (data ?? []).forEach((a: any) => !porBloco.has(a.bloco) && porBloco.set(a.bloco, a));
    const seguidos: any[] = [];
    for (let i = 0; porBloco.has(i); i++) seguidos.push(porBloco.get(i));
    if (!seguidos.length) return [];
    const { data: urls } = await supabase.storage.from("vb-audios").createSignedUrls(seguidos.map((a) => a.caminho), 60 * 60 * 6);
    return seguidos.map((a, i) => ({ bloco: a.bloco, url: urls?.[i]?.signedUrl ?? "", duracao: Number(a.duracao) }));
  }

  async function abrirCapitulo(cap: CapituloResumo, posicao: number, tocar: boolean) {
    capRef.current = cap;
    setCapAtual(cap);
    setAviso("");
    if (modo === "elevenlabs") {
      const faixas = await faixasDoCapitulo(cap);
      if (!faixas.length) {
        setAviso("Este capítulo ainda não tem áudio. Gere a voz na tela do livro.");
        tocadorRef.current?.pausar();
        return;
      }
      tocadorRef.current!.carregar(faixas, posicao);
      if (tocar) tocadorRef.current!.tocar();
    } else {
      const { data } = await supabase.from("vb_capitulos").select("titulo, texto").eq("id", cap.id).single();
      const trechos = trechosParaFala(((data?.titulo ? data.titulo + ".\n\n" : "") + (data?.texto ?? "")));
      trechosRef.current = trechos;
      falaRef.current!.carregar(trechos, posicao);
      setTrechoTexto(trechos[falaRef.current!.posicao()] ?? "");
      if (tocar) falaRef.current!.tocar();
    }
    atualizarMidia();
  }

  function proximoCapitulo(direcao: 1 | -1, tocar: boolean) {
    const lista = capsRef.current;
    let i = lista.findIndex((c) => c.id === capRef.current?.id) + direcao;
    while (i >= 0 && i < lista.length) {
      if (modo === "celular" || comAudioRef.current.has(lista[i].id)) {
        abrirCapitulo(lista[i], 0, tocar);
        return true;
      }
      i += direcao;
    }
    return false;
  }

  // ---------- botões do fone, do carro e da tela bloqueada ----------
  function atualizarMidia() {
    if (!("mediaSession" in navigator)) return;
    const l = livroRef.current;
    const c = capRef.current;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: c ? `${c.numero}. ${c.titulo ?? ""}` : "",
      artist: l?.autor ?? "",
      album: l?.titulo ?? "Viudezbook",
      artwork: l?.capa_url ? [{ src: l.capa_url, sizes: "512x512" }] : [{ src: "/icone-512.png", sizes: "512x512", type: "image/png" }],
    });
  }

  function acao(nome: "tocar" | "pausar" | "voltar" | "avancar") {
    const t = tocadorRef.current;
    const f = falaRef.current;
    if (nome === "tocar") modo === "celular" ? f?.tocar() : t?.tocar();
    if (nome === "pausar") {
      modo === "celular" ? f?.pausar() : t?.pausar();
      salvar();
    }
    if (nome === "voltar") modo === "celular" ? f?.irPara(f.posicao() - 1) : t?.pular(-15);
    if (nome === "avancar") modo === "celular" ? f?.irPara(f.posicao() + 1) : t?.pular(30);
    atualizarTela();
  }

  // ---------- montar ----------
  useEffect(() => {
    let vivo = true;
    const aoAtualizar = () => {
      if (!vivo) return;
      if (falaRef.current) setTrechoTexto(trechosRef.current[falaRef.current.posicao()] ?? "");
      (window as any).vbTocando = tocando();
      atualizarTela();
    };
    const aoTerminar = () => {
      salvar();
      if (!proximoCapitulo(1, true)) setAviso("Fim do livro! 🎉 Marque como “Li” na tela do livro.");
    };

    if (modo === "elevenlabs") {
      tocadorRef.current = new TocadorBlocos(aoAtualizar, aoTerminar, async (bloco) => {
        // "Ouvir já": espera o próximo pedaço que ainda está sendo gerado.
        const cap = capRef.current;
        if (!cap || bloco >= cap.blocos) return null;
        for (let tentativa = 0; tentativa < 40; tentativa++) {
          const faixas = await faixasDoCapitulo(cap);
          const f = faixas.find((x) => x.bloco === bloco);
          if (f) return f;
          if (!estadoGeracao(cap.id)?.gerando) return null;
          setAviso("Esperando o próximo trecho ficar pronto…");
          await new Promise((r) => setTimeout(r, 3000));
        }
        return null;
      });
    } else {
      falaRef.current = new FalaCelular(aoAtualizar, aoTerminar);
      const carregarVozes = () => {
        const v = vozesDoCelular();
        setVozesCel(v);
        const salva = v.find((x) => x.voiceURI === localStorage.getItem("vb-voz-celular"));
        if (falaRef.current) falaRef.current.voz = salva ?? v.find((x) => x.lang === "pt-BR") ?? v[0] ?? null;
      };
      carregarVozes();
      speechSynthesis.onvoiceschanged = carregarVozes;
    }

    (async () => {
      const [l, c, prog] = await Promise.all([
        supabase.from("vb_livros").select("*").eq("id", livroId).single(),
        supabase.from("vb_capitulos").select("id, numero, titulo, caracteres, blocos").eq("livro_id", livroId).order("numero"),
        lerProgresso(livroId),
      ]);
      if (!vivo) return;
      const livroCarregado = l.data as Livro;
      const lista = (c.data as CapituloResumo[]) ?? [];
      livroRef.current = livroCarregado;
      capsRef.current = lista;
      setLivro(livroCarregado);
      setCaps(lista);

      if (modo === "elevenlabs" && livroCarregado.voz_id) {
        const { data } = await supabase
          .from("vb_audios")
          .select("capitulo_id")
          .eq("livro_id", livroId)
          .eq("voz_id", livroCarregado.voz_id)
          .eq("modelo", livroCarregado.modelo)
          .eq("bloco", 0);
        comAudioRef.current = new Set((data ?? []).map((a: any) => a.capitulo_id));
        setComAudio(comAudioRef.current);
      }

      const v = prog?.velocidade ? Number(prog.velocidade) : 1;
      velRef.current = v;
      setVel(v);
      tocadorRef.current?.definirVelocidade(v);
      falaRef.current?.definirVelocidade(v);

      // De onde começar: capítulo pedido > onde parei > primeiro com áudio.
      let cap = lista.find((x) => x.id === capituloId);
      let pos = 0;
      if (!cap && prog?.capitulo_id) {
        cap = lista.find((x) => x.id === prog.capitulo_id);
        if (cap && prog.modo === modo) pos = modo === "elevenlabs" ? Number(prog.segundo) : prog.trecho;
      }
      if (cap && modo === "elevenlabs" && !comAudioRef.current.has(cap.id)) cap = undefined;
      if (!cap) {
        // começa pelo capítulo 1; o resumo (capítulo 0) só se for o único com áudio
        const ordem = [...lista.filter((x) => x.numero > 0), ...lista.filter((x) => x.numero === 0)];
        cap = modo === "elevenlabs" ? ordem.find((x) => comAudioRef.current.has(x.id)) : ordem[0];
      }
      if (!cap) {
        setAviso(modo === "elevenlabs" ? "Nenhum capítulo tem áudio ainda. Gere a voz na tela do livro." : "Este livro ainda não tem texto.");
        return;
      }
      await abrirCapitulo(cap, pos, false);

      // Começar a ouvir também conta como "Ouvindo".
      if (livroCarregado.status === "quero_ler") {
        await supabase.from("vb_livros").update({ status: "ouvindo", iniciado_em: livroCarregado.iniciado_em ?? new Date().toISOString() }).eq("id", livroId);
      }
    })();

    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler("play", () => acao("tocar"));
      ms.setActionHandler("pause", () => acao("pausar"));
      ms.setActionHandler("seekbackward", () => acao("voltar"));
      ms.setActionHandler("seekforward", () => acao("avancar"));
      ms.setActionHandler("previoustrack", () => proximoCapitulo(-1, true));
      ms.setActionHandler("nexttrack", () => proximoCapitulo(1, true));
    }

    // Salva a cada 5 segundos tocando, ao sair do app e ao fechar.
    const intervalo = setInterval(() => tocando() && salvar(), 5000);
    const aoEsconder = () => document.visibilityState === "hidden" && salvar();
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", salvar);

    // Novos pedaços gerados enquanto ouço.
    const sair = assinarGeracao(async (id) => {
      if (modo !== "elevenlabs") return;
      if (!comAudioRef.current.has(id)) {
        comAudioRef.current = new Set(comAudioRef.current).add(id);
        setComAudio(comAudioRef.current);
      }
      if (capRef.current?.id === id && tocadorRef.current) {
        const faixas = await faixasDoCapitulo(capRef.current);
        faixas.forEach((f) => tocadorRef.current?.acrescentar(f));
      }
    });

    return () => {
      vivo = false;
      salvar();
      sair();
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", salvar);
      tocadorRef.current?.destruir();
      falaRef.current?.destruir();
      (window as any).vbTocando = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mudarVelocidade(v: number) {
    const arred = Math.round(v * 100) / 100;
    velRef.current = arred;
    setVel(arred);
    tocadorRef.current?.definirVelocidade(arred);
    falaRef.current?.definirVelocidade(arred);
    salvar();
  }

  function escolherVozCelular(uri: string) {
    setVozCel(uri);
    localStorage.setItem("vb-voz-celular", uri);
    if (falaRef.current) {
      falaRef.current.voz = vozesCel.find((v) => v.voiceURI === uri) ?? null;
      if (falaRef.current.tocando()) falaRef.current.irPara(falaRef.current.posicao());
    }
  }

  // ---------- desenhar ----------
  const t = tocadorRef.current;
  const f = falaRef.current;
  const pos = modo === "elevenlabs" ? t?.posicao() ?? 0 : f?.posicao() ?? 0;
  const total = modo === "elevenlabs" ? t?.duracao() ?? 0 : Math.max(1, (f?.total() ?? 1) - 1);
  const estaTocando = tocando();
  const parcial = modo === "elevenlabs" && capAtual && estadoGeracao(capAtual.id)?.gerando;

  if (modo === "elevenlabs" && t && "mediaSession" in navigator && total > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: total, position: Math.min(pos, total), playbackRate: vel });
    } catch { /* alguns aparelhos não aceitam */ }
  }

  return (
    <main className="tela player">
      <header className="topo">
        <button className="icone" onClick={() => ir(`livro/${livroId}`)} aria-label="Voltar">←</button>
        <span className="fraco pequeno">{modo === "celular" ? "Leitura ao vivo (deixe a tela ligada)" : livro?.voz_nome ?? "Áudio"}</span>
        <span />
      </header>

      {livro && (
        <div className="player-capa">
          <Capa livro={livro} tamanho={180} />
          <h2>{livro.titulo}</h2>
          <p className="fraco">{livro.autor}</p>
        </div>
      )}

      <select
        className="seletor-capitulo"
        value={capAtual?.id ?? ""}
        onChange={(e) => {
          const c = caps.find((x) => x.id === e.target.value);
          if (c) abrirCapitulo(c, 0, estaTocando);
        }}
        aria-label="Capítulo"
      >
        {caps.map((c) => (
          <option key={c.id} value={c.id} disabled={modo === "elevenlabs" && !comAudio.has(c.id)}>
            {c.numero === 0 ? "★ Resumo (~12 min)" : `${c.numero}. ${c.titulo}`}{modo === "elevenlabs" && !comAudio.has(c.id) ? " (sem áudio)" : ""}
          </option>
        ))}
      </select>

      {modo === "celular" && trechoTexto && <p className="texto-atual">{trechoTexto}</p>}

      <div className="tempo">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={modo === "elevenlabs" ? 1 : 1}
          value={Math.min(pos, total)}
          onChange={(e) => (modo === "elevenlabs" ? t?.irPara(Number(e.target.value)) : f?.irPara(Number(e.target.value)))}
          aria-label="Posição"
        />
        <div className="linha fraco pequeno">
          {modo === "elevenlabs" ? (
            <>
              <span>{fmtTempo(pos)}</span>
              <span>{parcial ? "gerando…" : fmtTempo(total)}</span>
            </>
          ) : (
            <>
              <span>Trecho {pos + 1}</span>
              <span>de {total + 1}</span>
            </>
          )}
        </div>
      </div>

      <div className="controles">
        <button className="icone" onClick={() => proximoCapitulo(-1, estaTocando)} aria-label="Capítulo anterior">⏮</button>
        <button className="icone" onClick={() => acao("voltar")} aria-label={modo === "celular" ? "Trecho anterior" : "Voltar 15 segundos"}>
          {modo === "celular" ? "↺" : "↺15"}
        </button>
        <button className="tocar" onClick={() => acao(estaTocando ? "pausar" : "tocar")} aria-label={estaTocando ? "Pausar" : "Tocar"}>
          {estaTocando ? "⏸" : "▶"}
        </button>
        <button className="icone" onClick={() => acao("avancar")} aria-label={modo === "celular" ? "Próximo trecho" : "Avançar 30 segundos"}>
          {modo === "celular" ? "↻" : "30↻"}
        </button>
        <button className="icone" onClick={() => proximoCapitulo(1, estaTocando)} aria-label="Próximo capítulo">⏭</button>
      </div>

      <div className="velocidade cartao">
        <div className="linha">
          <span>Velocidade</span>
          <strong>{vel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}x</strong>
        </div>
        <input type="range" min={0.5} max={3} step={0.05} value={vel} onChange={(e) => mudarVelocidade(Number(e.target.value))} aria-label="Velocidade" />
        <div className="chips">
          {VELOCIDADES_RAPIDAS.map((v) => (
            <button key={v} className={Math.abs(vel - v) < 0.01 ? "ativa" : ""} onClick={() => mudarVelocidade(v)}>
              {v.toLocaleString("pt-BR")}x
            </button>
          ))}
        </div>
      </div>

      {modo === "celular" && vozesCel.length > 1 && (
        <select value={vozCel} onChange={(e) => escolherVozCelular(e.target.value)} aria-label="Voz do celular">
          <option value="">Voz padrão do celular</option>
          {vozesCel.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
        </select>
      )}
      {modo === "celular" && !FalaCelular.disponivel() && <p className="erro">Este navegador não tem voz do celular.</p>}

      {aviso && <p className="aviso">{aviso}</p>}
    </main>
  );
}
