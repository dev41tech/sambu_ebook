// Regras de enredo do modo história (pedido do Marcos em 02/10/2026):
//   1. a história não pode perder personagens pelo caminho;
//   2. a história tem que terminar nos últimos capítulos.
//
// O sumário já pedia elenco, função por capítulo, um clímax "perto do fim" e o
// desfecho no último — mas nada CONFERIA a resposta. A verificação de qualidade
// acusa "personagem abandonado" depois do livro escrito, quando já custou. Aqui
// a conferência acontece no sumário, antes de gastar um capítulo sequer.
//
// Puro de propósito (sem banco, sem IA), para ser testado isolado.

import type { Outline, Personagem } from "./ai";

/** Papéis que precisam estar em cena na reta final — a história é deles. */
const CENTRAIS = /protagonista|par rom|antagonista/i;

const chave = (nome: string) => (nome || "").trim().toLowerCase();
const primeiroNome = (nome: string) => chave(nome).split(/\s+/)[0] ?? "";

/**
 * Quantos capítulos formam a reta final: 20% do livro, no mínimo 2 (no mínimo
 * 1 em livro de 1 ou 2 capítulos). É onde ficam o clímax e o desfecho, e onde
 * não entra personagem nem conflito novo.
 */
export function tamanhoRetaFinal(totalCapitulos: number): number {
  if (totalCapitulos <= 2) return 1;
  return Math.max(2, Math.ceil(totalCapitulos * 0.2));
}

export function inicioRetaFinal(totalCapitulos: number): number {
  return totalCapitulos - tamanhoRetaFinal(totalCapitulos);
}

function aparece(p: Personagem, nomesNoCapitulo: string[] = []): boolean {
  const k = chave(p.nome);
  const pn = primeiroNome(p.nome);
  return nomesNoCapitulo.some((n) => {
    const c = chave(n);
    return c === k || c === pn || primeiroNome(n) === pn;
  });
}

/**
 * O que está errado na estrutura de uma história, em frases que voltam para a
 * IA como correção. Lista vazia = sumário aceito.
 */
export function problemasDoEnredo(outline: Outline): string[] {
  const caps = outline.chapters ?? [];
  const n = caps.length;
  if (n === 0) return ["O sumário não tem capítulos."];
  const problemas: string[] = [];
  const inicio = inicioRetaFinal(n);
  const faixa = n - inicio === 1 ? `o capítulo ${n}` : `os capítulos ${inicio + 1} a ${n}`;

  // --- 2. A história termina nos últimos capítulos ---
  if (caps[n - 1].funcao !== "desfecho") {
    problemas.push(`O último capítulo (${n}) precisa ter funcao "desfecho" — é nele que a história termina.`);
  }
  const climax = caps.map((c, i) => (c.funcao === "climax" ? i : -1)).filter((i) => i >= 0);
  if (climax.length === 0) {
    problemas.push(`Nenhum capítulo tem funcao "climax". Ele deve ficar na reta final (${faixa}).`);
  } else if (climax.length > 1) {
    problemas.push(`Há ${climax.length} capítulos com funcao "climax" (${climax.map((i) => i + 1).join(", ")}); deve haver exatamente um, na reta final (${faixa}).`);
  } else if (climax[0] < inicio) {
    problemas.push(`O clímax está no capítulo ${climax[0] + 1}, cedo demais: ele precisa ficar na reta final (${faixa}), para a história não terminar antes do livro.`);
  }
  const desfechoCedo = caps.slice(0, n - 1).map((c, i) => (c.funcao === "desfecho" ? i + 1 : 0)).filter(Boolean);
  if (desfechoCedo.length > 0) {
    problemas.push(
      desfechoCedo.length === 1
        ? `O capítulo ${desfechoCedo[0]} está marcado como "desfecho" antes do fim — só o último capítulo encerra a história.`
        : `Os capítulos ${desfechoCedo.join(", ")} estão marcados como "desfecho" antes do fim — só o último capítulo encerra a história.`,
    );
  }

  // --- 1. Nenhum personagem se perde ---
  const elenco = (outline.personagens ?? []).filter((p) => p?.nome && !/ausente/i.test(p.papel || ""));
  for (const p of elenco) {
    const presencas = caps.map((c, i) => (aparece(p, c.personagens) ? i : -1)).filter((i) => i >= 0);
    if (presencas.length === 0) {
      problemas.push(`${p.nome} está no elenco mas não entra em cena em nenhum capítulo — inclua em "personagens" dos capítulos onde atua, ou retire do elenco.`);
      continue;
    }
    const naReta = presencas.some((i) => i >= inicio);
    if (CENTRAIS.test(p.papel || "") && !naReta) {
      problemas.push(`${p.nome} (${p.papel}) some antes da reta final: precisa estar em cena no clímax ou no desfecho (${faixa}).`);
    } else if (!naReta && presencas[presencas.length - 1] < Math.floor(n / 2) && !(p.destino || "").trim()) {
      problemas.push(`${p.nome} aparece só na primeira metade e depois some sem explicação: traga de volta mais adiante ou diga em "destino" como a participação dessa pessoa termina.`);
    }
    if (!(p.destino || "").trim()) {
      problemas.push(`${p.nome} está sem "destino" — diga em uma frase como a história desta pessoa termina.`);
    }
  }
  return problemas;
}

/**
 * Bloco do prompt de escrita para os capítulos da reta final. Fora dela, vazio.
 * No último capítulo, a lista de destinos vira obrigação de entrega.
 */
export function retaFinalBlock(outline: Outline, idx: number): string {
  const n = outline.chapters.length;
  const inicio = inicioRetaFinal(n);
  if (idx < inicio) return "";
  const ultimo = idx === n - 1;
  const destinos = (outline.personagens ?? [])
    .filter((p) => p?.nome && (p.destino || "").trim())
    .map((p) => `- ${p.nome}: ${p.destino}`)
    .join("\n");

  const cabecalho = ultimo
    ? `ÚLTIMO CAPÍTULO — A HISTÓRIA TERMINA AQUI. O leitor fecha o livro com a trama resolvida: a pergunta central respondida, os conflitos encerrados e cada personagem com o seu destino mostrado em cena. Não termine com gancho, mistério novo, "continua", promessa de sequência nem final em aberto.`
    : `RETA FINAL do livro (capítulo ${idx + 1} de ${n}). Daqui em diante a história converge para o fim: não introduza personagem novo, não abra conflito ou subtrama nova — resolva o que já existe.`;
  const blocoDestinos = destinos
    ? `\n${ultimo ? "Até o fim deste capítulo, TODOS estes destinos precisam estar entregues" : "Como termina a história de cada personagem — encaminhe isso a partir de agora"}:\n${destinos}`
    : "";
  return `\n${cabecalho}${blocoDestinos}\n`;
}
