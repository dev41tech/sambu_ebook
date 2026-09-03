import OpenAI from "openai";
import { withRetry } from "./retry";
import { detectarRecusa } from "./sanitizar";
import { MAX_CAPITULOS, PALAVRAS_POR_CAPITULO } from "../../src/lib/custo";
import { ehFiccao } from "../../src/lib/categorias";
import { modoDe } from "../../src/lib/modos";
import { vozDe } from "./vozes";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Preencha o arquivo .env (veja .env.example)."
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export interface EbookContext {
  /** Caminho da categoria principal, ex.: "Romance > Romance historico". */
  theme: string;
  /** Caminhos das categorias secundarias escolhidas na criacao. */
  secondaryCategories?: string[];
  audience: string;
  tone: string;
  language: string;
  pageCount: number;
  wordsPerPage: number;
  /** Meta de palavras; quando > 0 manda no lugar de pageCount. */
  wordGoal?: number;
  titleMode: "ai" | "manual";
  customTitle?: string | null;
  customSubtitle?: string | null;
  authorContext?: string | null;
  referenceMaterial?: string | null;
  extraInstructions?: string | null;
  webResearch?: string | null;
  knowledgeContext?: string | null;
  learnings?: string[];
}

const MAX_REFERENCE_CHARS = 24000;

// Quando o usuário junta vários artigos, cada bloco vem marcado com
// "--- Fonte: ... ---". Um slice simples gastaria a verba inteira nos primeiros e
// os últimos nunca chegariam ao modelo — o oposto do que se quer ao reunir várias
// fontes. Aqui a verba é dividida em partes iguais entre elas.
function recortarPorFonte(material: string, limite: number): string {
  if (material.length <= limite) return material;

  const partes = material.split(/(?=--- Fonte:)/g).filter((p) => p.trim());
  if (partes.length <= 1) return material.slice(0, limite);

  const cota = Math.floor(limite / partes.length);
  return partes
    .map((p) => {
      if (p.length <= cota) return p.trimEnd();
      return `${p.slice(0, cota).trimEnd()}\n[...trecho abreviado para caber no contexto...]`;
    })
    .join("\n\n");
}

// Bloco de "aterramento" injetado nos prompts quando o usuário forneceu material de
// referência (Ebooks Técnicos/Comportamentais) — o conteúdo deve se basear nesse material
// em vez de só no conhecimento geral da IA.
function referenceBlock(ctx: EbookContext): string {
  const material = ctx.referenceMaterial?.trim();
  if (!material) return "";
  const trimmed = recortarPorFonte(material, MAX_REFERENCE_CHARS);
  return `\nMATERIAL DE REFERÊNCIA fornecido pelo usuário — use como base principal do conteúdo. Não invente fatos, dados, estatísticas ou afirmações que contradigam ou vão muito além do que está aqui; quando precisar complementar com conhecimento geral, deixe claro que é uma explicação complementar, não parte do material original:\n"""\n${trimmed}\n"""\n`;
}

// Resultados de busca real na internet (Tavily), feitos uma vez por ebook a partir do
// tema — usados como fonte factual/atualizada, com a fonte citada quando fizer sentido.
function webResearchBlock(ctx: EbookContext): string {
  const research = ctx.webResearch?.trim();
  if (!research) return "";
  return `\nPESQUISA NA INTERNET feita sobre o tema — use como fonte de dados e fatos atualizados, sem inventar além do que está aqui:\n"""\n${research}\n"""\n`;
}

// Conteúdo da pasta local de conhecimento (ebook-forge/knowledge/) — material que o
// próprio usuário curou como base de conhecimento permanente do app.
function knowledgeBlock(ctx: EbookContext): string {
  const knowledge = ctx.knowledgeContext?.trim();
  if (!knowledge) return "";
  return `\nBASE DE CONHECIMENTO interna do usuário — use como referência quando for relevante ao tema:\n"""\n${knowledge}\n"""\n`;
}

// Memória de aprendizado: sugestões que o próprio usuário deixou depois de ebooks
// anteriores, para o app melhorar de forma acumulativa a cada nova geração.
function learningsBlock(ctx: EbookContext): string {
  if (!ctx.learnings || ctx.learnings.length === 0) return "";
  return `\nAPRENDIZADOS de ebooks anteriores (feedback do próprio usuário — aplique sempre que for pertinente a este ebook):\n${ctx.learnings.map((l) => `- ${l}`).join("\n")}\n`;
}

