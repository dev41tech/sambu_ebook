// Estimativa de custo de uma geração, mostrada antes de disparar o ebook.
//
// Os números vêm da medição do acervo real, não da teoria: o app pede muito mais
// palavras por capítulo do que o modelo entrega, então estimar pelo alvo daria um
// valor várias vezes maior que a fatura.

// gpt-4o, tarifa de agosto/2026. Se o modelo mudar no .env, isto precisa mudar junto.
const USD_ENTRADA_POR_TOKEN = 2.5 / 1_000_000;
const USD_SAIDA_POR_TOKEN = 10 / 1_000_000;
const USD_POR_IMAGEM = 0.04; // gpt-image-1

const TOKENS_SYSTEM_PROMPT = 600; // vai em toda chamada
const TOKENS_CONTEXTO = 250; // tema, público, tom, idioma
const TOKENS_POR_PALAVRA = 1.4; // português
const CHARS_POR_TOKEN = 4;

// Teto observado: mesmo pedindo 4.000 palavras, os capítulos voltam com ~830.
// É esta a razão de pedir 250 páginas não produzir 250 páginas.
const PALAVRAS_POR_CAPITULO_NA_PRATICA = 830;
const MAX_CAPITULOS = 12; // espelha chapterCountFor() em server/lib/ai.ts

export interface EntradaCusto {
  pageCount: number;
  wordsPerPage: number;
  referenceChars?: number;
  generateCover?: boolean;
  imageCount?: number;
}

export interface Estimativa {
  capitulos: number;
  palavrasEstimadas: number;
  paginasEstimadas: number;
  usdTexto: number;
  usdImagens: number;
  usdTotal: number;
  /** Verdadeiro quando o sistema não consegue entregar o que foi pedido. */
  abaixoDoPedido: boolean;
}

export function capitulosPara(pageCount: number): number {
  return Math.min(MAX_CAPITULOS, Math.max(3, Math.round(pageCount / 4)));
}

export function estimarCusto(e: EntradaCusto): Estimativa {
  const capitulos = capitulosPara(e.pageCount);
  const refTokens = Math.round((e.referenceChars ?? 0) / CHARS_POR_TOKEN);

  const pedidoPorCapitulo = (e.pageCount * e.wordsPerPage) / capitulos;
  const palavrasPorCapitulo = Math.min(pedidoPorCapitulo, PALAVRAS_POR_CAPITULO_NA_PRATICA);
  const palavrasEstimadas = Math.round(palavrasPorCapitulo * capitulos + 900); // +intro e conclusão

  // Cada texto é gerado e depois humanizado: a saída conta duas vezes, e o
  // rascunho volta como entrada na segunda passada.
  const saidaTokens = Math.round(palavrasEstimadas * TOKENS_POR_PALAVRA * 2);
  const chamadas = 1 + 2 + capitulos * 2 + 2 + 1;
  const entradaTokens =
    chamadas * (TOKENS_SYSTEM_PROMPT + TOKENS_CONTEXTO + refTokens) +
    Math.round(palavrasEstimadas * TOKENS_POR_PALAVRA);

  const usdTexto = entradaTokens * USD_ENTRADA_POR_TOKEN + saidaTokens * USD_SAIDA_POR_TOKEN;
  const usdImagens = ((e.generateCover ? 1 : 0) + (e.imageCount ?? 0)) * USD_POR_IMAGEM;

  return {
    capitulos,
    palavrasEstimadas,
    paginasEstimadas: Math.round(palavrasEstimadas / e.wordsPerPage),
    usdTexto,
    usdImagens,
    usdTotal: usdTexto + usdImagens,
    abaixoDoPedido: pedidoPorCapitulo > PALAVRAS_POR_CAPITULO_NA_PRATICA,
  };
}

export function formatarUsd(v: number): string {
  return `US$ ${v.toFixed(2).replace(".", ",")}`;
}
