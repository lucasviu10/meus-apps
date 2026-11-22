// Plano B grátis: a voz do próprio celular lê o texto.
// Menos natural, mas não gasta crédito.

export function vozesDoCelular(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
}

export class FalaCelular {
  private trechos: string[] = [];
  private indice = 0;
  private vel = 1;
  private ativo = false;
  private geracao = 0; // ignora o "fim" de falas canceladas
  voz: SpeechSynthesisVoice | null = null;

  constructor(private aoAtualizar: () => void, private aoTerminar: () => void) {}

  static disponivel() {
    return "speechSynthesis" in window;
  }

  carregar(trechos: string[], indice: number) {
    this.parar();
    this.trechos = trechos;
    this.indice = Math.max(0, Math.min(indice, trechos.length - 1));
    this.aoAtualizar();
  }

  private falar() {
    const minha = ++this.geracao;
    speechSynthesis.cancel();
    const texto = this.trechos[this.indice];
    if (!texto) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = this.voz?.lang ?? "pt-BR";
    if (this.voz) u.voice = this.voz;
    u.rate = this.vel;
    u.onend = () => {
      if (minha !== this.geracao || !this.ativo) return;
      if (this.indice < this.trechos.length - 1) {
        this.indice++;
        this.aoAtualizar();
        this.falar();
      } else {
        this.ativo = false;
        this.aoAtualizar();
        this.aoTerminar();
      }
    };
    u.onerror = () => {
      if (minha === this.geracao) {
        this.ativo = false;
        this.aoAtualizar();
      }
    };
    speechSynthesis.speak(u);
  }

  tocar() {
    if (!this.trechos.length) return;
    this.ativo = true;
    this.falar();
    this.aoAtualizar();
  }

  pausar() {
    this.parar();
    this.aoAtualizar();
  }

  private parar() {
    this.ativo = false;
    this.geracao++;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  tocando() {
    return this.ativo;
  }

  posicao() {
    return this.indice;
  }

  total() {
    return this.trechos.length;
  }

  irPara(indice: number) {
    this.indice = Math.max(0, Math.min(indice, this.trechos.length - 1));
    if (this.ativo) this.falar();
    this.aoAtualizar();
  }

  definirVelocidade(v: number) {
    this.vel = v;
    if (this.ativo) this.falar(); // recomeça o trecho atual na nova velocidade
  }

  destruir() {
    this.parar();
  }
}