function extraInstructionsBlock(ctx: EbookContext): string {
  const extra = ctx.extraInstructions?.trim();
  if (!extra) return "";
  return `\nINSTRUÇÃO EXTRA do usuário para este ebook específico: ${extra}\n`;
}

function groundingBlock(ctx: EbookContext): string {
  return [referenceBlock(ctx), webResearchBlock(ctx), knowledgeBlock(ctx), learningsBlock(ctx), extraInstructionsBlock(ctx)]
    .filter(Boolean)
    .join("");
}

export interface OutlineChapter {
  title: string;
  summary: string;
  /**
   * So em ficcao. Sem isto o capitulo 10 podia reabrir uma decisao que o
   * capitulo 3 ja tinha fechado -- "Moveis de Memorias" decide vender a oficina
   * no capitulo 3 e volta a "ponderar" a mesma venda no capitulo 6, porque nada
   * dizia que aquilo já tinha sido resolvido.
   */
  funcao?: "apresentacao" | "complicacao" | "virada" | "crise" | "climax" | "desfecho";
  /** O que fica resolvido ao fim deste capitulo e nao pode ser desfeito depois. */
  resultado?: string;
}

/**
 * Elenco fixado no sumario. Existe porque introducao, capitulos e conclusao eram
 * tres chamadas independentes, cada uma inventando os proprios nomes: em "Alem
 * das Quatro Linhas" a introducao apresentou Luisa e Guilherme enquanto os 84
 * capitulos falavam de Ana e Lucas.
 *
 * "papel" aceita "ausente" para quem e citado o livro inteiro mas nunca aparece
 * em cena -- a irma desaparecida, o socio morto. Sem essa opcao o modelo so
 * pensava em quem "esta na cena" e deixava a figura mais citada do livro de
 * fora do elenco: em "Moveis de Memorias" a irma desaparecida foi citada 59
 * vezes e nunca entrou no elenco, porque nada pedia isso.
 */
export interface Personagem {
  nome: string;
  papel: string;
  descricao: string;
}

export interface Outline {
  title: string;
  subtitle: string;
  chapters: OutlineChapter[];
  /** So em ficcao. Nao ficcao nao tem elenco e o bloco nao e pedido. */
  personagens?: Personagem[];
  /**
   * Fatos que nao podem mudar ao longo do livro: numeros, datas, relacoes,
   * quem esta ausente. Sem isto, nada garante que "ha quinze anos" dito no
   * capitulo 1 continue valendo no capitulo 14 -- em "Moveis de Memorias"
   * virou "vinte anos" no climax, e nada no sistema tinha esse fato fixado em
   * lugar nenhum para contradizer.
   */
  fatosFixos?: string[];
}

// Teto de capitulos por ebook. Era 12 fixo, o que fazia qualquer pedido acima de
// 48 paginas render o mesmo livro -- pedir 250 paginas entregava ~45. Virou
// configuravel para podermos medir onde estao os limites reais (tempo, custo,
// coerencia entre capitulos, renderizacao do PDF) antes de fixar um numero.
const MAX_CHAPTERS = Number(process.env.MAX_CHAPTERS) || MAX_CAPITULOS;

// Antes esta funcao recebia paginas e dividia por 4 -- com 250 palavras/pagina,
// isso assumia 1000 palavras por capitulo. A entrega medida real e 841
// (PALAVRAS_POR_CAPITULO, ver custo.ts): pedir 20.000 palavras virava 20
// capitulos x meta de 1000, o modelo entregava ~800 cada, e o livro fechava em
// 75% do pedido -- nao por o modelo escrever pouco, mas porque o proprio
// sistema tinha pedido 20% a mais do que ele sabia que ia conseguir.
function chapterCountFor(palavrasAlvo: number): number {
  const raw = Math.round(palavrasAlvo / PALAVRAS_POR_CAPITULO);
  return Math.min(MAX_CHAPTERS, Math.max(3, raw));
}

async function askOpenAI(
  system: string,
  prompt: string,
  maxTokens: number,
  jsonMode = false,
  minChars = 200
): Promise<string> {
  const openai = getClient();
  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    })
  );
  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Resposta vazia da IA.");
  }
  // Uma recusa chega em HTTP 200, com texto. Sem esta checagem ela era salva
  // como se fosse o capitulo -- foi o que aconteceu nos capitulos 4 e 10 de
  // "Vinganca Perigosa". O minChars nao se aplica ao JSON do sumario, que e
  // validado por parse logo adiante.
  const recusa = detectarRecusa(text, jsonMode ? 0 : minChars);
  if (recusa) {
    throw new Error(`IA nao entregou conteudo: ${recusa.motivo}.`);
  }
  return text.trim();
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}

