// Camada editorial do Sambu (02/10/2026), inspirada no que os projetos de
// escrita de ficção com IA fazem de melhor (InkOS, novel-creator-skill,
// creative-writing-skills, story-skills):
//
//   - vícios de texto de IA em português e tiques repetidos entre capítulos,
//     detectados sem IA -- viram proibição no prompt e entram na concretização;
//   - auditor por capítulo (ai.ts: auditarCapitulo) -- a parte pura dele
//     (normalizar a resposta, montar a correção) mora aqui;
//   - leitura final de editor e de leitora (ai.ts: leituraEditorial), que vira
//     achado no painel de qualidade.
//
// Tudo aqui é puro (sem banco, sem IA), para ser testado isolado.

import type { Achado, Gravidade } from "./continuidade";

// ---------------------------------------------------------------------------
// Vícios de texto de IA em português
// ---------------------------------------------------------------------------

/**
 * Muletas que denunciam texto de IA em ficção em português. Lista curta e
 * específica de propósito: cada item é uma construção pronta, não uma palavra
 * comum -- "respirou" sozinho é normal, "respirou fundo" a cada cena é tique.
 * "Depois da Última Chave" tinha "sem humor" 8 vezes e "passou a mão na nuca"
 * em 4 capítulos.
 */
export const VICIOS: Array<{ rotulo: string; re: RegExp }> = [
  { rotulo: "soltou o ar que nem sabia que prendia", re: /solt\w+ o ar que (nem |não )?sabia/gi },
  { rotulo: "um misto de", re: /\bum misto de\b/gi },
  { rotulo: "não pôde deixar de", re: /\bnão (pôde|pode|conseguiu) deixar de\b/gi },
  { rotulo: "sorriso que não chegou aos olhos", re: /sorriso que não (chegou|alcançou|subiu)/gi },
  { rotulo: "o silêncio que se seguiu / se instalou", re: /\bo silêncio (que se seguiu|se instalou|caiu|que veio)/gi },
  { rotulo: "riso/risada sem humor", re: /\b(riso|risada|sorriso)\b[^.!?\n]{0,25}\bsem (humor|alegria)\b/gi },
  { rotulo: "respirou fundo", re: /\brespir\w+ fundo\b/gi },
  { rotulo: "engoliu em seco", re: /\bengol\w+ (em )?seco\b/gi },
  { rotulo: "o coração disparou/martelava", re: /\b(o )?coração (disparou|acelerou|martelava|batia (forte|descompassado))/gi },
  { rotulo: "um arrepio percorreu", re: /\bum arrepio (percorreu|subiu|desceu|correu)/gi },
  { rotulo: "uma onda de (sentimento)", re: /\buma onda de (alívio|medo|raiva|calor|culpa|tristeza|ternura|emoção)/gi },
  { rotulo: "como se o mundo", re: /\bcomo se o mundo\b/gi },
  { rotulo: "o tempo parou", re: /\bo tempo (pareceu )?(parar|parou|congelou)/gi },
  { rotulo: "pela primeira vez em muito tempo", re: /\bpela primeira vez em (muito tempo|anos|meses)\b/gi },
  { rotulo: "mais do que queria admitir", re: /\bmais do que (queria|gostaria de|pretendia) admitir\b/gi },
  { rotulo: "no fundo, ela/ele sabia", re: /\bno fundo,? (ela|ele|eu) sabia\b/gi },
  { rotulo: "passou a mão na nuca/pelos cabelos", re: /\bpass\w+ a mão (na nuca|pela nuca|pelos cabelos|pelo cabelo|pelo rosto)/gi },
  { rotulo: "a palavra ficou no ar", re: /\b(a palavra|a frase|a pergunta) (ficou|pairou) no ar\b/gi },
];

/**
 * A partir de quantos vícios por mil palavras a concretização age. 2/mil = 5 num
 * capítulo de 2.400 palavras: uma muleta aqui e ali é normal; uma por página
 * já é a voz da máquina.
 */
