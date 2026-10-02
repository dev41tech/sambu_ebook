// Camada editorial da não ficção (03/10/2026): o equivalente, para livro de
// saúde, comportamento, finanças, técnico e prático, do que a ficção já tinha.
//
//   verdade da trama  -> TESE: a ideia central que todos os capítulos sustentam
//   fios da trama     -> PERGUNTAS DO LEITOR: o que ele traz ao abrir o livro,
//                        cada uma com o capítulo que a responde
//
// Mais de 70% do acervo é não ficção, e até aqui nada conferia se um livro de
// finanças respondia o que prometeu ou se o capítulo 9 repetia o 4.
//
// Puro de propósito (sem banco, sem IA), para ser testado isolado.

import type { Outline } from "./ai";

export interface PerguntaDoLeitor {
  pergunta: string;
  /** Capítulo (1 = primeiro) que responde. */
  capitulo: number;
}

/** Instrução extra do sumário de não ficção. */
export function instrucaoTese(totalCapitulos: number): string {
  return `
TESE DO LIVRO: diga em "tese", em uma ou duas frases, a ideia central que o livro defende — o que o leitor vai entender ou conseguir fazer que não entendia antes. Todos os capítulos sustentam essa tese, cada um por um ângulo diferente; nenhum a contradiz.
PERGUNTAS DO LEITOR: liste em "perguntasDoLeitor" de 4 a 10 perguntas concretas que o leitor deste público traz ao abrir o livro (as que ele faria a um especialista), cada uma com o capítulo que a responde ("capitulo", de 1 a ${totalCapitulos}). Toda pergunta tem resposta no livro; nenhum capítulo fica sem responder ao menos uma.`;
}

export function schemaTese(): string {
  return `
  "tese": "a ideia central do livro, em uma ou duas frases",
  "perguntasDoLeitor": [{ "pergunta": "...", "capitulo": 1 }],`;
}

function perguntasValidas(outline: Outline): PerguntaDoLeitor[] {
  const n = outline.chapters.length;
  return (outline.perguntasDoLeitor ?? []).filter(
    (p) => (p?.pergunta || "").trim() && Number.isInteger(Number(p.capitulo)) && Number(p.capitulo) >= 1 && Number(p.capitulo) <= n,
  );
}

/** O que falta no sumário de não ficção, em frases de correção. Lista vazia = aceito. */
export function problemasDaTese(outline: Outline): string[] {
  const n = outline.chapters.length;
  if (n === 0) return [];
  const problemas: string[] = [];
  if (!(outline.tese || "").trim()) problemas.push(`Falta "tese": a ideia central do livro, em uma ou duas frases.`);
  const perguntas = perguntasValidas(outline);
  if (perguntas.length < 3) {
    problemas.push(`Faltam "perguntasDoLeitor": pelo menos 4 perguntas do leitor, cada uma com o capítulo (1 a ${n}) que a responde.`);
  } else {
    const semPergunta = outline.chapters.map((_, i) => i + 1).filter((c) => !perguntas.some((p) => Number(p.capitulo) === c));
    if (semPergunta.length > Math.floor(n / 3)) {
      problemas.push(`Os capítulos ${semPergunta.join(", ")} não respondem nenhuma pergunta do leitor: ligue cada capítulo a uma pergunta real ou funda capítulos.`);
    }
  }
  return problemas;
}

/** Para a escrita do capítulo: a tese e as perguntas que ele responde. Vazio sem tese nem perguntas. */
export function teseBlock(outline: Outline, idx: number): string {
  const tese = (outline.tese || "").trim();
  const aqui = perguntasValidas(outline).filter((p) => Number(p.capitulo) === idx + 1);
  const partes: string[] = [];
  if (tese) {
    partes.push(`TESE DO LIVRO: ${tese}\nEste capítulo sustenta a tese pelo ângulo dele — sem repeti-la com outras palavras e sem contradizê-la.`);
  }
  if (aqui.length > 0) {
    partes.push(`PERGUNTAS QUE ESTE CAPÍTULO RESPONDE — o leitor termina o capítulo com a resposta clara, com exemplo:\n${aqui.map((p) => `- ${p.pergunta}`).join("\n")}`);
  }
  return partes.length ? `\n${partes.join("\n\n")}\n` : "";
}

/** Perguntas que o auditor cobra deste capítulo. */
export function perguntasDoCapitulo(outline: Outline, idx: number): string[] {
  return perguntasValidas(outline)
    .filter((p) => Number(p.capitulo) === idx + 1)
    .map((p) => p.pergunta);
}