// --- Sistema de escrita humanizada -----------------------------------------
// Baseado num guia editorial focado em evitar o "tom de IA": clichês,
// simetria excessiva, generalidades vagas e emoção forçada.

const BANNED_PHRASES = [
  "Em um mundo cada vez mais",
  "Nos dias de hoje",
  "Ao longo desta jornada",
  "É importante ressaltar",
  "Vale destacar",
  "Cabe mencionar",
  "Imagine por um momento",
  "Você já parou para pensar?",
  "A resposta pode surpreender você",
  "Não existe fórmula mágica",
  "No final das contas",
  "Mais do que nunca",
  "Em suma",
  "Neste capítulo, exploraremos",
  "Este não é apenas um livro",
  "Prepare-se para transformar sua vida",
  "Desbloqueie seu potencial",
  "Abrace a jornada",
  "Seja sua melhor versão",
  "A chave para o sucesso",
  "O poder transformador",
  "Uma jornada de autodescoberta",
  "Seu futuro eu agradecerá",
  "Você é capaz",
  "Agora é hora de agir",
];

const CHAPTER_OPENINGS = [
  "uma cena ou situação concreta ligada ao tema do capítulo",
  "uma pergunta legítima que o leitor provavelmente já se fez sobre o assunto",
  "uma contradição ou mal-entendido comum sobre o tema",
  "uma observação direta e pessoal sobre o assunto, como quem já pensou bastante sobre isso",
  "um erro comum que as pessoas cometem nesse contexto",
  "um pequeno exemplo hipotético (deixe claro que é hipotético, sem inventar fatos como se fossem reais)",
  "um dado ou fato relevante sobre o tema, apresentado sem exagero",
  "uma decisão difícil relacionada ao assunto do capítulo",
];

const CHAPTER_CLOSINGS = [
  "uma reflexão que conecta o aprendizado à vida real do leitor",
  "uma aplicação prática direta do que foi discutido, sem virar lista",
  "uma ligação natural e discreta com o assunto do próximo capítulo (mencione o assunto seguinte, mas sem dizer explicitamente 'no próximo capítulo')",
  "uma pergunta útil para o leitor levar consigo",
  "o fechamento de um exemplo ou situação citada ao longo do capítulo",
  "uma reafirmação simples do ponto mais importante, sem parecer um resumo em tópicos",
];

const CHAPTER_CLOSINGS_LAST = CHAPTER_CLOSINGS.filter((c) => !c.includes("próximo capítulo"));

const SYSTEM_BASE = `Você é um ghostwriter e editor profissional especializado em livros e ebooks humanizados.

PRINCÍPIO CENTRAL: escreva como um autor humano experiente escreveria — não como uma IA tentando soar humana. O texto deve ter presença, personalidade, clareza, profundidade e respeito pelo leitor. Nunca deve parecer genérico, mecânico, repetitivo ou artificialmente motivacional. Nunca mencione ser uma IA no texto do livro.

REGRAS OBRIGATÓRIAS DE ESCRITA:

Naturalidade — varie o tamanho das frases e dos parágrafos ao longo do texto. Evite construções excessivamente simétricas (como sempre agrupar ideias em três). Não transforme todo o conteúdo em listas. Faça transições naturais entre ideias, com ritmo de conversa, sem perder qualidade editorial.

Especificidade — prefira detalhes concretos a generalizações vagas. Em vez de "ele enfrentou um momento difícil", algo como "ele passou três semanas sem saber se conseguiria pagar as contas no fim do mês" comunica muito mais. Use esse tipo de precisão sempre que fizer sentido, sem inventar fatos específicos que não foram informados sobre o autor real.

Profundidade — não diga apenas o que o leitor deve fazer. Explique por que aquilo importa, o que costuma impedir a aplicação na prática, quais erros são comuns, e como adaptar a recomendação a diferentes situações.

Emoção — deixe a emoção surgir dos fatos, das decisões e das consequências descritas, nunca de adjetivos exagerados forçando o efeito.

Personalidade — mantenha um jeito de falar consistente e com opinião ao longo do texto. Não neutralize tudo em um tom burocrático ou genérico.

Respeito ao leitor — não trate o leitor como incapaz, não use tom de superioridade, não pressione com medo, culpa ou urgência falsa, não faça elogios artificiais ("você é incrível por estar aqui").

Honestidade — nunca invente estatísticas, pesquisas, citações, depoimentos, clientes, resultados ou prêmios. Nunca invente experiências pessoais específicas do autor além do que foi informado.

FRASES E ABERTURAS PROIBIDAS — nunca use estas expressões nem variações muito próximas delas:
${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.

Evite também: excesso de travessões, sequências de frases muito curtas, excesso de metáforas, excesso de perguntas retóricas seguidas, conclusões que apenas repetem a introdução com outras palavras, e fechamentos motivacionais genéricos.`;