export const LIMITE_VICIOS_POR_MIL = 2;

export interface ViciosDoTexto {
  porMil: number;
  termos: Array<{ termo: string; vezes: number }>;
}

export function viciosDeIA(texto: string): ViciosDoTexto {
  const palavras = (texto || "").trim().split(/\s+/).filter(Boolean).length || 1;
  const termos: Array<{ termo: string; vezes: number }> = [];
  let total = 0;
  for (const v of VICIOS) {
    const vezes = (texto.match(v.re) || []).length;
    if (vezes > 0) {
      termos.push({ termo: v.rotulo, vezes });
      total += vezes;
    }
  }
  termos.sort((a, b) => b.vezes - a.vezes);
  return { porMil: Math.round((total / palavras) * 1000 * 10) / 10, termos };
}

/** Bloco de prevenção para o prompt de escrita: a lista inteira, curta. */
export function viciosBlock(): string {
  return `\nEVITE estas muletas de texto de IA — são o que denuncia que o livro foi escrito por máquina: ${VICIOS.map((v) => `"${v.rotulo}"`).join(", ")}. Em vez delas, mostre o gesto ou a reação específica daquela pessoa naquela cena.\n`;
}

// ---------------------------------------------------------------------------
// Tiques repetidos entre capítulos
// ---------------------------------------------------------------------------

const PARADAS = new Set(
  "a o as os um uma uns umas de da do das dos em na no nas nos por pela pelo pelas pelos para pra com sem que se e é era foi ser ao à às aos como mas mais ou já não nem me te lhe ela ele elas eles eu você isso isto aquilo esse essa este esta seu sua seus suas meu minha dele dela muito pouco tão bem só ainda quando onde então lá aqui ali há ter tinha tem".split(" "),
);

