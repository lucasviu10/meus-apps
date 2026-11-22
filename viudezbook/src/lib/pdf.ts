// Extrai o texto de cada página do PDF, no próprio celular.
// Página sem texto (imagem escaneada) passa pelo OCR em português.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { lerImagemComOcr, encerrarOcr } from "./ocr";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface ItemTexto {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
}

/** Monta as linhas da página pela posição do texto e marca parágrafos com linha em branco. */
export function montarTextoDaPagina(itens: ItemTexto[]): string {
  const linhas: { y: number; altura: number; partes: { x: number; fim: number; str: string; tam: number }[] }[] = [];
  for (const it of itens) {
    if (!it.str) continue;
    const [, , c, d, x, y] = it.transform;
    const tam = Math.hypot(c, d) || 10;
    let linha = linhas.find((l) => Math.abs(l.y - y) < tam * 0.5);
    if (!linha) {
      linha = { y, altura: tam, partes: [] };
      linhas.push(linha);
    }
    linha.partes.push({ x, fim: x + it.width, str: it.str, tam });
  }
  linhas.sort((a, b) => b.y - a.y);

  const textos = linhas.map((l) => {
    l.partes.sort((a, b) => a.x - b.x);
    let s = "";
    let fimAnterior = -Infinity;
    for (const p of l.partes) {
      if (s && !s.endsWith(" ") && !p.str.startsWith(" ") && p.x - fimAnterior > p.tam * 0.15) s += " ";
      s += p.str;
      fimAnterior = p.fim;
    }
    return s.trim();
  });

  // Espaço entre linhas: um salto bem maior que o normal indica novo parágrafo.
  const saltos = linhas.slice(1).map((l, i) => linhas[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b);
  const normal = saltos.length ? saltos[Math.floor(saltos.length / 2)] : 14;
  const saida: string[] = [];
  textos.forEach((t, i) => {
    if (i > 0 && linhas[i - 1].y - linhas[i].y > normal * 1.6) saida.push("");
    saida.push(t);
  });
  return saida.join("\n");
}

const MIN_CARACTERES = 40; // menos que isso na página = provavelmente imagem

export async function extrairPaginas(
  arquivo: File,
  aoProgredir: (mensagem: string, fracao: number) => void,
): Promise<{ paginas: string[]; paginasComOcr: number }> {
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  const paginas: string[] = [];
  let paginasComOcr = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      aoProgredir(`Lendo página ${n} de ${doc.numPages}`, (n - 1) / doc.numPages);
      const pag = await doc.getPage(n);
      const conteudo = await pag.getTextContent();
      let texto = montarTextoDaPagina(conteudo.items as ItemTexto[]);

      if (texto.replace(/\s/g, "").length < MIN_CARACTERES) {
        aoProgredir(`Página ${n} de ${doc.numPages} é imagem: lendo com OCR (mais demorado)`, (n - 1) / doc.numPages);
        const vista = pag.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = vista.width;
        canvas.height = vista.height;
        await pag.render({ canvasContext: canvas.getContext("2d")!, viewport: vista }).promise;
        const ocr = await lerImagemComOcr(canvas);
        if (ocr.replace(/\s/g, "").length > texto.replace(/\s/g, "").length) {
          texto = ocr;
          paginasComOcr++;
        }
        canvas.width = canvas.height = 0;
      }
      paginas.push(texto);
      pag.cleanup();
    }
  } finally {
    await encerrarOcr();
    await doc.destroy();
  }
  aoProgredir("Leitura concluída", 1);
  return { paginas, paginasComOcr };
}