/**
 * Prompt de sistema montado por modo editorial.
 *
 * A base acima vale para qualquer livro -- honestidade, frases proibidas,
 * naturalidade. O que vem depois muda: as regras de "Profundidade" que mandavam
 * explicar erros comuns e adaptar recomendacoes so fazem sentido em livro
 * pratico, e eram aplicadas tambem a romance. Agora cada modo traz as suas.
 */
function promptDoModo(ctx: EbookContext): string {
  return `${SYSTEM_BASE}

${vozDe(modoDe(ctx.theme)).regras}`;
}

export async function generateOutline(ctx: EbookContext): Promise<Outline> {
  // Palavras e a unidade que a geracao controla; paginas dependem da diagramacao.
  const palavrasAlvo = ctx.wordGoal && ctx.wordGoal > 0 ? ctx.wordGoal : ctx.pageCount * ctx.wordsPerPage;
  const chapterCount = chapterCountFor(palavrasAlvo);
  const titleInstruction =
    ctx.titleMode === "manual" && ctx.customTitle
      ? `Use exatamente este título: "${ctx.customTitle}". ${
          ctx.customSubtitle ? `Use exatamente este subtítulo: "${ctx.customSubtitle}".` : "Crie um subtítulo curto e complementar."
        }`
      : "Crie um título forte e um subtítulo curto e complementar. Evite títulos genéricos de autoajuda (nada de \"O Poder de...\", \"Desperte...\", \"Transforme sua vida...\").";

  // A classificacao vem como caminho hierarquico ("Grupo > Subcategoria"). Sem
  // explicar isso, o modelo lia o caminho como texto livre e inventava angulo --
  // foi assim que um livro sobre produtividade virou "Eficiencia Relacional".
  const secundarias = (ctx.secondaryCategories ?? []).filter(Boolean);

  // Em ficcao o elenco e definido aqui, uma vez, e repassado a todas as etapas de
  // escrita. Em nao ficcao o bloco nao e pedido: nao ha personagens e o schema
  // extra so gastaria tokens.
  const ficcao = ehFiccao(ctx.theme);
  const blocoElencoSchema = ficcao
    ? `
  "personagens": [
    { "nome": "nome completo", "papel": "protagonista | par romantico | apoio | antagonista | ausente", "descricao": "idade, ocupacao e o que define esta pessoa, em uma frase" }
  ],`
    : "";
  const instrucaoElenco = ficcao
    ? `
Defina tambem o ELENCO do livro: de 3 a 8 personagens, com o protagonista e o par romantico explicitos quando houver. Os nomes escolhidos aqui valem para o livro inteiro -- introducao, todos os capitulos e conclusao usarao exatamente estes.
Se a premissa girar em torno de alguem que NAO aparece em cena -- desaparecido, morto, sumido, uma pessoa so mencionada --, inclua essa pessoa no elenco mesmo assim, com papel "ausente". Sem isso o personagem mais citado do livro pode nunca constar do elenco.`
    : "";

  // Funcao dramatica por capitulo -- so ficcao. Sem isto o capitulo 6 podia
  // reabrir uma decisao que o capitulo 3 ja tinha fechado: em "Moveis de
  // Memorias" a protagonista "decide vender a oficina" no capitulo 3 e volta a
  // "ponderar" a mesma venda no capitulo 6.
  const blocoFuncaoSchema = ficcao
    ? `, "funcao": "apresentacao | complicacao | virada | crise | climax | desfecho", "resultado": "o que fica resolvido ao fim deste capitulo e nao pode ser desfeito depois"`
    : "";
  const instrucaoFuncao = ficcao
    ? `
Cada capitulo tem uma FUNCAO na estrutura (apresentacao, complicacao, virada, crise, climax, desfecho) e um RESULTADO -- o que muda de forma irreversivel ao fim dele. Um capitulo posterior nao pode desfazer o resultado de um capitulo anterior nem reabrir uma decisao ja tomada. Exatamente um capitulo deve ter funcao "climax" e ele precisa vir perto do fim; o ultimo capitulo deve ter funcao "desfecho" e seu resultado precisa responder a pergunta central do livro -- nao deixe a pergunta que move a trama sem resposta.`
    : "";

  const prompt = `Planeje a estrutura de um ebook com estas informações:
- Classificação principal: ${ctx.theme}  (formato "Área > Subcategoria" — o livro deve ficar dentro dela)
${secundarias.length > 0 ? `- Temas secundários indicados pelo autor, para tangenciar sem desviar da classificação principal: ${secundarias.join("; ")}` : ""}
- Público-alvo: ${ctx.audience}
- Tom de voz: ${ctx.tone}
- Idioma do ebook: ${ctx.language}
- Extensão alvo: ${palavrasAlvo.toLocaleString("pt-BR")} palavras no total (cerca de ${Math.round(palavrasAlvo / Math.max(1, ctx.wordsPerPage))} páginas depois de diagramado)
- Número de capítulos: exatamente ${chapterCount}
${ctx.authorContext ? `- Contexto/voz do autor fornecido: ${ctx.authorContext}` : ""}
${groundingBlock(ctx)}
${titleInstruction}

O título, o subtítulo e todos os capítulos devem tratar do assunto da classificação principal. Não invente um ângulo ou conceito que não esteja nela nem nas instruções do usuário — se o assunto é produtividade, o livro é sobre produtividade, e não sobre um conceito adjacente inventado para soar original.

Cada resumo de capítulo deve indicar um ângulo específico, não uma repetição do tema geral com outras palavras — os capítulos precisam progredir e se diferenciar entre si.${instrucaoElenco}${instrucaoFuncao}

Liste também os FATOS FIXOS do livro: de 3 a 10 afirmações curtas com os números, datas, relações e nomes que não podem mudar ao longo do texto — principalmente qualquer prazo, idade ou tempo decorrido ("a irmã desapareceu há 15 anos"), porque é o tipo de detalhe que muda sozinho de um capítulo para outro se não for fixado aqui.

Responda em JSON, APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois:
{
  "title": "...",
  "subtitle": "...",${blocoElencoSchema}
  "fatosFixos": ["..."],
  "chapters": [
    { "title": "...", "summary": "uma frase descrevendo o ângulo específico deste capítulo"${blocoFuncaoSchema} }
  ]
}`;

  // O JSON do sumario cresce com o numero de capitulos. Com o teto fixo em 12,
  // 2000 tokens sobravam; com 100 capitulos a resposta seria cortada no meio e o
  // JSON viria invalido -- falha silenciosa e dificil de diagnosticar. fatosFixos
  // e funcao/resultado por capitulo tambem consomem uma fatia da resposta.
  const tokensSumario = Math.max(2000, 500 + chapterCount * (ficcao ? 90 : 50)) + (ficcao ? 600 : 0);
  const raw = await askOpenAI(promptDoModo(ctx), prompt, tokensSumario, true);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as Outline;
  if (!parsed.chapters || parsed.chapters.length === 0) {
    throw new Error("A IA não retornou capítulos válidos.");
  }
  return parsed;
}