function tokens(texto: string): string[] {
  return (texto || "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Sequências de 4 palavras que aparecem em vários capítulos diferentes — o gesto
 * ou a fala que o modelo repete por hábito ("passou a mão pela nuca", "não fala
 * meu nome", "eu ia te contar"). Precisa ter ao menos 2 palavras de conteúdo e
 * não conter nome do elenco: "Helena olhou para Miguel" em 3 capítulos é
 * história, não tique.
 */
export function tiquesRepetidos(
  capitulos: Array<{ idx: number; content: string }>,
  nomesDoElenco: string[] = [],
  minCapitulos = 3,
  limite = 8,
): Array<{ frase: string; capitulos: number[] }> {
  const nomes = new Set(nomesDoElenco.flatMap((n) => tokens(n)));
  const ondeAparece = new Map<string, Set<number>>();
  for (const c of capitulos) {
    const t = tokens(c.content);
    const vistosNoCap = new Set<string>();
    for (let i = 0; i + 4 <= t.length; i++) {
      const gram = t.slice(i, i + 4);
      if (gram.some((w) => nomes.has(w))) continue;
      if (gram.filter((w) => !PARADAS.has(w) && w.length > 2).length < 2) continue;
      const chave = gram.join(" ");
      if (vistosNoCap.has(chave)) continue;
      vistosNoCap.add(chave);
      const s = ondeAparece.get(chave) ?? new Set<number>();
      s.add(c.idx);
      ondeAparece.set(chave, s);
    }
  }
  const repetidas = [...ondeAparece.entries()]
    .filter(([, s]) => s.size >= minCapitulos)
    .map(([frase, s]) => ({ frase, capitulos: [...s].sort((a, b) => a - b) }))
    .sort((a, b) => b.capitulos.length - a.capitulos.length);

  // Sobreposição: "passou a mão pela" e "a mão pela nuca" são o mesmo tique.
  // Quando um pedaço continua o outro (as 3 últimas palavras de um são as 3
  // primeiras do outro), os dois viram uma frase só: "passou a mão pela nuca".
  const escolhidas: Array<{ frase: string; capitulos: number[] }> = [];
  for (const r of repetidas) {
    const palavras = r.frase.split(" ");
    let absorvida = false;
    for (const e of escolhidas) {
      const ep = e.frase.split(" ");
      if (ep.slice(-3).join(" ") === palavras.slice(0, 3).join(" ")) {
        e.frase = `${e.frase} ${palavras[3]}`;
        absorvida = true;
        break;
      }
      if (palavras.slice(1).join(" ") === ep.slice(0, 3).join(" ")) {
        e.frase = `${palavras[0]} ${e.frase}`;
        absorvida = true;
        break;
      }
      if (palavras.filter((w) => ep.includes(w)).length >= 3) {
        absorvida = true;
        break;
      }
    }
    if (!absorvida) escolhidas.push({ frase: r.frase, capitulos: [...r.capitulos] });
    if (escolhidas.length >= limite) break;
  }
  return escolhidas;
}

export function tiquesBlock(tiques: Array<{ frase: string }>): string {
  if (tiques.length === 0) return "";
  return `\nJÁ REPETIDO EM VÁRIOS CAPÍTULOS deste livro — não use de novo estes gestos e frases, nem variações deles: ${tiques.map((t) => `"${t.frase}"`).join(", ")}. Cada cena precisa de gestos e falas próprios.\n`;
}

// ---------------------------------------------------------------------------
// Auditor por capítulo (parte pura)
// ---------------------------------------------------------------------------

export interface ProblemaAuditoria {
  tipo: string;
  gravidade: "grave" | "leve";
  evidencia: string;
  correcao: string;
}

export interface ResultadoAuditoria {
  aprovado: boolean;
  problemas: ProblemaAuditoria[];
}

const TIPOS_AUDITORIA = new Set([
  "fio-nao-fechado",
  "contradiz-verdade",
  "funcao-nao-cumprida",
  "cena-repetida",
  "novidade-na-reta-final",
  "final-aberto",
  "destino-nao-entregue",
  "texto-cortado",
  "revelacao-antecipada",
  "casal-parado",
  "pista-nao-plantada",
  "virada-nao-entregue",
  "regra-do-genero",
  "generico",
  "pergunta-nao-respondida",
]);

/** Valida a resposta do auditor. Lixo vira "aprovado" — o auditor é um extra, não pode travar o livro. */
export function normalizarAuditoria(v: unknown): ResultadoAuditoria {
  if (!v || typeof v !== "object") return { aprovado: true, problemas: [] };
  const brutos = Array.isArray((v as { problemas?: unknown }).problemas) ? ((v as { problemas: unknown[] }).problemas) : [];
  const problemas: ProblemaAuditoria[] = brutos
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      tipo: String(p.tipo ?? "").trim(),
      gravidade: (p.gravidade === "grave" ? "grave" : "leve") as "grave" | "leve",
      evidencia: String(p.evidencia ?? "").trim().slice(0, 400),
      correcao: String(p.correcao ?? "").trim().slice(0, 400),
    }))
    .filter((p) => TIPOS_AUDITORIA.has(p.tipo) && p.correcao.length > 0)
    .slice(0, 8);
  return { aprovado: !problemas.some((p) => p.gravidade === "grave"), problemas };
}

/** Instrução de reescrita a partir dos problemas graves, no formato do `correcao` de generateChapter. */
export function correcaoDaAuditoria(r: ResultadoAuditoria): string {
  const graves = r.problemas.filter((p) => p.gravidade === "grave");
  if (graves.length === 0) return "";
  return `A revisão editorial reprovou a versão anterior por estes motivos — corrija TODOS, mantendo o mesmo assunto, a mesma função na estrutura e o mesmo resultado ao final:\n${graves
    .map((p) => `- ${p.correcao}${p.evidencia ? ` (na versão anterior: ${p.evidencia})` : ""}`)
    .join("\n")}`;
}

// ---------------------------------------------------------------------------
// Leitura final de editor e leitora (parte pura)
// ---------------------------------------------------------------------------

