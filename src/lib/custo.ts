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
/** Media medida no acervo: o que um capitulo realmente rende. */
export const PALAVRAS_POR_CAPITULO = 841;
const PALAVRAS_POR_CAPITULO_NA_PRATICA = PALAVRAS_POR_CAPITULO;
/**
 * Teto de capitulos por ebook. Exportado porque o servidor (server/lib/ai.ts)
 * importa daqui: manter os dois numeros em arquivos separados ja produziu
 * estimativa mentindo sobre o que a geracao entrega.
 */
export const MAX_CAPITULOS = 100;

export interface EntradaCusto {
  pageCount: number;
  wordsPerPage: number;
  /**
   * Meta de palavras. Quando informada manda no calculo e pageCount vira apenas
   * a estimativa exibida -- paginas dependem da diagramacao, palavras nao.
   */
  wordGoal?: number;
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

// Espelha server/lib/ai.ts:chapterCountFor() -- os dois precisam concordar,
// senao este painel promete um numero de capitulos e o servidor pede outro.
// A versao anterior dividia PAGINAS por 4, o que embutia 1000 palavras por
// capitulo (4 paginas x 250 palavras/pagina) contra a entrega real de 841 --
// o painel prometia mais do que a geracao ia pedir, e o pedido em si ja saia
// 20% inflado antes de qualquer capitulo ser escrito.
export function capitulosParaPalavras(palavras: number): number {
  return Math.min(MAX_CAPITULOS, Math.max(3, Math.round(palavras / PALAVRAS_POR_CAPITULO)));
}

/** @deprecated use capitulosParaPalavras(pageCount * wordsPerPage) */
export function capitulosPara(pageCount: number, wordsPerPage = 250): number {
  return capitulosParaPalavras(pageCount * wordsPerPage);
}

export function estimarCusto(e: EntradaCusto): Estimativa {
  // A meta de palavras, quando existe, e a verdade do pedido; paginas viram uma
  // leitura dela. Sem meta, o pedido continua sendo paginas x palavras/pagina.
  const palavrasPedidas = e.wordGoal && e.wordGoal > 0 ? e.wordGoal : e.pageCount * e.wordsPerPage;
  const capitulos = capitulosParaPalavras(palavrasPedidas);
  const refTokens = Math.round((e.referenceChars ?? 0) / CHARS_POR_TOKEN);

  const pedidoPorCapitulo = palavrasPedidas / capitulos;
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
    // Comparar palavras por capitulo disparava o aviso ate quando a entrega
    // estava em dia -- um pedido de 20 paginas rende 20 paginas e ainda assim
    // acusava. O que importa ao usuario e quantas paginas ele recebe.
    abaixoDoPedido: palavrasEstimadas / palavrasPedidas < 0.85,
  };
}

export function formatarUsd(v: number): string {
  return `US$ ${v.toFixed(2).replace(".", ",")}`;
}