/**
 * Repassa o elenco do sumario a todas as etapas de escrita. Sem ele, cada chamada
 * ao modelo cria personagens do zero e o livro troca de protagonista no meio.
 */
function elencoBlock(outline: Outline): string {
  const elenco = outline.personagens ?? [];
  if (elenco.length === 0) return "";
  const linhas = elenco.map((p) => `- ${p.nome} (${p.papel}): ${p.descricao}`).join("\n");
  return `
ELENCO FIXO deste livro — use exatamente estes nomes, sem trocar, encurtar, apelidar nem inventar outro protagonista. Personagens secundarios novos sao permitidos, desde que nao assumam o papel central:
${linhas}
`;
}

/**
 * Fatos que valem para o livro inteiro, repetidos em toda chamada de escrita
 * pelo mesmo motivo do elencoBlock: sem repassar, cada chamada so tem o que
 * esta no proprio prompt, e um numero dito no capitulo 1 nao sobrevive ate o
 * capitulo 14 se ninguem o repetir a cada vez.
 */
function fatosFixosBlock(outline: Outline): string {
  const fatos = outline.fatosFixos ?? [];
  if (fatos.length === 0) return "";
  return `
FATOS FIXOS deste livro — nao contradiga nenhum destes, mesmo que pareça natural variar o número ou a data ao longo do texto:
${fatos.map((f) => `- ${f}`).join("\n")}
`;
}