/** Prefixo das categorias que vêm da leitura por IA: o painel não sabe recalculá-las e as preserva. */
export const PREFIXO_EDITORIAL = "editorial-";

const GRAV: Record<string, Gravidade> = { grave: "major", media: "warning", média: "warning", leve: "info" };

/** Aspectos que a leitura de editor pode apontar — viram a categoria no painel. */
export const ASPECTOS_EDITOR = ["estrutura", "ritmo", "repeticao", "fio-aberto", "contradicao", "personagem", "final", "promessa", "clareza", "generico"];

function aspectoDe(v: unknown): string {
  const a = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return ASPECTOS_EDITOR.find((x) => a === x || a.startsWith(x)) ?? "editor";
}

/** Converte a resposta da leitura editorial em achados do painel. Nunca gera blocker. */
export function achadosDaLeitura(v: unknown): Achado[] {
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  const achados: Achado[] = [];

  const editor = Array.isArray(o.editor) ? o.editor : [];
  for (const item of editor.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const evidencia = String(e.evidencia ?? "").trim();
    const sugestao = String(e.sugestao ?? "").trim();
    if (!evidencia || !sugestao) continue;
    const caps = Array.isArray(e.capitulos) ? e.capitulos.map(Number).filter((n) => Number.isInteger(n) && n >= 1) : [];
    achados.push({
      categoria: `${PREFIXO_EDITORIAL}${aspectoDe(e.aspecto)}`,
      gravidade: GRAV[String(e.gravidade ?? "").toLowerCase()] ?? "warning",
      local: caps.length ? `capítulos ${caps.join(", ")}` : "livro inteiro",
      evidencia: `Leitura de editor: ${evidencia}`,
      sugestao,
      capitulosAfetados: caps.map((n) => n - 1),
    });
  }

  const l = o.leitora && typeof o.leitora === "object" ? (o.leitora as Record<string, unknown>) : null;
  if (l) {
    const nota = Number(l.nota);
    const comentario = String(l.comentario ?? "").trim();
    const perdeu = Array.isArray(l.perdeuInteresseEm) ? l.perdeuInteresseEm.map(String).filter(Boolean).slice(0, 4) : [];
    const naoEntendeu = Array.isArray(l.naoEntendeu) ? l.naoEntendeu.map(String).filter(Boolean).slice(0, 4) : [];
    const finalSatisfaz = l.finalSatisfaz !== false;
    const partes = [
      Number.isFinite(nota) ? `nota ${Math.max(0, Math.min(10, nota))}/10` : "",
      comentario,
      perdeu.length ? `perdeu o interesse em: ${perdeu.join("; ")}` : "",
      naoEntendeu.length ? `não entendeu: ${naoEntendeu.join("; ")}` : "",
      finalSatisfaz ? "" : "o final NÃO satisfez",
    ].filter(Boolean);
    if (partes.length > 0) {
      achados.push({
        categoria: `${PREFIXO_EDITORIAL}leitora`,
        gravidade: !finalSatisfaz || (Number.isFinite(nota) && nota < 6) ? "major" : naoEntendeu.length || perdeu.length ? "warning" : "info",
        local: "livro inteiro",
        evidencia: `Leitora do público-alvo: ${partes.join(" — ")}.`,
        sugestao: !finalSatisfaz
          ? "Reescrever o último capítulo para entregar o que a história prometeu."
          : naoEntendeu.length
            ? "Deixar explícito no texto o que a leitora não entendeu."
            : "Sem ação obrigatória.",
      });
    }
  }
  return achados;
}

/** Achados editoriais já gravados (continuity_json), para o painel não perdê-los ao recalcular. */
export function achadosEditoriaisSalvos(continuityJson: string | null | undefined): Achado[] {
  if (!continuityJson) return [];
  try {
    const v = JSON.parse(continuityJson);
    if (!Array.isArray(v)) return [];
    return v
      .filter((a): a is Achado => !!a && typeof a === "object" && String(a.categoria ?? "").startsWith(PREFIXO_EDITORIAL))
      .map((a) => ({ ...a, gravidade: a.gravidade === "blocker" ? "major" : a.gravidade }));
  } catch {
    return [];
  }
}

