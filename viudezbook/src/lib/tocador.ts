// Tocador do áudio do ElevenLabs. Cada capítulo é uma sequência de blocos
// (arquivos MP3); para quem ouve, parece um áudio só.

export interface Faixa {
  bloco: number;
  url: string;
  duracao: number;
}

export class TocadorBlocos {
  readonly audio = new Audio();
  private faixas: Faixa[] = [];
  private inicio: number[] = [];
  private atual = 0;
  private querTocar = false;
  private vel = 1;

  constructor(
    private aoAtualizar: () => void,
    private aoTerminarCapitulo: () => void,
    private aoFaltarBloco: (proximoBloco: number) => Promise<Faixa | null>,
  ) {
    this.audio.preload = "auto";
    if (import.meta.env.DEV) (window as any).__vbAudio = this.audio; // só para testes
    // Velocidade sem mudar o tom da voz.
    (this.audio as any).preservesPitch = true;
    (this.audio as any).mozPreservesPitch = true;
    this.audio.addEventListener("timeupdate", () => this.aoAtualizar());
    this.audio.addEventListener("play", () => this.aoAtualizar());
    this.audio.addEventListener("pause", () => this.aoAtualizar());
    this.audio.addEventListener("ended", () => this.fimDoBloco());
  }

  carregar(faixas: Faixa[], segundo: number) {
    this.faixas = [...faixas].sort((a, b) => a.bloco - b.bloco);
    this.recalcular();
    this.irPara(segundo);
  }

  /** Acrescenta blocos que acabaram de ser gerados ("ouvir já"). */
  acrescentar(f: Faixa) {
    if (this.faixas.some((x) => x.bloco === f.bloco)) return;
    this.faixas.push(f);
    this.faixas.sort((a, b) => a.bloco - b.bloco);
    this.recalcular();
    this.aoAtualizar();
  }

  private recalcular() {
    let soma = 0;
    this.inicio = this.faixas.map((f) => {
      const s = soma;
      soma += f.duracao;
      return s;
    });
  }

  private async fimDoBloco() {
    const prox = this.atual + 1;
    if (prox < this.faixas.length) {
      this.trocar(prox, 0, true);
      return;
    }
    // Pode ser que o próximo bloco ainda esteja sendo gerado.
    const ultimo = this.faixas[this.faixas.length - 1];
    const nova = ultimo ? await this.aoFaltarBloco(ultimo.bloco + 1) : null;
    if (nova) {
      this.acrescentar(nova);
      this.trocar(this.faixas.findIndex((f) => f.bloco === nova.bloco), 0, true);
    } else {
      this.querTocar = false;
      this.aoTerminarCapitulo();
    }
  }

  private trocar(indice: number, deslocamento: number, tocar: boolean) {
    const f = this.faixas[indice];
    if (!f) return;
    this.atual = indice;
    this.querTocar = tocar;
    const aplicar = () => {
      this.audio.currentTime = Math.min(deslocamento, Math.max(0, (this.audio.duration || f.duracao) - 0.2));
      this.audio.defaultPlaybackRate = this.vel;
      this.audio.playbackRate = this.vel;
      if (this.querTocar) this.audio.play().catch(() => this.aoAtualizar());
    };
    if (this.audio.src !== f.url) {
      this.audio.src = f.url;
      this.audio.addEventListener("loadedmetadata", aplicar, { once: true });
      this.audio.load();
    } else {
      aplicar();
    }
    this.aoAtualizar();
  }

  tocar() {
    this.querTocar = true;
    if (!this.audio.src && this.faixas.length) return this.trocar(0, 0, true);
    this.audio.playbackRate = this.vel;
    this.audio.play().catch(() => this.aoAtualizar());
  }

  pausar() {
    this.querTocar = false;
    this.audio.pause();
  }

  tocando() {
    return !this.audio.paused;
  }

  posicao(): number {
    return (this.inicio[this.atual] ?? 0) + (this.audio.currentTime || 0);
  }

  duracao(): number {
    return this.faixas.reduce((s, f) => s + f.duracao, 0);
  }

  irPara(segundo: number) {
    if (!this.faixas.length) return;
    const total = this.duracao();
    const alvo = Math.max(0, Math.min(segundo, total - 0.5));
    let i = this.inicio.findIndex((s, k) => alvo >= s && alvo < s + this.faixas[k].duracao);
    if (i < 0) i = this.faixas.length - 1;
    this.trocar(i, alvo - this.inicio[i], this.querTocar || this.tocando());
  }

  pular(delta: number) {
    this.irPara(this.posicao() + delta);
  }

  definirVelocidade(v: number) {
    this.vel = v;
    this.audio.defaultPlaybackRate = v;
    this.audio.playbackRate = v;
  }

  destruir() {
    this.querTocar = false;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