export async function generateIntro(ctx: EbookContext, outline: Outline): Promise<string> {
  const prompt = `Escreva a introdução do ebook "${outline.title}" (${outline.subtitle}).
Tema: ${ctx.theme}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(outline)}${fatosFixosBlock(outline)}${groundingBlock(ctx)}
A introdução deve criar conexão real com o leitor a partir de uma situação, dúvida ou dificuldade concreta — não anuncie o sumário do livro nem liste os capítulos que virão a seguir. O leitor só precisa sentir que este livro fala com a experiência dele; a estrutura interna do livro não precisa ser explicada aqui.

Escreva de 300 a 450 palavras, em parágrafos corridos, sem repetir o título do livro como cabeçalho. Responda apenas com o texto final da introdução, sem comentários.`;
  return askOpenAI(promptDoModo(ctx), prompt, 1500);
}

/** O que ja foi escrito antes deste capitulo. */
export interface CapituloAnterior {
  idx: number;
  title: string;
  /** O que de fato aconteceu ali. Nulo em capitulos anteriores a esta memoria. */
  resumo: string | null;
}

/**
 * Quantos capitulos anteriores entram no prompt com o resumo inteiro. Os mais
 * antigos entram so como titulo: num livro de 84 capitulos, mandar 83 resumos
 * custaria mais em contexto do que o capitulo que se quer escrever.
 */
const JANELA_DE_MEMORIA = 8;

export function memoriaBlock(anteriores: CapituloAnterior[]): string {
  if (anteriores.length === 0) return "Este é o primeiro capítulo do livro.\n";

  const recentes = anteriores.slice(-JANELA_DE_MEMORIA);
  const antigos = anteriores.slice(0, -JANELA_DE_MEMORIA);

  const linhas = recentes.map((c) =>
    c.resumo
      ? `- Capítulo ${c.idx + 1} — "${c.title}": ${c.resumo}`
      : `- Capítulo ${c.idx + 1} — "${c.title}" (sem resumo registrado)`,
  );

  const antigosLinha =
    antigos.length > 0
      ? `
Capítulos anteriores a esses, apenas pelos títulos: ${antigos.map((c) => `"${c.title}"`).join(", ")}.
`
      : "";

  return `O QUE JÁ ACONTECEU no livro até aqui — continue daqui, não recomece:
${linhas.join("\n")}${antigosLinha}
Não repita fatos, exemplos, cenas ou conclusões que já apareceram acima. Se algo ficou em aberto, este capítulo pode retomar; o que já foi resolvido não volta a ser problema.
`;
}

