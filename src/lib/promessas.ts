// O que o gênero e a instrução do autor prometem de uma história. Compartilhado
// entre o servidor (sumário, historia.ts) e a tela de criação, que usa isto para
// recomendar uma extensão em que as promessas caibam.
//
// Origem: 2ª versão de "Depois da Última Chave" (leitora 6/10) — traição
// revelada cedo, romance tardio, "final inesperado" previsível. E, nas versões 3
// e 4, 8 capítulos de ~900 palavras: pouco espaço para romance e traição juntos.

import { PALAVRAS_POR_CAPITULO } from "./custo";

export interface Promessas {
  /** Romance: o casal tem arco próprio, com um passo em cada capítulo. */
  romance: boolean;
  /** Traição, segredo, mistério, crime: a verdade central chega em camadas, perto do fim. */
  revelacao: boolean;
  /** "Final inesperado", "reviravolta": a virada é decidida e plantada no sumário. */
  viradaFinal: boolean;
}

export function promessasDoPedido(p: {
  theme: string;
  secondaryCategories?: string[] | null;
  extraInstructions?: string | null;
}): Promessas {
  const classificacao = [p.theme, ...(p.secondaryCategories ?? [])].filter(Boolean);
  const instrucao = p.extraInstructions ?? "";
  const tudo = `${classificacao.join(" ; ")} ; ${instrucao}`;
  return {
    // "Romance" no grupo da taxonomia é o gênero; na instrução ("crie um
    // romance") pode ser só "livro de ficção", então ali só contam termos
    // inequívocos.
    romance:
      classificacao.some((c) => /^\s*romance\b/i.test(c) || /romântic|romantic/i.test(c)) ||
      /romântic|romantic|história de amor|par romântico|casal apaixonad/i.test(instrucao),
    revelacao: /trai[çc]|segredo|mist[ée]ri|suspense|thriller|policial|crime|investiga|conspira|golpe|fraude/i.test(tudo),
    viradaFinal: /inesperad|reviravolta|surpreend|surpresa|twist|imprevis/i.test(tudo),
  };
}

/** Abaixo disto um capítulo de história não comporta uma cena com começo, virada e fim. */
export const PALAVRAS_MINIMAS_POR_CAPITULO = 700;

/**
 * Quantos capítulos a história precisa para caber o que o pedido promete: 5
 * para a estrutura básica (apresentação, complicação, crise, clímax, desfecho)
 * e um a mais para cada promessa — o arco do casal, a revelação em camadas, a
 * virada plantada. Limitado ao que a extensão pedida comporta. Só vale na conta
 * automática: quem escolheu o número de capítulos na tela manda.
 */
export function capitulosMinimosDaHistoria(pr: Promessas, palavrasAlvo: number): number {
  const camadas = 5 + (pr.romance ? 1 : 0) + (pr.revelacao ? 1 : 0) + (pr.viradaFinal ? 1 : 0);
  const cabem = Math.floor(palavrasAlvo / PALAVRAS_MINIMAS_POR_CAPITULO);
  return Math.max(3, Math.min(camadas, cabem));
}

/**
 * Extensão (em palavras) em que as promessas cabem com capítulos do tamanho que
 * o modelo escreve bem (PALAVRAS_POR_CAPITULO). Sem promessa, 0: nada a recomendar.
 */
export function palavrasRecomendadas(pr: Promessas): number {
  const promessas = (pr.romance ? 1 : 0) + (pr.revelacao ? 1 : 0) + (pr.viradaFinal ? 1 : 0);
  if (promessas === 0) return 0;
  return (5 + promessas) * PALAVRAS_POR_CAPITULO;
}
