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
export const ASPECTOS_EDITOR = ["estrutura", "ritmo", "repeticao", "fio-aberto", "contradicao", "personagem", "final", "promessa", "clareza"];

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