export async function generateChapter(
  ctx: EbookContext,
  outline: Outline,
  chapterIndex: number,
  anteriores: CapituloAnterior[]
): Promise<string> {
  const chapter = outline.chapters[chapterIndex];
  const isLastChapter = chapterIndex === outline.chapters.length - 1;
  const nextChapter = !isLastChapter ? outline.chapters[chapterIndex + 1] : null;
  const alvoTotal = ctx.wordGoal && ctx.wordGoal > 0 ? ctx.wordGoal : ctx.pageCount * ctx.wordsPerPage;
  const wordsPerChapter = Math.round(alvoTotal / outline.chapters.length);
  // Aberturas e fechamentos do modo, nao mais uma lista unica de nao ficcao.
  const voz = vozDe(modoDe(ctx.theme));
  const opening = voz.aberturas[chapterIndex % voz.aberturas.length];
  const fechamentos = isLastChapter
    ? voz.fechamentos.filter((c) => !c.includes("próximo capítulo"))
    : voz.fechamentos;
  const closing = fechamentos[chapterIndex % fechamentos.length];

  // Funcao e resultado do capitulo, quando o sumario os declarou. O ultimo
  // capitulo e o marcado como climax pedem dramatizacao explicita da resposta
  // -- sem isto o desfecho de "Moveis de Memorias" resumiu a revelacao central
  // como "a gravacao narrava uma historia de ciume e chantagem" e o leitor
  // nunca soube, de fato, o que tinha acontecido.
  const funcaoLinha = chapter.funcao
    ? `Função deste capítulo na estrutura: ${chapter.funcao}.${chapter.resultado ? ` Ao final dele, isto precisa estar resolvido de forma irreversível: ${chapter.resultado}` : ""}`
    : "";
  const ehClimaxOuDesfecho = chapter.funcao === "climax" || chapter.funcao === "desfecho" || isLastChapter;
  const instrucaoClimax = ehClimaxOuDesfecho
    ? `\nEste capítulo revela ou resolve a questão central do livro. Dramatize a revelação em cena — o que aconteceu, dito ou mostrado diretamente — em vez de resumir o conteúdo de uma gravação, carta, diário ou confissão alheia. O leitor precisa saber, no texto, exatamente o que se passou; "ela contou tudo" ou "a gravação revelava a verdade" não é uma resposta, é a ausência de uma.\n`
    : "";

  const prompt = `Escreva o conteúdo completo do capítulo ${chapterIndex + 1} do ebook "${outline.title}".
Título do capítulo: "${chapter.title}"
O que este capítulo deve cobrir: ${chapter.summary}
${funcaoLinha}
Tema geral do livro: ${ctx.theme}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(outline)}${fatosFixosBlock(outline)}${memoriaBlock(anteriores)}
${isLastChapter ? "Este é o ÚLTIMO capítulo do livro — não faça nenhuma referência a um próximo capítulo, pois não existe." : nextChapter ? `O próximo capítulo vai tratar de: "${nextChapter.title}".` : ""}
${instrucaoClimax}${groundingBlock(ctx)}
Abra o capítulo com ${opening}. Não anuncie o que o capítulo vai abordar antes de começar — vá direto ao ponto escolhido para a abertura.
Encerre o capítulo com ${closing}.

Escreva NO MÍNIMO ${wordsPerChapter} palavras -- "aproximadamente" não é licença para entregar menos, é a meta a alcançar ou passar. Com parágrafos de tamanhos variados. Use no máximo uma lista curta ou caixa de destaque, só se fizer sentido — o capítulo não deve virar um formulário de tópicos. Não inclua o título do capítulo no texto (ele já é exibido separadamente). Responda apenas com o corpo do texto.`;
  return askOpenAI(promptDoModo(ctx), prompt, 4000);
}

/**
 * Reescreve um capítulo que saiu curto demais, expandindo-o para perto da meta.
 * Existe porque pedir a meta certa no primeiro prompt não é garantia — o modelo
 * ainda pode entregar menos, e sem um segundo passo o livro fecha abaixo do que
 * foi prometido mesmo com a conta calibrada.
 *
 * Reescreve o capítulo inteiro (não "continua de onde parou"): o capítulo já
 * tem um fechamento escrito, e simplesmente acrescentar texto depois dele
 * produziria uma cena extra depois do que devia ser o final. Reescrever com a
 * mesma história, mesmo início e mesmo fim, mas mais desenvolvida, é mais
 * seguro estruturalmente.
 */
export async function expandirCapitulo(
  ctx: EbookContext,
  conteudoAtual: string,
  metaPalavras: number,
): Promise<string> {
  const prompt = `O capítulo abaixo ficou mais curto do que o planejado. Reescreva-o EXPANDINDO-o para pelo menos ${metaPalavras} palavras, mantendo a mesma história, os mesmos personagens, a mesma abertura e o mesmo fechamento -- não corte, não troque e não resuma nada do que já aconteceu.

Para crescer, aprofunde: mais detalhe sensorial nas cenas já existentes, mais linhas de diálogo, a reação interna dos personagens ao que estão vivendo, um obstáculo ou momento secundário que caiba na mesma cena sem mudar o resultado do capítulo. Não adicione resumo nem repita a mesma ideia com outras palavras -- some conteúdo novo e concreto.

Responda apenas com o texto expandido do capítulo, sem comentários.

CAPÍTULO ATUAL:
${conteudoAtual}`;
  return askOpenAI(promptDoModo(ctx), prompt, 4500, false, 200);
}

/**
 * Resumo factual de um capitulo recem-escrito, para alimentar os proximos.
 *
 * Curto e barato de proposito: sao ~150 tokens de saida por capitulo. Mandar o
 * texto inteiro do capitulo anterior adiante seria mais fiel e custaria varias
 * vezes mais em contexto a cada capitulo seguinte.
 *
 * O que se pede muda com o modo. Em ficcao interessa o que aconteceu e o que
 * ficou em aberto; em nao ficcao, o que foi ensinado e que exemplo foi gasto --
 * e o exemplo repetido que faz dois capitulos parecerem o mesmo.
 */
