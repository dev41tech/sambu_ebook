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
import { type Promessas } from "../../src/lib/promessas";
export { capitulosMinimosDaHistoria, PALAVRAS_MINIMAS_POR_CAPITULO, promessasDoPedido, type Promessas } from "../../src/lib/promessas";
// Promessas do pedido (03/10/2026), depois da 2ª versão de "Depois da Última
// Chave" (leitora 6/10): a traição foi revelada no cap. 3 de 5 e o resto virou
// coleta de provas; o par romântico só virou romance nas últimas linhas; o
// "final inesperado" pedido saiu correto e previsível; a pista da "quinta chuva"
// não tinha lógica. Tudo nascia no sumário — a escrita só cumpriu o plano.
// Correções de 02/10/2026, depois de analisar "Depois da Última Chave": uma
// verdade única da trama (verdadeCentral), todo fio aberto com resposta e
// capítulo de fechamento (fios), e ajuste automático de clímax/desfecho quando a
// IA insiste em errar a estrutura (ajustarEstrutura).

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

  // --- Uma só verdade, e todo fio aberto fecha ---
  if (!(outline.verdadeCentral || "").trim()) {
    problemas.push(`Falta "verdadeCentral": a resposta única da pergunta central — o que aconteceu, quem fez o quê, como e por quê.`);
  }
  const fios = outline.fios ?? [];
  if (fios.length === 0) {
    problemas.push(`Falta "fios": liste as pistas, segredos e perguntas que a trama abre, cada um com a resposta e o capítulo em que fecha.`);
  }
  for (const f of fios) {
    const nome = (f?.fio || "").trim() || "(fio sem descrição)";
    const cap = Number(f?.fechaNoCapitulo);
    if (!(f?.resposta || "").trim()) problemas.push(`O fio "${nome}" está sem "resposta" — diga o que ele significa de verdade.`);
    if (!Number.isInteger(cap) || cap < 1 || cap > n) {
      problemas.push(`O fio "${nome}" precisa de "fechaNoCapitulo" entre 1 e ${n}.`);
    }
  }
  return problemas;
}

/**
 * Último recurso quando a IA insiste em errar a estrutura (clímax/desfecho):
 * corrige as funções no próprio sumário em vez de seguir sem clímax, como
 * aconteceu em "Depois da Última Chave". Devolve o que foi ajustado, para log.
 *
 * - o último capítulo vira "desfecho"; "desfecho" antes dele vira "crise";
 * - fica exatamente um "climax", dentro da reta final: o último que já estiver
 *   lá; se não houver, o penúltimo capítulo (o último, num livro de 1 capítulo,
 *   que então é clímax e desfecho ao mesmo tempo — fica como desfecho).
 */
export function ajustarEstrutura(outline: Outline): string[] {
  const caps = outline.chapters ?? [];
  const n = caps.length;
  if (n === 0) return [];
  const ajustes: string[] = [];
  const inicio = inicioRetaFinal(n);

  if (caps[n - 1].funcao !== "desfecho") {
    ajustes.push(`cap. ${n}: ${caps[n - 1].funcao ?? "sem função"} -> desfecho`);
    caps[n - 1].funcao = "desfecho";
  }
  for (let i = 0; i < n - 1; i++) {
    if (caps[i].funcao === "desfecho") {
      ajustes.push(`cap. ${i + 1}: desfecho -> crise`);
      caps[i].funcao = "crise";
    }
  }
  if (n === 1) return ajustes;

  const climaxNaReta = caps.map((c, i) => (c.funcao === "climax" && i >= inicio && i < n - 1 ? i : -1)).filter((i) => i >= 0);
  const escolhido = climaxNaReta.length > 0 ? climaxNaReta[climaxNaReta.length - 1] : n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (i !== escolhido && caps[i].funcao === "climax") {
      ajustes.push(`cap. ${i + 1}: climax -> crise`);
      caps[i].funcao = "crise";
    }
  }
  if (caps[escolhido].funcao !== "climax") {
    ajustes.push(`cap. ${escolhido + 1}: ${caps[escolhido].funcao ?? "sem função"} -> climax`);
    caps[escolhido].funcao = "climax";
  }
  return ajustes;
}

