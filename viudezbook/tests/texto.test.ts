import { describe, expect, it } from "vitest";
import {
  blocosDoCapitulo,
  dividirCapitulos,
  limparGutenberg,
  limparPaginas,
  TAMANHO_BLOCO,
} from "../supabase/functions/_shared/texto.ts";

const PALAVRAS = ["casa", "rio", "vila", "padre", "mar", "noite"];
const corpo = (pag: number) =>
  [`Na página ${PALAVRAS[pag]} começa o texto corrido que segue até a próxima`,
   "linha sem parar, como em qualquer livro impresso de verdade e bem comum",
   "e termina aqui."].join("\n");

describe("limparPaginas", () => {
  const paginas = Array.from({ length: 6 }, (_, i) =>
    [`O ALIENISTA — Machado de Assis`, "", corpo(i), "", `${i + 10}`].join("\n")
  );
  const limpo = limparPaginas(paginas);

  it("tira número de página", () => {
    expect(limpo).not.toMatch(/(^|\n)1[0-5](\n|$)/);
  });
  it("tira cabeçalho repetido", () => {
    expect(limpo).not.toContain("O ALIENISTA — Machado de Assis");
  });
  it("mantém o texto", () => {
    expect(limpo).toContain("Na página casa começa o texto corrido que segue até a próxima linha sem parar");
  });
  it("junta hífen de fim de linha, mas mantém pronome", () => {
    const t = limparPaginas(["A casa era gran-\ndíssima e ele disse-\nlhe tudo."]);
    expect(t).toBe("A casa era grandíssima e ele disse-lhe tudo.");
  });
  it("separa falas com travessão", () => {
    const t = limparPaginas(["Ele chegou.\n— Bom dia, disse.\n— Bom dia."]);
    expect(t.split("\n\n")).toHaveLength(3);
  });
});

describe("títulos vindos do PDF", () => {
  it("título colado no texto vira capítulo (sem linha em branco)", () => {
    const corpo = "O texto do capítulo começa aqui e segue por várias linhas de um livro\nqualquer até terminar com ponto final bem aqui no fim da linha toda.\n".repeat(4);
    const pag = `CAPÍTULO I\nA CHEGADA\n${corpo}CAPÍTULO II\nA CASA VERDE\n${corpo}`;
    const caps = dividirCapitulos(limparPaginas([pag]));
    expect(caps.map((c) => c.titulo)).toEqual(["CAPÍTULO I — A CHEGADA", "CAPÍTULO II — A CASA VERDE"]);
  });
  it("corrige o I romano lido errado pelo OCR", () => {
    const corpo = "Texto do capítulo bem comprido. ".repeat(20);
    const caps = dividirCapitulos(limparPaginas([`CAPÍTULO [\n\n${corpo}\n\nCAPÍTULO ||\n\n${corpo}`]));
    expect(caps.map((c) => c.titulo)).toEqual(["CAPÍTULO I", "CAPÍTULO II"]);
  });
});

describe("limparGutenberg", () => {
  it("tira o aviso do Gutenberg e o sublinhado", () => {
    const bruto =
      "The Project Gutenberg eBook\nlicença...\n*** START OF THE PROJECT GUTENBERG EBOOK O ALIENISTA ***\n\nCAPITULO I\n\nTexto _importante_\ncontinua.\n\n*** END OF THE PROJECT GUTENBERG EBOOK ***\nlicença no fim";
    const t = limparGutenberg(bruto);
    expect(t).not.toMatch(/Gutenberg|licença/i);
    expect(t).toContain("Texto importante continua.");
  });
});

describe("dividirCapitulos", () => {
  const longo = "Texto do capítulo bem comprido. ".repeat(20);
  it("acha capítulos e junta o subtítulo", () => {
    const t = [
      "O ALIENISTA",
      "CAPITULO PRIMEIRO",
      "DE COMO ITAGUAHY GANHOU UMA CASA DE ORATES",
      longo,
      "CAPITULO II",
      "TORRENTES DE LOUCOS",
      longo,
      "CAPÍTULO 3",
      longo,
    ].join("\n\n");
    const caps = dividirCapitulos(t);
    expect(caps).toHaveLength(3);
    expect(caps[0].titulo).toBe("CAPITULO PRIMEIRO — DE COMO ITAGUAHY GANHOU UMA CASA DE ORATES");
    expect(caps[0].texto).toContain("O ALIENISTA"); // texto antes do 1º capítulo não some
    expect(caps[2].titulo).toBe("CAPÍTULO 3");
  });

  it("sem capítulos: divide em partes sem perder texto", () => {
    const paras = Array.from({ length: 100 }, (_, i) => `Parágrafo ${i}. ` + "palavra ".repeat(60));
    const caps = dividirCapitulos(paras.join("\n\n"));
    expect(caps.length).toBeGreaterThan(1);
    expect(caps.map((c) => c.texto).join("\n\n")).toBe(paras.map((p) => p.trim()).join("\n\n"));
  });

  it("um só capítulo marcado mantém o título", () => {
    const caps = dividirCapitulos(["CAPÍTULO I", "A CHEGADA", longo].join("\n\n"));
    expect(caps.map((c) => c.titulo)).toEqual(["CAPÍTULO I — A CHEGADA"]);
  });

  it("numeral romano sozinho vira capítulo", () => {
    const caps = dividirCapitulos(["I", longo, "II", longo].join("\n\n"));
    expect(caps.map((c) => c.titulo)).toEqual(["I", "II"]);
  });
});

describe("blocosDoCapitulo", () => {
  it("nenhum bloco passa do limite e nada se perde", () => {
    const texto = Array.from({ length: 40 }, (_, i) => `Frase ${i} ` + "um pouco de texto. ".repeat(15)).join("\n\n");
    const blocos = blocosDoCapitulo("Capítulo I — Início", texto);
    expect(blocos.every((b) => b.length <= TAMANHO_BLOCO)).toBe(true);
    expect(blocos[0].startsWith("Capítulo I. Início.")).toBe(true);
    const semEspaco = (s: string) => s.replace(/\s+/g, "");
    expect(semEspaco(blocos.join(" "))).toBe(semEspaco("Capítulo I. Início." + texto));
  });
});