export async function resumirCapitulo(
  ctx: EbookContext,
  tituloCapitulo: string,
  conteudo: string
): Promise<string> {
  const narrativo = modoDe(ctx.theme) === "narrativo";
  const pedido = narrativo
    ? `- o que aconteceu, na ordem
- quem estava presente e o que cada um decidiu ou descobriu
- o que mudou na situacao dos personagens
- o que ficou em aberto para os proximos capitulos`
    : `- os pontos efetivamente ensinados
- os exemplos, casos e numeros usados (para nao serem repetidos adiante)
- as afirmacoes que ficaram pendentes de desenvolvimento`;

  const prompt = `Resuma o capitulo abaixo em ate 80 palavras, em portugues, so com fatos:
${pedido}

Nao interprete, nao elogie, nao tire licao. Escreva em frases corridas, sem lista. Responda apenas com o resumo.

CAPITULO "${tituloCapitulo}":
${conteudo.slice(0, 12000)}`;

  // minChars baixo: um resumo de 80 palavras tem ~450 caracteres, e o piso
  // padrao de 200 e pensado para capitulo, nao para resumo.
  return askOpenAI(SYSTEM_BASE, prompt, 300, false, 60);
}

export async function generateConclusion(ctx: EbookContext, outline: Outline): Promise<string> {
  const prompt = `Escreva a conclusão do ebook "${outline.title}", amarrando os aprendizados centrais dos capítulos:
${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}
Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(outline)}${fatosFixosBlock(outline)}${groundingBlock(ctx)}
Não repita a introdução com outras palavras. Termine com um convite prático e específico para o leitor aplicar algo do livro — evite frases motivacionais genéricas de encerramento.
Escreva de 250 a 400 palavras. Responda apenas com o texto final.`;
  return askOpenAI(promptDoModo(ctx), prompt, 1200);
}

export async function generateAboutAuthor(
  authorName: string,
  authorBio: string,
  language: string
): Promise<string> {
  const prompt = `Escreva uma seção "Sobre o Autor" para um ebook, em ${language}, para o autor "${authorName}".
${authorBio ? `Use como base esta informação fornecida pelo autor, sem inventar credenciais além dela: "${authorBio}"` : "O autor não forneceu bio — escreva algo genérico e breve, sem inventar credenciais específicas (formação, prêmios, cargos)."}
Escreva de 60 a 120 palavras, em terceira pessoa, num tom natural, sem clichês de contracapa de livro. Responda apenas com o texto final.`;
  // Bio do autor nao pertence a modo nenhum -- nao e conteudo do livro.
  return askOpenAI(SYSTEM_BASE, prompt, 500);
}

/**
 * Segunda passada editorial: revisa um texto já escrito removendo padrões
 * característicos de IA, preservando o conteúdo e a mensagem original.
 */
export async function humanizeText(
  text: string,
  contextLabel: string,
  maxTokens = 4000,
  /**
   * Sem o modo, esta segunda passada usaria as regras genericas e desfaria a voz
   * do primeiro passe -- reescreveria a cena do romance como explicacao.
   */
  caminhoCategoria = ""
): Promise<string> {
  const prompt = `Revise o texto abaixo como um editor especializado em detectar e remover padrões artificiais de textos gerados por IA, preservando 100% do conteúdo, dos fatos e da mensagem original.

Contexto: ${contextLabel}

Procure e corrija especificamente:
- qualquer uma das frases proibidas listadas nas suas instruções, ou variações muito próximas delas
- generalizações vagas que poderiam ser mais específicas e concretas
- excesso de simetria (estruturas repetidas em grupos de três, frases com o mesmo formato em sequência)
- transições mecânicas entre parágrafos
- emoção forçada por adjetivos exagerados
- fechamento previsível ou motivacional genérico

Não adicione informações novas, não mude o significado, não encurte o texto sem necessidade. Responda apenas com o texto revisado, sem comentários, sem aspas ao redor, sem observações.

TEXTO:
${text}`;
  return askOpenAI(`${SYSTEM_BASE}

${vozDe(modoDe(caminhoCategoria)).regras}`, prompt, maxTokens);
}
