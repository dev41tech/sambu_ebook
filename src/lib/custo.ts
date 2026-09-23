// Estimativa de custo de uma geração, mostrada antes de disparar o ebook.
//
// Os números vêm da medição do acervo real, não da teoria: o app pede muito mais
// palavras por capítulo do que o modelo entrega, então estimar pelo alvo daria um
// valor várias vezes maior que a fatura.

// ATENCAO: estes numeros sao do gpt-4o, tarifa de agosto/2026, e o app passou a
// rodar em gpt-5.5 (setembro/2026). A estimativa esta ERRADA para baixo por dois
// motivos somados:
//
//   1. a tarifa do gpt-5.5 nao foi medida e nao esta aqui;
//   2. modelo de raciocinio cobra tambem os tokens de pensamento, que nao
//      aparecem no texto -- foram ~2.000 a ~2.600 por chamada nas medicoes.
//
// Preferimos deixar o numero antigo com este aviso a inventar uma tarifa: um
// valor plausivel e falso e pior do que um valor sabidamente desatualizado.
// Recalibrar exige uma fatura real do gpt-5.5. Ver docs/ADOCAO-GPT-5.5.md.
const USD_ENTRADA_POR_TOKEN = 2.5 / 1_000_000;
const USD_SAIDA_POR_TOKEN = 10 / 1_000_000;
const USD_POR_IMAGEM = 0.04; // gpt-image-1

const TOKENS_SYSTEM_PROMPT = 600; // vai em toda chamada
const TOKENS_CONTEXTO = 250; // tema, público, tom, idioma
/**
 * Tokens por palavra em portugues. Exportado porque server/lib/ai.ts deriva o
 * teto de saida de cada chamada a partir do alvo em palavras -- manter os dois
 * numeros separados ja produziu estimativa mentindo sobre o que a geracao faz.
 */
export const TOKENS_POR_PALAVRA = 1.4;
const CHARS_POR_TOKEN = 4;

/**
 * O que um capitulo realmente rende, medido no acervo.
 *
 * Era 841, a media do gpt-4o -- que devolvia ~830 palavras mesmo quando se
 * pedia 4.000. O gpt-5.5 (adotado em 10/09) tem outro tamanho natural: nos sete
 * livros gerados entre 14 e 18/09 o sumario pediu ~833 palavras por capitulo e
 * recebeu medias de 1.266 a 1.550 (mediana 1.399). "O Pacto das Marés" fechou
 * com 77 mil palavras para uma meta de 45 mil. O unico livro em que a meta ja
 * estava perto disso ("Preparando para o Carro Elétrico", meta 1.448) recebeu
 * 1.330 -- ou seja, pedindo ~1.400 o modelo entrega ~1.400.
 *
 * Com 841, a conta dividia o livro em capitulos demais: cada um saia com 70% a
 * mais que o pedido, e o livro inteiro junto. Remedir se o modelo mudar.
 */
export const PALAVRAS_POR_CAPITULO = 1400;
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
  /** Capitulos escolhidos pelo usuario. Ausente/0 = conta automatica. */
  capitulos?: number;
  /** Introducao e conclusao sao opcionais; ausente = incluidas. */
  incluirIntro?: boolean;
  incluirConclusao?: boolean;
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

/**
 * Numero de capitulos escolhido pelo usuario, validado. Devolve null quando nao
 * ha escolha valida -- quem chama cai na conta automatica. Sem o piso de 3 da
 * conta automatica: um conto em capitulo unico e escolha legitima.
 */
export function capitulosEscolhidos(valor: unknown): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_CAPITULOS, Math.round(n));
}

/** @deprecated use capitulosParaPalavras(pageCount * wordsPerPage) */
export function capitulosPara(pageCount: number, wordsPerPage = 250): number {
  return capitulosParaPalavras(pageCount * wordsPerPage);
}

export function estimarCusto(e: EntradaCusto): Estimativa {
  // A meta de palavras, quando existe, e a verdade do pedido; paginas viram uma
  // leitura dela. Sem meta, o pedido continua sendo paginas x palavras/pagina.
  const palavrasPedidas = e.wordGoal && e.wordGoal > 0 ? e.wordGoal : e.pageCount * e.wordsPerPage;
  const capitulos = capitulosEscolhidos(e.capitulos) ?? capitulosParaPalavras(palavrasPedidas);
  const refTokens = Math.round((e.referenceChars ?? 0) / CHARS_POR_TOKEN);

  const pedidoPorCapitulo = palavrasPedidas / capitulos;
  const palavrasPorCapitulo = Math.min(pedidoPorCapitulo, PALAVRAS_POR_CAPITULO_NA_PRATICA);
  const comIntro = e.incluirIntro !== false;
  const comConclusao = e.incluirConclusao !== false;
  // ~450 palavras cada (o prompt pede de 300 a 450).
  const palavrasExtras = (comIntro ? 450 : 0) + (comConclusao ? 450 : 0);
  const palavrasEstimadas = Math.round(palavrasPorCapitulo * capitulos + palavrasExtras);

  // Cada texto é gerado e depois humanizado: a saída conta duas vezes, e o
  // rascunho volta como entrada na segunda passada.
  const saidaTokens = Math.round(palavrasEstimadas * TOKENS_POR_PALAVRA * 2);
  // sumario + (intro: escrever e humanizar) + capitulos x 2 + (conclusao: idem) + 1
  const chamadas = 1 + (comIntro ? 2 : 0) + capitulos * 2 + (comConclusao ? 2 : 0) + 1;
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