/**
 * A verdade da trama e os fios, para a escrita de cada capítulo. Fora do modo
 * história (sem verdadeCentral nem fios), vazio.
 *
 * A verdade vai inteira em todo capítulo — é o que impede cada um de inventar a
 * sua versão —, com a ordem de não revelá-la antes da hora. Os fios dizem o que
 * fecha NESTE capítulo e, no último, o que ainda falta fechar.
 */
export function tramaBlock(outline: Outline, idx: number): string {
  const verdade = (outline.verdadeCentral || "").trim();
  const fios = (outline.fios ?? []).filter((f) => (f?.fio || "").trim());
  if (!verdade && fios.length === 0) return "";
  const n = outline.chapters.length;
  const ultimo = idx === n - 1;
  const cap = (f: { fechaNoCapitulo: number }) => {
    const c = Number(f.fechaNoCapitulo);
    return Number.isInteger(c) && c >= 1 && c <= n ? c : n; // fio sem capítulo válido fecha no fim
  };
  const fechamAqui = fios.filter((f) => cap(f) === idx + 1);
  const atrasados = ultimo ? fios.filter((f) => cap(f) < idx + 1) : [];

  const partes: string[] = [];
  if (verdade) {
    partes.push(
      `VERDADE DA TRAMA — referência do autor, a única versão do que aconteceu: ${verdade}\nPersonagens podem mentir, esconder ou se enganar, mas o texto não pode contradizer esta verdade: quando ela aparecer, é esta — e toda mentira dita por um personagem precisa ser desmentida antes do fim do livro. Não revele ao leitor nada antes do capítulo em que o fio correspondente fecha; até lá, só pistas coerentes com ela.`,
    );
  }
  if (fechamAqui.length > 0) {
    partes.push(
      `FIOS QUE FECHAM NESTE CAPÍTULO — o leitor precisa terminar o capítulo sabendo a resposta, mostrada em cena:\n${fechamAqui.map((f) => `- ${f.fio} → ${f.resposta}`).join("\n")}`,
    );
  }
  if (ultimo && atrasados.length > 0) {
    partes.push(
      `Confirme também, se ainda não ficou claro para o leitor, a resposta destes fios abertos antes:\n${atrasados.map((f) => `- ${f.fio} → ${f.resposta}`).join("\n")}`,
    );
  }
  return `\n${partes.join("\n\n")}\n`;
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

// ---------------------------------------------------------------------------
// Promessas do pedido: o que o gênero e a instrução do autor exigem da trama
// ---------------------------------------------------------------------------

/**
 * Primeiro capítulo (1 = primeiro) em que a verdade central pode ser revelada
 * por inteiro: na reta final ou logo antes dela, e nunca antes de 70% do livro.
 * Revelada no cap. 3 de 5, o resto do livro vira confirmação de provas.
 */
export function capituloMinimoDaRevelacao(totalCapitulos: number): number {
  return Math.min(totalCapitulos, Math.max(inicioRetaFinal(totalCapitulos), Math.ceil(totalCapitulos * 0.7)));
}

/** Instruções extras do sumário, conforme as promessas. Inclui a regra das pistas, que vale para toda história. */
export function instrucoesDasPromessas(pr: Promessas, totalCapitulos: number): string {
  const n = totalCapitulos;
  const partes: string[] = [];
  if (pr.romance) {
    partes.push(
      `PROMESSA DE ROMANCE: o arco do casal (protagonista e par romântico) é a espinha do livro, não um prêmio no fim. Planeje atração, resistência, aproximação, crise de confiança e escolha, distribuídas pelo livro inteiro. Em cada capítulo, diga em "passoDoCasal" o que muda ENTRE OS DOIS naquele capítulo (nunca "nada"). O par romântico está em cena na maior parte dos capítulos e tem desejo, segredo ou conflito próprio — não é só ajudante da trama. A trama externa pressiona o vínculo do casal, e o desfecho resolve as duas coisas.`,
    );
  }
  if (pr.revelacao) {
    const minimo = capituloMinimoDaRevelacao(n);
    partes.push(
      `REVELAÇÃO EM CAMADAS: diga em "revelacaoNoCapitulo" o capítulo em que o leitor descobre a verdade central por inteiro — no capítulo ${minimo} ou depois. Antes disso, revele em camadas: pelo menos uma suspeita falsa plausível (alguém inocente parece culpado, ou o culpado parece inocente) e verdades parciais que mudam o que o leitor pensa. Quem trai por vínculo íntimo (amigo, parceiro, família) aparece leal, presente e indispensável até perto da revelação — com cenas concretas de amizade ou cuidado —, e as suspeitas recaem primeiro sobre outra pessoa; se o leitor desconfiar dele desde o começo, a traição não surpreende. Ele tem uma cena de confronto emocional com a protagonista, a sós, sobre o que a traição fez com o vínculo — não só consequência legal ou administrativa. Varie o que move cada capítulo: no máximo 2 capítulos avançam por documento, recibo ou registro encontrado; os outros avançam por escolha errada da protagonista com custo real, contradição em diálogo, perda, cena íntima ou confronto. A protagonista conduz a revelação (arma a armadilha, força a confissão) em vez de recebê-la pronta de outros.`,
    );
  }
  if (pr.viradaFinal) {
    partes.push(
      `FINAL INESPERADO, PLANEJADO: preencha "viradaFinal" — o que o leitor acredita até perto do fim ("leitorAcredita"), o que é verdade ("verdade"), o capítulo em que vira ("noCapitulo", dentro da reta final) e de 2 a 3 pistas plantadas ANTES dele ("pistas", cada uma com o capítulo) que, relidas, tornam a virada inevitável. A virada muda o sentido de algo que o leitor já viu; não pode ser só a punição esperada do vilão, um trâmite resolvido nem uma informação nova que surge do nada. O desfecho é emocional, vivido em cena: processos, cartórios e polícia podem ficar em andamento, resumidos numa frase — não ocupam o último capítulo.`,
    );
  }
  partes.push(
    `PISTA COM LÓGICA: toda pista enigmática (frase cifrada, objeto, símbolo, lugar) tem em "resposta" a explicação completa de COMO ela leva ao que leva, numa frase que um leitor aceite sem esforço. Se envolver lei, documento ou procedimento, a resposta diz em termos simples por que funciona.`,
  );
  return `\n${partes.join("\n")}`;
}

/** Campos de topo que o JSON do sumário ganha, conforme as promessas. */
export function schemaDasPromessas(pr: Promessas): string {
  const campos: string[] = [];
  if (pr.revelacao) campos.push(`\n  "revelacaoNoCapitulo": 7,`);
  if (pr.viradaFinal) {
    campos.push(
      `\n  "viradaFinal": { "leitorAcredita": "...", "verdade": "...", "noCapitulo": 8, "pistas": [{ "pista": "o que aparece em cena, sem chamar atenção", "capitulo": 2 }] },`,
    );
  }
  return campos.join("");
}

/** Campo por capítulo que o JSON do sumário ganha (só romance). */
export function schemaCapituloDasPromessas(pr: Promessas): string {
  return pr.romance ? `, "passoDoCasal": "o que muda entre o casal neste capítulo"` : "";
}

/** O que o sumário deixou de cumprir das promessas, em frases de correção. */
export function problemasDasPromessas(outline: Outline, pr: Promessas): string[] {
  const caps = outline.chapters ?? [];
  const n = caps.length;
  if (n === 0) return [];
  const problemas: string[] = [];

  if (pr.romance) {
    const semPasso = caps.map((c, i) => (!(c.passoDoCasal || "").trim() || /^nada\b/i.test(c.passoDoCasal || "") ? i + 1 : 0)).filter(Boolean);
    if (semPasso.length > 1) {
      problemas.push(`Romance: os capítulos ${semPasso.join(", ")} estão sem "passoDoCasal" — o casal precisa mudar em cada capítulo.`);
    }
    const par = (outline.personagens ?? []).find((p) => /par rom/i.test(p.papel || ""));
    if (!par) {
      problemas.push(`Romance: o elenco não tem ninguém com papel "par romantico".`);
    } else {
      const presencas = caps.filter((c) => aparece(par, c.personagens)).length;
      const minimo = Math.ceil(n * 0.6);
      if (presencas < minimo) {
        problemas.push(`Romance: ${par.nome} (par romântico) está em cena em só ${presencas} de ${n} capítulos; precisa estar em pelo menos ${minimo}.`);
      }
    }
  }

  if (pr.revelacao) {
    const rev = Number(outline.revelacaoNoCapitulo);
    const minimo = capituloMinimoDaRevelacao(n);
    if (!Number.isInteger(rev) || rev < 1 || rev > n) {
      problemas.push(`Falta "revelacaoNoCapitulo": o capítulo (${minimo} a ${n}) em que o leitor descobre a verdade central por inteiro.`);
    } else if (rev < minimo) {
      problemas.push(`A verdade central é revelada no capítulo ${rev}, cedo demais: o resto do livro vira confirmação. Revele em camadas e deixe a revelação completa para o capítulo ${minimo} ou depois.`);
    }
  }

  if (pr.viradaFinal) {
    const v = outline.viradaFinal;
    const inicio = inicioRetaFinal(n) + 1;
    const noCap = Number(v?.noCapitulo);
    if (!v || !(v.leitorAcredita || "").trim() || !(v.verdade || "").trim()) {
      problemas.push(`Falta "viradaFinal" com "leitorAcredita" e "verdade": o autor pediu final inesperado e ele precisa ser decidido agora.`);
    } else {
      if (!Number.isInteger(noCap) || noCap < inicio || noCap > n) {
        problemas.push(`A virada final precisa acontecer na reta final: "noCapitulo" entre ${inicio} e ${n}.`);
      }
      const plantadas = (v.pistas ?? []).filter((p) => (p?.pista || "").trim() && Number(p.capitulo) >= 1 && Number(p.capitulo) < (Number.isInteger(noCap) ? noCap : n));
      if (plantadas.length < 2) {
        problemas.push(`A virada final precisa de pelo menos 2 pistas plantadas em capítulos ANTERIORES a ela ("pistas", cada uma com "capitulo").`);
      }
    }
  }
  return problemas;
}

/**
 * Para a escrita do capítulo: o passo do casal, o freio da revelação e as
 * pistas da virada que este capítulo planta (ou a virada, se é aqui). Vazio
 * quando o sumário não tem nada disso.
 */
export function promessasBlock(outline: Outline, idx: number): string {
  const cap = outline.chapters[idx];
  const numero = idx + 1;
  const partes: string[] = [];
  if ((cap?.passoDoCasal || "").trim()) {
    partes.push(`O CASAL NESTE CAPÍTULO: ${cap.passoDoCasal} — mostre em cena, entre os dois, com diálogo e gesto; não resuma.`);
  }
  const rev = Number(outline.revelacaoNoCapitulo);
  if (Number.isInteger(rev) && rev >= 1) {
    if (numero < rev) {
      partes.push(`A verdade central só é revelada por inteiro no capítulo ${rev}. Aqui, no máximo uma camada parcial, uma suspeita (que pode ser falsa) ou uma pista — nunca a verdade inteira.`);
    } else if (numero === rev) {
      partes.push(`ESTE É O CAPÍTULO DA REVELAÇÃO: o leitor descobre a verdade central por inteiro aqui, numa cena dramática com consequência imediata — não num relatório.`);
    }
  }
  const v = outline.viradaFinal;
  if (v && (v.verdade || "").trim()) {
    const pistasAqui = (v.pistas ?? []).filter((p) => Number(p?.capitulo) === numero && (p.pista || "").trim());
    if (pistasAqui.length > 0) {
      partes.push(`PLANTE nesta cena, de passagem, sem explicar nem chamar atenção (é pista de uma virada futura):\n${pistasAqui.map((p) => `- ${p.pista}`).join("\n")}`);
    }
    if (Number(v.noCapitulo) === numero) {
      const anteriores = (v.pistas ?? []).filter((p) => Number(p?.capitulo) < numero && (p.pista || "").trim());
      partes.push(
        `A VIRADA FINAL ACONTECE AQUI. Até agora o leitor acreditava que ${v.leitorAcredita}. Revele que ${v.verdade}${anteriores.length ? ` Retome as pistas plantadas antes (${anteriores.map((p) => p.pista).join("; ")}) para a virada parecer inevitável.` : ""}`,
      );
    }
  }
  return partes.length ? `\n${partes.join("\n\n")}\n` : "";
}