/**
 * Fim do capítulo para a leitura editorial, começando num início de parágrafo
 * (ou de frase). O corte cru por caracteres começava no meio de uma palavra, e o
 * editor apontava o pedaço como "erro material grave" num texto que estava inteiro.
 */
export function trechoFinal(texto: string, max = 2500): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  const cauda = t.slice(-max);
  const paragrafo = cauda.indexOf("\n");
  if (paragrafo >= 0 && paragrafo < max / 2) return cauda.slice(paragrafo).trim();
  const frase = cauda.search(/[.!?…]["”»]?\s+(?=\S)/);
  if (frase >= 0 && frase < max / 2) return cauda.slice(frase + 1).trim();
  return cauda.slice(cauda.indexOf(" ") + 1).trim();
}

// ---------------------------------------------------------------------------
// Editor do sumário e segunda chance do final (parte pura)
// ---------------------------------------------------------------------------
//
// A leitura final só apontava: na 2ª versão de "Depois da Última Chave" ela
// achou a traição cedo, o romance tardio e o final previsível — tudo decidido
// no sumário, que ninguém tinha lido como história antes de escrever.

/** Nota abaixo da qual o sumário é refeito e o último capítulo reescrito. */
export const NOTA_MINIMA = 8;

/** Critérios do editor do sumário — os mesmos que derrubaram a nota da leitora. */
export const CRITERIOS_SUMARIO = [
  "promessa",
  "revelacao",
  "final",
  "pistas",
  "repeticao",
  "acerto-de-contas",
  "protagonista",
] as const;

export interface AvaliacaoSumario {
  /** null = resposta ilegível; quem chama segue sem revisar. */
  nota: number | null;
  problemas: Array<{ criterio: string; correcao: string }>;
}

export function normalizarAvaliacaoSumario(v: unknown): AvaliacaoSumario {
  if (!v || typeof v !== "object") return { nota: null, problemas: [] };
  const o = v as Record<string, unknown>;
  const n = Number(o.nota);
  const nota = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  const brutos = Array.isArray(o.problemas) ? o.problemas : [];
  const problemas = brutos
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const c = String(p.criterio ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      return {
        criterio: CRITERIOS_SUMARIO.find((x) => c === x || c.startsWith(x)) ?? "outro",
        correcao: String(p.correcao ?? "").trim().slice(0, 500),
      };
    })
    .filter((p) => p.correcao.length > 0)
    .slice(0, 8);
  return { nota, problemas };
}

/** Instrução de refazer o sumário a partir da avaliação do editor. */
export function correcaoDoSumario(av: AvaliacaoSumario, problemasFixos: string[] = []): string {
  const linhas = [...av.problemas.map((p) => `- (${p.criterio}) ${p.correcao}`), ...problemasFixos.map((p) => `- ${p}`)];
  if (linhas.length === 0) return "";
  return `ATENÇÃO: um editor de ficção leu a versão anterior deste sumário e deu nota ${av.nota ?? "?"}/10 para o que ela renderia como livro. Refaça o sumário corrigindo TODOS estes pontos (pode mudar a trama, a ordem das revelações e o elenco; mantenha o número de capítulos):\n${linhas.join("\n")}`;
}

/** Leitura da leitora, só o que decide a segunda chance do final. */
export function vereditoDaLeitora(leitura: unknown): { nota: number | null; finalSatisfaz: boolean } {
  const l =
    leitura && typeof leitura === "object" && (leitura as Record<string, unknown>).leitora && typeof (leitura as Record<string, unknown>).leitora === "object"
      ? ((leitura as Record<string, unknown>).leitora as Record<string, unknown>)
      : null;
  if (!l) return { nota: null, finalSatisfaz: true };
  const n = Number(l.nota);
  return { nota: Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null, finalSatisfaz: l.finalSatisfaz !== false };
}

