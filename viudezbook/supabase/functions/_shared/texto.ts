// Limpeza do texto e divisão em capítulos e blocos.
// Código puro (sem dependências): roda no servidor (Deno) e nos testes (Node).

export interface Capitulo {
  numero: number;
  titulo: string;
  texto: string; // parágrafos separados por "\n\n"
}

// Pronomes que vêm depois do hífen em português ("disse-lhe", "fê-lo").
// Se a linha quebra nesse hífen, ele é mantido.
const CLITICOS = new Set([
  "me", "te", "se", "lhe", "lhes", "nos", "vos", "o", "a", "os", "as",
  "lo", "la", "los", "las", "no", "na", "nas", "mo", "ma", "to", "ta",
]);

function normalizarCaracteres(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/­/g, "") // hífen invisível
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/[¹²³⁰-⁹]+/g, "") // números de nota sobrescritos
    .replace(/\[\d{1,3}\]/g, "") // referências de nota [1]
    .replace(/[ \t ]+/g, " ");
}

// Linha que é só número de página: "12", "- 12 -", "Página 12", "pág. 12".
const RE_NUMERO_PAGINA = /^[-–—\s]*(p[áa]g(ina)?\.?\s*)?\d{1,4}[-–—\s]*$/i;

function chaveRepeticao(linha: string): string {
  return linha.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Recebe o texto de cada página (linhas separadas por "\n", parágrafos por linha
 * em branco) e devolve o texto limpo com parágrafos separados por "\n\n".
 * Remove número de página, cabeçalho e rodapé repetidos e hífen de fim de linha.
 */
export function limparPaginas(paginas: string[]): string {
  const pags = paginas.map((p) =>
    normalizarCaracteres(p).split("\n").map((l) => l.trim())
  );

  // Cabeçalhos e rodapés: linhas nas 2 primeiras ou 2 últimas posições
  // (ignorando linhas vazias) que se repetem em muitas páginas.
  const contagem = new Map<string, number>();
  const bordas = (linhas: string[]) => {
    const cheias = linhas.map((l, i) => ({ l, i })).filter((x) => x.l);
    return [...cheias.slice(0, 2), ...cheias.slice(-2)];
  };
  for (const linhas of pags) {
    const vistas = new Set<string>();
    for (const { l } of bordas(linhas)) {
      const k = chaveRepeticao(l);
      if (k.length < 3 || l.length > 90 || vistas.has(k)) continue;
      vistas.add(k);
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
  }
  const minimo = Math.max(3, Math.ceil(pags.length * 0.3));
  const repetidas = new Set(
    [...contagem.entries()].filter(([, n]) => n >= minimo).map(([k]) => k)
  );

  const todasLinhas: string[] = [];
  for (const linhas of pags) {
    const bordaIdx = new Set(bordas(linhas).map((x) => x.i));
    linhas.forEach((l, i) => {
      if (bordaIdx.has(i)) {
        if (RE_NUMERO_PAGINA.test(l)) return;
        if (repetidas.has(chaveRepeticao(l))) return;
      }
      todasLinhas.push(l);
    });
    // fim de página não é fim de parágrafo: nada é inserido aqui
  }
  return montarParagrafos(todasLinhas);
}

// O OCR às vezes lê o "I" romano como "[", "|", "l" ou "1": "CAPÍTULO [" -> "CAPÍTULO I".
function corrigirTituloOcr(linha: string): string {
  return linha.replace(/^(cap[íi]tulo|parte|livro)\s+([\[\]|!lI1]{1,4})\s*$/i, (_m, a: string, b: string) =>
    `${a} ${"I".repeat(b.length)}`,
  );
}

// Linha curta, toda em MAIÚSCULAS e sem ponto final: costuma ser título ("A CASA VERDE").
function ehLinhaDeTitulo(linha: string): boolean {
  if (linha.length > 60 || linha.length < 3) return false;
  if (!/[A-ZÀ-Ý]{3}/.test(linha) || linha !== linha.toUpperCase()) return false;
  return !/[.,;]$/.test(linha);
}

/** Junta linhas em parágrafos. Linha vazia separa parágrafos. */
export function montarParagrafos(linhas: string[]): string {
  const comprimentos = linhas.filter((l) => l.length > 20).map((l) => l.length).sort((a, b) => a - b);
  const mediana = comprimentos.length ? comprimentos[Math.floor(comprimentos.length / 2)] : 60;

  const paragrafos: string[] = [];
  let atual = "";
  let anterior = "";
  const fechar = () => {
    const p = atual.replace(/\s+/g, " ").trim();
    if (p) paragrafos.push(p);
    atual = "";
  };

  for (const bruta of linhas) {
    const linha = corrigirTituloOcr(bruta);
    if (!linha) {
      fechar();
      anterior = "";
      continue;
    }
    // Título de capítulo (ou linha curta toda em maiúsculas) vira parágrafo próprio.
    if (ehTitulo(linha) || ehLinhaDeTitulo(linha)) {
      fechar();
      paragrafos.push(linha);
      anterior = "";
      continue;
    }
    const começaDialogo = /^[—–]/.test(linha) || /^-\s/.test(linha);
    const anteriorCurtaComPonto =
      anterior.length > 0 && anterior.length < mediana * 0.7 && /[.!?:»"”)]$/.test(anterior);
    if (atual && (começaDialogo || anteriorCurtaComPonto)) fechar();

    if (!atual) {
      atual = linha;
    } else if (/[A-Za-zÀ-ÿ]-$/.test(atual) && /^[a-zà-ÿ]/.test(linha)) {
      // hífen de fim de linha
      const proxima = linha.match(/^[a-zà-ÿ]+/)?.[0] ?? "";
      atual = CLITICOS.has(proxima) ? atual + linha : atual.slice(0, -1) + linha;
    } else {
      atual += " " + linha;
    }
    anterior = linha;
  }
  fechar();
  return paragrafos.join("\n\n");
}

/** Limpa um .txt do Projeto Gutenberg: tira o aviso de início e fim. */
export function limparGutenberg(bruto: string): string {
  let t = normalizarCaracteres(bruto);
  const inicio = t.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  if (inicio >= 0) t = t.slice(t.indexOf("\n", inicio) + 1);
  const fim = t.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (fim >= 0) t = t.slice(0, fim);
  t = t.replace(/^\s*(Produced by|E-text prepared by)[^\n]*(\n[^\n]+)*\n/i, "");
  t = t.replace(/_/g, ""); // itálico marcado com sublinhado
  return montarParagrafos(t.split("\n").map((l) => l.trim()));
}

// ---------- Capítulos ----------

const ORDINAIS =
  "primeiro|segundo|terceiro|quarto|quinto|sexto|s[ée]timo|oitavo|nono|d[ée]cimo|vig[ée]simo|trig[ée]simo|[úu]nico";
const RE_CAPITULO = new RegExp(
  `^(cap[íi]tulo|cap\\.|parte|livro|canto|ato)\\s+([0-9]{1,3}|[ivxlcdm]{1,7}|(${ORDINAIS})(\\s+(primeiro|segundo|terceiro|quarto|quinto|sexto|s[ée]timo|oitavo|nono))?)\\b[^\\n]{0,80}$`,
  "i"
);
const RE_ROMANO = /^[IVXLCDM]{1,7}\.?$/;

function ehTitulo(p: string): boolean {
  if (p.length > 100) return false;
  return RE_CAPITULO.test(p) || RE_ROMANO.test(p);
}

function ehSubtitulo(p: string): boolean {
  if (!p || p.length > 90) return false;
  if (/[.!?;,]$/.test(p) && p !== p.toUpperCase()) return false;
  return true;
}

const TAMANHO_PARTE = 15000; // para livros sem capítulos marcados

/** Divide o texto limpo em capítulos. Nunca descarta texto. */
export function dividirCapitulos(texto: string): Capitulo[] {
  const paras = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const brutos: { titulo: string; paras: string[] }[] = [];
  let atual: { titulo: string; paras: string[] } = { titulo: "", paras: [] };

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (ehTitulo(p)) {
      brutos.push(atual);
      let titulo = p.replace(/\.$/, "");
      const prox = paras[i + 1];
      if (prox && !ehTitulo(prox) && ehSubtitulo(prox)) {
        titulo += " — " + prox.replace(/\.$/, "");
        i++;
      }
      atual = { titulo, paras: [] };
    } else {
      atual.paras.push(p);
    }
  }
  brutos.push(atual);

  // Junta capítulos minúsculos (ex.: sumário) ao seguinte, sem perder texto.
  const juntos: { titulo: string; paras: string[] }[] = [];
  let pendente: string[] = [];
  for (const c of brutos) {
    const tamanho = c.paras.join(" ").length;
    if (tamanho < 200 && c !== brutos[brutos.length - 1]) {
      pendente.push(...c.paras);
      continue;
    }
    juntos.push({ titulo: c.titulo, paras: [...pendente, ...c.paras] });
    pendente = [];
  }
  if (pendente.length) {
    if (juntos.length) juntos[juntos.length - 1].paras.push(...pendente);
    else juntos.push({ titulo: "", paras: pendente });
  }

  const comTexto = juntos.filter((c) => c.paras.length);
  const marcados = comTexto.filter((c) => c.titulo).length;

  const totalLetras = comTexto.reduce((s, c) => s + c.paras.join(" ").length, 0);
  const usarCapitulos = marcados >= 2 || (marcados === 1 && totalLetras < TAMANHO_PARTE * 2);

  // Sem capítulos marcados: divide em partes de tamanho parecido (o título, se houver, vira texto).
  if (!usarCapitulos) {
    const todos = comTexto.flatMap((c) => (c.titulo ? [c.titulo, ...c.paras] : c.paras));
    const partes: Capitulo[] = [];
    let buf: string[] = [];
    let tam = 0;
    for (const p of todos) {
      buf.push(p);
      tam += p.length;
      if (tam >= TAMANHO_PARTE) {
        partes.push({ numero: partes.length + 1, titulo: `Parte ${partes.length + 1}`, texto: buf.join("\n\n") });
        buf = [];
        tam = 0;
      }
    }
    if (buf.length) {
      if (partes.length && tam < 2000) partes[partes.length - 1].texto += "\n\n" + buf.join("\n\n");
      else partes.push({ numero: partes.length + 1, titulo: `Parte ${partes.length + 1}`, texto: buf.join("\n\n") });
    }
    if (partes.length === 1) partes[0].titulo = "Texto completo";
    return partes;
  }

  return comTexto.map((c, i) => ({
    numero: i + 1,
    titulo: c.titulo || "Abertura",
    texto: c.paras.join("\n\n"),
  }));
}

// ---------- Blocos para o ElevenLabs ----------

export const TAMANHO_BLOCO = 2500; // bem abaixo do limite por geração do ElevenLabs

function quebrarLongo(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const frases = p.match(/[^.!?…]+[.!?…]+["”»)]*\s*|[^.!?…]+$/g) ?? [p];
  const out: string[] = [];
  let buf = "";
  for (const f of frases) {
    if ((buf + f).length > max && buf) {
      out.push(buf.trim());
      buf = "";
    }
    if (f.length > max) {
      let resto = f;
      while (resto.length > max) {
        const corte = resto.lastIndexOf(" ", max);
        const pos = corte > max / 2 ? corte : max;
        out.push(resto.slice(0, pos).trim());
        resto = resto.slice(pos);
      }
      buf = resto;
    } else {
      buf += f;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Blocos de texto de um capítulo, já com o título falado no começo. */
export function blocosDoCapitulo(titulo: string, texto: string, max = TAMANHO_BLOCO): string[] {
  const paras = [titulo ? titulo.replace(/\s*—\s*/g, ". ") + "." : "", ...texto.split(/\n{2,}/)]
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => quebrarLongo(p, max));
  const blocos: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf + "\n\n" + p).length > max) {
      blocos.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) blocos.push(buf);
  return blocos;
}

/** Trechos curtos para a voz do celular (o navegador corta falas muito longas). */
export function trechosParaFala(texto: string, max = 400): string[] {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => quebrarLongo(p, max));
}