/** Reescrever o último capítulo? Só com veredito legível abaixo da nota mínima, ou final que não satisfez. */
export function precisaReescreverFinal(leitura: unknown): boolean {
  const v = vereditoDaLeitora(leitura);
  return !v.finalSatisfaz || (v.nota !== null && v.nota < NOTA_MINIMA);
}

/**
 * Instrução de reescrita do último capítulo: o que o editor apontou sobre o
 * final (ou sobre o último capítulo) e o que a leitora não entendeu. Problemas
 * de capítulos do meio ficam de fora — reescrever o fim não os conserta.
 */
export function correcaoDoFinal(leitura: unknown, totalCapitulos: number): string {
  if (!leitura || typeof leitura !== "object") return "";
  const o = leitura as Record<string, unknown>;
  const editor = Array.isArray(o.editor) ? o.editor : [];
  const doFinal = editor
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .filter((e) => {
      const a = aspectoDe(e.aspecto);
      const caps = Array.isArray(e.capitulos) ? e.capitulos.map(Number) : [];
      return a === "final" || a === "promessa" || caps.includes(totalCapitulos);
    })
    .map((e) => String(e.sugestao ?? "").trim())
    .filter(Boolean);
  const l = o.leitora && typeof o.leitora === "object" ? (o.leitora as Record<string, unknown>) : {};
  const naoEntendeu = Array.isArray(l.naoEntendeu) ? l.naoEntendeu.map(String).filter(Boolean).slice(0, 4) : [];
  const comentario = String(l.comentario ?? "").trim();
  const linhas = [
    ...doFinal.map((s) => `- ${s}`),
    ...naoEntendeu.map((s) => `- Deixe claro, em cena: ${s}`),
  ];
  if (linhas.length === 0 && !comentario) return "";
  return `Uma leitora do público leu o livro e o final não a satisfez${comentario ? ` ("${comentario}")` : ""}. Reescreva este último capítulo mantendo os fatos já estabelecidos nos capítulos anteriores e a verdade da trama, mas entregando um final que surpreenda e satisfaça:\n${linhas.join("\n")}\nNada de explicação administrativa no lugar de cena: o final é vivido pelos personagens.`;
}

// ---------------------------------------------------------------------------
// Nome completo repetido
// ---------------------------------------------------------------------------
//
// O prompt já pedia "nome completo só na primeira vez", e o modelo ignorava: em
// "Curvas de Setembro" foram 74 "Joana Martins" e 77 "Rafael Duarte" — o
// parecer editorial apontou o texto soando como boletim de ocorrência. Como o
// próprio elenco é repetido com nome completo em vários blocos do prompt, a
// correção confiável é no texto: a partir da segunda menção no capítulo, fica o
// primeiro nome (ou "Dona Célia", com o tratamento).

const TRATAMENTOS = /^(dona|seu|sr\.?|sra\.?|dr\.?|dra\.?|professor|professora|padre|irmã|tia|tio)$/i;

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Troca o nome completo pelo curto a partir da segunda menção no texto. Só para
 * quem tem o nome curto único no elenco — duas "Anas" continuam por extenso.
 */
export function encurtarNomes(texto: string, nomes: string[]): string {
  const curtoDe = (nome: string): string | null => {
    const partes = nome.trim().split(/\s+/);
    if (partes.length < 2) return null;
    const curto = TRATAMENTOS.test(partes[0]) ? partes.slice(0, 2).join(" ") : partes[0];
    return curto === nome.trim() ? null : curto;
  };
  const curtos = nomes.map(curtoDe);
  const contagem = new Map<string, number>();
  for (const c of curtos) if (c) contagem.set(c.toLowerCase(), (contagem.get(c.toLowerCase()) ?? 0) + 1);

  let resultado = texto;
  nomes.forEach((nome, i) => {
    const curto = curtos[i];
    if (!curto || contagem.get(curto.toLowerCase())! > 1) return;
    let vistos = 0;
    const re = new RegExp(`(?<![\\p{L}])${escaparRegex(nome.trim())}(?![\\p{L}])`, "gu");
    resultado = resultado.replace(re, (m) => (vistos++ === 0 ? m : curto));
  });
  return resultado;
}

// ---------------------------------------------------------------------------
// Premissas candidatas: escolher a virada antes de planejar o livro
// ---------------------------------------------------------------------------
//
// Nas versões 3 e 4 de "Depois da Última Chave" o sumário planejava uma virada,
// mas ela saía "bonita e previsível" (doar a casa, mudar a loja de lugar), e
// revisar o sumário não subia a nota do editor (7 -> 7). Regra não gera ideia
// boa; comparar várias gera. Aqui várias premissas com virada são propostas e um
// editor escolhe a mais surpreendente E inevitável antes de o sumário existir.

export interface Premissa {
  premissa: string;
  traicao: string;
  leitorAcredita: string;
  verdade: string;
  pistas: string[];
  porQueSurpreende: string;
}

/** Valida as premissas propostas; descarta as que não têm virada (acredita/verdade) ou pistas. */
export function normalizarPremissas(v: unknown): Premissa[] {
  const lista = v && typeof v === "object" && Array.isArray((v as { premissas?: unknown }).premissas)
    ? ((v as { premissas: unknown[] }).premissas)
    : [];
  const txt = (x: unknown, max = 600) => String(x ?? "").trim().slice(0, max);
  return lista
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      premissa: txt(p.premissa),
      traicao: txt(p.traicao),
      leitorAcredita: txt(p.leitorAcredita),
      verdade: txt(p.verdade),
      pistas: (Array.isArray(p.pistas) ? p.pistas : []).map((x) => txt(x, 300)).filter(Boolean).slice(0, 4),
      porQueSurpreende: txt(p.porQueSurpreende, 400),
    }))
    .filter((p) => p.premissa && p.leitorAcredita && p.verdade && p.pistas.length >= 2)
    .slice(0, 6);
}

/**
 * Índice da premissa escolhida pelo editor (1 = primeira, como no prompt).
 * Resposta ilegível ou fora da faixa cai na de maior nota informada; sem notas, na primeira.
 */
export function escolhaDaPremissa(v: unknown, total: number): { indice: number; nota: number | null; motivo: string } {
  if (total <= 0) return { indice: -1, nota: null, motivo: "" };
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const notas = Array.isArray(o.notas) ? o.notas.map(Number) : [];
  let indice = Number(o.escolhida) - 1;
  if (!Number.isInteger(indice) || indice < 0 || indice >= total) {
    const validas = notas.slice(0, total).map((n, i) => [Number.isFinite(n) ? n : -1, i] as const);
    indice = validas.length ? validas.reduce((a, b) => (b[0] > a[0] ? b : a))[1] : 0;
  }
  const nota = Number.isFinite(notas[indice]) ? Math.max(0, Math.min(10, notas[indice])) : null;
  return { indice, nota, motivo: String(o.motivo ?? "").trim().slice(0, 400) };
}

/** A premissa escolhida, como ordem para o sumário. */
export function premissaBlock(p: Premissa): string {
  return `
PREMISSA ESCOLHIDA PELO EDITOR — construa o livro inteiro em volta dela (nomes, lugares e detalhes podem ser criados por você):
- Premissa: ${p.premissa}
${p.traicao ? `- A traição: ${p.traicao}\n` : ""}- O que o leitor acredita até perto do fim: ${p.leitorAcredita}
- A verdade (virada final): ${p.verdade}
- Pistas a plantar antes da virada: ${p.pistas.join("; ")}
- Por que surpreende: ${p.porQueSurpreende}
A "verdadeCentral" e a "viradaFinal" do sumário são estas; não as troque por outras.`;
}
