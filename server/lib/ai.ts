import OpenAI from "openai";
import { withRetry } from "./retry";
import { detectarRecusa } from "./sanitizar";
import { MAX_CAPITULOS } from "../../src/lib/custo";
import { ehFiccao } from "../../src/lib/categorias";

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
  /**
   * Classificacao gravada em `ebooks.category_main`. Quando existe, e ela que
   * decide se o livro e ficcao -- era o `theme` que decidia aqui e o
   * `category_main` que decidia na verificacao de continuidade, entao os dois
   * podiam discordar: o livro saia sem elenco e depois era cobrado como ficcao.
   */
  categoryMain?: string | null;
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

/** Classificacao que vale para decidir ficcao. Ver EbookContext.categoryMain. */
function classificacao(ctx: EbookContext): string {
  return ctx.categoryMain || ctx.theme;
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
   * Quem do elenco aparece neste capitulo. So em ficcao. Existe porque o sumario
   * nao dizia de quem era cada capitulo: a verificacao de continuidade conseguia
   * acusar que 36 de 84 capitulos nao citavam ninguem do elenco, mas nada no
   * prompt tinha pedido que citassem.
   */
  personagens?: string[];
}

/**
 * Elenco fixado no sumario. Existe porque introducao, capitulos e conclusao eram
 * tres chamadas independentes, cada uma inventando os proprios nomes: em "Alem
 * das Quatro Linhas" a introducao apresentou Luisa e Guilherme enquanto os 84
 * capitulos falavam de Ana e Lucas.
 */
export interface Personagem {
  nome: string;
  papel: string;
  descricao: string;
  /** Uma linha sobre o que muda nesta pessoa do inicio ao fim. So no sumario. */
  arco?: string;
}

export interface Outline {
  title: string;
  subtitle: string;
  chapters: OutlineChapter[];
  /** So em ficcao. Nao ficcao nao tem elenco e o bloco nao e pedido. */
  personagens?: Personagem[];
}

/**
 * O que um capitulo deixou para tras. Gravado em `chapters.state_json` e
 * repassado aos capitulos seguintes.
 *
 * Este e o remedio para o defeito central da geracao longa: cada capitulo era
 * escrito conhecendo apenas os TITULOS dos anteriores, nunca o texto. Tudo que
 * nascia dentro da prosa -- um personagem secundario, um lugar, uma promessa --
 * era invisivel para o capitulo seguinte, e por isso aparecia uma vez e sumia.
 */
export interface EstadoCapitulo {
  /** O que de fato aconteceu no capitulo, em 2 ou 3 frases, com nomes. */
  resumo: string;
  /** Personagens criados na prosa que passam a valer para os proximos. */
  personagensNovos: Personagem[];
  /** Pendencias que o leitor espera ver retomadas. */
  fiosAbertos: string[];
}

/** Um capitulo ja escrito, do ponto de vista de quem vai escrever o proximo. */
export interface CapituloEscrito {
  idx: number;
  title: string;
  estado: EstadoCapitulo | null;
}

// Teto de capitulos por ebook. Era 12 fixo, o que fazia qualquer pedido acima de
// 48 paginas render o mesmo livro -- pedir 250 paginas entregava ~45. Virou
// configuravel para podermos medir onde estao os limites reais (tempo, custo,
// coerencia entre capitulos, renderizacao do PDF) antes de fixar um numero.
const MAX_CHAPTERS = Number(process.env.MAX_CHAPTERS) || MAX_CAPITULOS;

function chapterCountFor(pageCount: number): number {
  const raw = Math.round(pageCount / 4);
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
  const choice = response.choices[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error("Resposta vazia da IA.");
  }
  // Truncamento por teto de tokens era silencioso. Em JSON ele e fatal e so
  // aparecia adiante como "Unexpected end of JSON input", sem dizer por que; em
  // prosa entrega um capitulo cortado no meio da frase. Agora o log nomeia a
  // causa, e no JSON a chamada falha aqui.
  if (choice?.finish_reason === "length") {
    if (jsonMode) {
      throw new Error(
        `Resposta cortada no limite de ${maxTokens} tokens antes de fechar o JSON.`
      );
    }
    console.warn(
      `[ia] resposta cortada no limite de ${maxTokens} tokens; o texto pode terminar no meio.`
    );
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

// O guia de estilo que vale para qualquer livro. Antes este texto era o system
// prompt inteiro e ia igual para um manual tecnico e para um romance de 75
// capitulos -- fazendo um romance receber ordens como "nao diga apenas o que o
// leitor deve fazer" e "nunca invente experiencias pessoais", que em ficcao sao
// exatamente o trabalho.
const SISTEMA_BASE = `Você é um ghostwriter e editor profissional especializado em livros e ebooks humanizados.

PRINCÍPIO CENTRAL: escreva como um autor humano experiente escreveria — não como uma IA tentando soar humana. O texto deve ter presença, personalidade, clareza, profundidade e respeito pelo leitor. Nunca deve parecer genérico, mecânico, repetitivo ou artificialmente motivacional. Nunca mencione ser uma IA no texto do livro.

REGRAS OBRIGATÓRIAS DE ESCRITA:

Naturalidade — varie o tamanho das frases e dos parágrafos ao longo do texto. Evite construções excessivamente simétricas (como sempre agrupar ideias em três). Não transforme todo o conteúdo em listas. Faça transições naturais entre ideias, com ritmo de conversa, sem perder qualidade editorial.

Especificidade — prefira detalhes concretos a generalizações vagas. Em vez de "ele enfrentou um momento difícil", algo como "ele passou três semanas sem saber se conseguiria pagar as contas no fim do mês" comunica muito mais.

Emoção — deixe a emoção surgir dos fatos, das decisões e das consequências descritas, nunca de adjetivos exagerados forçando o efeito.

Personalidade — mantenha um jeito de falar consistente e com opinião ao longo do texto. Não neutralize tudo em um tom burocrático ou genérico.

FRASES E ABERTURAS PROIBIDAS — nunca use estas expressões nem variações muito próximas delas:
${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}.

Evite também: excesso de travessões, sequências de frases muito curtas, excesso de metáforas, excesso de perguntas retóricas seguidas, conclusões que apenas repetem a introdução com outras palavras, e fechamentos motivacionais genéricos.`;

const SISTEMA_NAO_FICCAO = `${SISTEMA_BASE}

REGRAS ESPECÍFICAS DESTE LIVRO (não ficção):

Profundidade — não diga apenas o que o leitor deve fazer. Explique por que aquilo importa, o que costuma impedir a aplicação na prática, quais erros são comuns, e como adaptar a recomendação a diferentes situações.

Respeito ao leitor — não trate o leitor como incapaz, não use tom de superioridade, não pressione com medo, culpa ou urgência falsa, não faça elogios artificiais ("você é incrível por estar aqui").

Honestidade — nunca invente estatísticas, pesquisas, citações, depoimentos, clientes, resultados ou prêmios. Nunca invente experiências pessoais específicas do autor além do que foi informado.

Continuidade — o livro é um argumento só, construído do começo ao fim. Cada capítulo parte do que já foi estabelecido nos anteriores e não reexplica do zero o que o leitor já leu.`;

// A parte que faltava por inteiro. O system prompt anterior tinha sete regras de
// estilo e nenhuma linha sobre consistencia, personagem, tempo ou retomada de
// fios -- e era esse silencio, mais do que qualquer instrucao errada, que
// produzia livros com personagem aparecendo uma vez e sumindo.
const SISTEMA_FICCAO = `${SISTEMA_BASE}

REGRAS ESPECÍFICAS DESTE LIVRO (ficção) — estas têm prioridade sobre qualquer regra de estilo acima:

Continuidade — o livro é UMA história só, contada em ordem. Cada capítulo continua de onde o anterior parou: os mesmos personagens, o mesmo tempo correndo para a frente, as mesmas consequências. Nunca recomece a história, nunca reapresente alguém que já foi apresentado como se fosse a primeira vez, e nunca troque o protagonista no meio do livro.

Elenco — use os personagens que já existem. Criar gente nova a cada capítulo esvazia a história: personagem que aparece uma vez e some é um defeito, não um detalhe. Só introduza alguém novo quando a cena realmente exigir, e quando fizer isso, essa pessoa precisa ter motivo para voltar.

Cena, não resumo — escreva o que acontece enquanto acontece: ação, diálogo, o que os personagens veem, querem e decidem. Não narre o capítulo de fora, como quem conta depois o que houve.

Consequência — o que acontece num capítulo muda a situação dos seguintes. Decisões custam alguma coisa, e o que ficou pendente volta.

Ponto de vista — mantenha o mesmo foco narrativo e o mesmo tempo verbal do início ao fim do livro.

Não fale com o leitor — nada de perguntas retóricas dirigidas a ele, lições, moral da história, resumos do que ele acabou de ler ou conselhos práticos. Isto é um romance, não um livro de autoajuda.

Invenção — aqui inventar é o trabalho. A regra de honestidade vale para o mundo real (não atribua a pessoas, obras ou fatos reais coisas que não aconteceram), nunca para a história.`;

function systemPrompt(ctx: EbookContext): string {
  return ehFiccao(classificacao(ctx)) ? SISTEMA_FICCAO : SISTEMA_NAO_FICCAO;
}

// Aberturas e fechamentos sugeridos por capitulo. As listas antigas eram todas
// de nao ficcao ("uma pergunta legitima que o leitor provavelmente ja se fez")
// e iam para romances tambem, o que sozinho ja produzia capitulo de romance
// aberto como capitulo de livro de negocios.
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

const ABERTURAS_FICCAO = [
  "a cena já em movimento, com alguém fazendo ou dizendo alguma coisa",
  "a consequência imediata do que ficou pendente no capítulo anterior",
  "um detalhe concreto do lugar onde a cena acontece, visto por quem está lá",
  "uma fala, sem nenhuma preparação antes dela",
  "uma decisão que um personagem acabou de tomar",
  "uma mudança de tempo ou de lugar, situada em uma frase e sem resumo do que passou",
  "um gesto pequeno que revela o estado de quem o faz",
];

const FECHAMENTOS_FICCAO = [
  "uma virada ou informação nova que muda a situação",
  "uma decisão tomada, com o custo dela visível",
  "uma pergunta em aberto na cabeça de um personagem — nunca dirigida ao leitor",
  "um gesto ou uma fala que fecha a cena sem explicar o que significa",
  "uma consequência que só vai ser sentida mais adiante",
];

/**
 * Escolhe abertura e fechamento sem que o par ande em lockstep. Com `i % 8` e
 * `i % 6` a combinacao se repetia identica a cada 24 capitulos -- tres ciclos
 * completos num livro de 75. O deslocamento por volta desalinha os dois ciclos.
 */
function aberturaEFechamento(
  chapterIndex: number,
  ficcao: boolean,
  ultimo: boolean
): { abertura: string; fechamento: string } {
  const aberturas = ficcao ? ABERTURAS_FICCAO : CHAPTER_OPENINGS;
  const fechamentos = ficcao
    ? FECHAMENTOS_FICCAO
    : ultimo
      ? CHAPTER_CLOSINGS_LAST
      : CHAPTER_CLOSINGS;
  const voltas = Math.floor(chapterIndex / aberturas.length);
  return {
    abertura: aberturas[chapterIndex % aberturas.length],
    fechamento: fechamentos[(chapterIndex + voltas) % fechamentos.length],
  };
}

export async function generateOutline(ctx: EbookContext): Promise<Outline> {
  // Palavras e a unidade que a geracao controla; paginas dependem da diagramacao.
  const palavrasAlvo = ctx.wordGoal && ctx.wordGoal > 0 ? ctx.wordGoal : ctx.pageCount * ctx.wordsPerPage;
  const chapterCount = chapterCountFor(Math.round(palavrasAlvo / Math.max(1, ctx.wordsPerPage)));
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
  const ficcao = ehFiccao(classificacao(ctx));
  const blocoElencoSchema = ficcao
    ? `
  "personagens": [
    { "nome": "nome completo", "papel": "protagonista | par romantico | apoio | antagonista", "descricao": "idade, ocupacao e o que define esta pessoa, em uma frase", "arco": "o que muda nesta pessoa do inicio ao fim do livro" }
  ],`
    : "";
  const instrucaoElenco = ficcao
    ? `
Defina tambem o ELENCO do livro: de 3 a 8 personagens, com o protagonista e o par romantico explicitos quando houver. Os nomes escolhidos aqui valem para o livro inteiro -- introducao, todos os capitulos e conclusao usarao exatamente estes.`
    : "";

  // Em ficcao, o resumo de uma frase por capitulo era todo o planejamento que
  // existia para ~1.000 palavras de prosa, e "angulo" e vocabulario de nao
  // ficcao: num romance nao ha angulo, ha cena, evento e consequencia.
  const instrucaoCapitulos = ficcao
    ? `Cada capitulo precisa ser um passo da MESMA historia, na ordem em que ela acontece. No resumo, diga o que ACONTECE no capitulo -- quem esta na cena, o que e feito ou descoberto, e o que muda para os proximos -- e nao o tema do capitulo. Um resumo como "a relacao entre os dois se aprofunda" nao serve; "Ana descobre que Lucas mentiu sobre o emprego e decide nao contar a ninguem" serve.

Em "personagens", liste quais nomes do elenco aparecem em cada capitulo. Os protagonistas precisam aparecer na maior parte do livro -- um capitulo sem nenhum deles so se justifica se a historia realmente pedir.

A historia inteira precisa caber nos ${chapterCount} capitulos: comeco, meio e fim, sem que os ultimos fiquem sem o que contar nem que o desfecho seja espremido no ultimo.`
    : `Cada resumo de capítulo deve indicar um ângulo específico, não uma repetição do tema geral com outras palavras — os capítulos precisam progredir e se diferenciar entre si, cada um partindo do que o anterior já estabeleceu.`;

  const prompt = `Planeje a estrutura de um ebook com estas informações:
- Classificação principal: ${classificacao(ctx)}  (formato "Área > Subcategoria" — o livro deve ficar dentro dela)
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

${instrucaoCapitulos}${instrucaoElenco}

Responda em JSON, APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois:
{
  "title": "...",
  "subtitle": "...",${blocoElencoSchema}
  "chapters": [
    { "title": "...", "summary": "${ficcao ? "o que acontece neste capitulo" : "uma frase descrevendo o ângulo específico deste capítulo"}"${ficcao ? `, "personagens": ["nome do elenco"]` : ""} }
  ]
}`;

  // O JSON do sumario cresce com o numero de capitulos. Com o teto fixo em 12,
  // 2000 tokens sobravam; com 100 capitulos a resposta seria cortada no meio e o
  // JSON viria invalido -- falha silenciosa e dificil de diagnosticar.
  //
  // A verba por capitulo subiu porque o resumo deixou de ser um rotulo de tema e
  // passou a descrever o que acontece, com a lista de personagens junto. Com 40
  // tokens o modelo se autocomprimia de volta ao rotulo.
  const porCapitulo = ficcao ? 110 : 60;
  const tokensSumario = Math.max(2000, 500 + chapterCount * porCapitulo) + (ficcao ? 900 : 0);
  const raw = await askOpenAI(systemPrompt(ctx), prompt, tokensSumario, true);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as Outline;
  if (!parsed.chapters || parsed.chapters.length === 0) {
    throw new Error("A IA não retornou capítulos válidos.");
  }
  return parsed;
}

// --- Estado narrativo entre capitulos --------------------------------------

/**
 * Marca que separa o texto do capitulo do bloco de estado. O modelo escreve a
 * prosa normalmente e, no fim, registra o que criou.
 *
 * A alternativa seria uma segunda chamada por capitulo so para extrair o estado
 * -- 75 chamadas a mais num livro de 300 paginas. Pedir JSON puro na mesma
 * chamada tambem nao serve: a prosa piora quando sai escapada dentro de string.
 */
const MARCA_ESTADO = "===ESTADO===";

function normalizarPersonagens(v: unknown): Personagem[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 6)
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        nome: String(o.nome ?? "").trim().slice(0, 80),
        papel: String(o.papel ?? "apoio").trim().slice(0, 60),
        descricao: String(o.descricao ?? "").trim().slice(0, 200),
      };
    })
    .filter((p) => p.nome.length > 0);
}

/**
 * Separa a prosa do bloco de estado. Se o JSON vier quebrado, o texto ainda e
 * devolvido limpo: publicar um capitulo com `===ESTADO=== {...}` colado no fim
 * seria pior do que perder o registro daquele capitulo.
 */
export function separarEstado(bruto: string): { texto: string; estado: EstadoCapitulo | null } {
  const corte = bruto.lastIndexOf(MARCA_ESTADO);
  if (corte === -1) return { texto: bruto.trim(), estado: null };

  const texto = bruto.slice(0, corte).trim();
  const cru = bruto.slice(corte + MARCA_ESTADO.length);

  try {
    const p = JSON.parse(extractJson(cru)) as Partial<EstadoCapitulo>;
    return {
      texto,
      estado: {
        resumo: String(p.resumo ?? "").trim().slice(0, 600),
        personagensNovos: normalizarPersonagens(p.personagensNovos),
        fiosAbertos: (Array.isArray(p.fiosAbertos) ? p.fiosAbertos : [])
          .map((f) => String(f).trim())
          .filter(Boolean)
          .slice(0, 6),
      },
    };
  } catch {
    return { texto, estado: null };
  }
}

/** Quantos capitulos registrados entram no prompt do proximo. */
const JANELA_RESUMOS = 8;
/** Quantos personagens criados na prosa acompanham o elenco do sumario. */
const MAX_PERSONAGENS_REGISTRADOS = 12;

/**
 * Elenco do sumario mais quem foi criado na prosa e registrado. Sem isto, a
 * permissao "personagens secundarios novos sao permitidos" era lida por 75
 * chamadas independentes, cada uma inventando os seus e nenhuma sabendo dos
 * anteriores -- a fabrica de figurante de uso unico.
 */
export function elencoAcumulado(outline: Outline, escritos: CapituloEscrito[]): Personagem[] {
  const vistos = new Set<string>();
  const doSumario: Personagem[] = [];
  const registrados: Personagem[] = [];
  const chave = (nome: string) => nome.trim().toLowerCase();

  for (const p of outline.personagens ?? []) {
    if (!p?.nome || vistos.has(chave(p.nome))) continue;
    vistos.add(chave(p.nome));
    doSumario.push(p);
  }
  for (const c of escritos) {
    for (const p of c.estado?.personagensNovos ?? []) {
      if (!p?.nome || vistos.has(chave(p.nome))) continue;
      vistos.add(chave(p.nome));
      registrados.push(p);
    }
  }

  return [...doSumario, ...registrados.slice(-MAX_PERSONAGENS_REGISTRADOS)];
}

/**
 * Repassa o elenco a todas as etapas de escrita. Sem ele, cada chamada ao modelo
 * cria personagens do zero e o livro troca de protagonista no meio.
 */
function elencoBlock(elenco: Personagem[]): string {
  if (elenco.length === 0) return "";
  const linhas = elenco
    .map((p) => `- ${p.nome} (${p.papel}): ${p.descricao}${p.arco ? ` Arco: ${p.arco}` : ""}`)
    .join("\n");
  return `
ELENCO DO LIVRO — use exatamente estes nomes, sem trocar, encurtar, apelidar nem inventar outro protagonista:
${linhas}
`;
}

function historicoBlock(escritos: CapituloEscrito[]): string {
  const comEstado = escritos.filter((c) => c.estado?.resumo);
  if (comEstado.length === 0) return "";

  const janela = comEstado.slice(-JANELA_RESUMOS);
  const omitidos = comEstado.length - janela.length;
  const linhas = janela
    .map((c) => `${c.idx + 1}. "${c.title}" — ${c.estado!.resumo}`)
    .join("\n");

  return `
O QUE JÁ ACONTECEU — resumo do que foi de fato escrito nos capítulos anteriores, em ordem. Continue a partir daqui: não recomece a história, não reapresente quem já foi apresentado e não repita cenas que já aconteceram.${omitidos > 0 ? ` (Os ${omitidos} primeiros capítulos também já foram escritos; abaixo estão só os mais recentes.)` : ""}
${linhas}
`;
}

function fiosBlock(escritos: CapituloEscrito[]): string {
  const fios = escritos.flatMap((c) => c.estado?.fiosAbertos ?? []);
  const unicos = [...new Set(fios.map((f) => f.trim()).filter(Boolean))].slice(-8);
  if (unicos.length === 0) return "";
  return `
FIOS ABERTOS — pendências deixadas pelos capítulos anteriores. Retome pelo menos uma delas quando fizer sentido neste capítulo, e nunca as trate como novidade:
${unicos.map((f) => `- ${f}`).join("\n")}
`;
}

function pedidoDeEstado(ficcao: boolean): string {
  return `
Depois do texto do capítulo, e só depois dele, escreva numa linha isolada a marca ${MARCA_ESTADO} e, logo abaixo, um JSON de uma linha registrando o que você escreveu. Este bloco não faz parte do livro e será removido antes de publicar — é o que permite ao próximo capítulo continuar de onde este parou.

${MARCA_ESTADO}
{"resumo": "2 a 3 frases dizendo o que de fato aconteceu neste capítulo, citando os nomes envolvidos", "personagensNovos": [${ficcao ? `{"nome": "...", "papel": "apoio | antagonista | ...", "descricao": "quem é, em uma frase"}` : ""}], "fiosAbertos": ["pendência que ficou e que um capítulo seguinte pode retomar"]}

Em "personagensNovos" registre apenas quem você criou agora e que precisa continuar existindo no livro — quem já estava no elenco não entra. Se não criou ninguém, use uma lista vazia.`;
}

export async function generateIntro(
  ctx: EbookContext,
  outline: Outline,
  escritos: CapituloEscrito[] = []
): Promise<string> {
  const ficcao = ehFiccao(classificacao(ctx));
  const elenco = elencoAcumulado(outline, escritos);
  // A introducao era escrita ANTES de qualquer capitulo existir, e por isso
  // abria um livro que ela nao tinha lido -- o defeito de "Alem das Quatro
  // Linhas", que fixar o elenco corrigiu so nos nomes.
  const conhece = escritos.some((c) => c.estado?.resumo);

  const prompt = `Escreva a introdução do ebook "${outline.title}" (${outline.subtitle}).
Tema: ${classificacao(ctx)}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(elenco)}${conhece ? historicoBlock(escritos) : ""}${groundingBlock(ctx)}
${
  ficcao
    ? `Esta introdução abre uma obra de ficção: escreva-a como parte da história — uma cena curta, uma voz, uma situação —, com os personagens do elenco e coerente com o que já foi escrito. Não resuma o enredo, não entregue o desfecho e não explique ao leitor o que ele vai ler.`
    : `A introdução deve criar conexão real com o leitor a partir de uma situação, dúvida ou dificuldade concreta — não anuncie o sumário do livro nem liste os capítulos que virão a seguir. O leitor só precisa sentir que este livro fala com a experiência dele; a estrutura interna do livro não precisa ser explicada aqui.`
}

Escreva de 300 a 450 palavras, em parágrafos corridos, sem repetir o título do livro como cabeçalho. Responda apenas com o texto final da introdução, sem comentários.`;
  return askOpenAI(systemPrompt(ctx), prompt, 1500);
}

export async function generateChapter(
  ctx: EbookContext,
  outline: Outline,
  chapterIndex: number,
  escritos: CapituloEscrito[]
): Promise<{ texto: string; estado: EstadoCapitulo | null }> {
  const chapter = outline.chapters[chapterIndex];
  const isLastChapter = chapterIndex === outline.chapters.length - 1;
  const nextChapter = !isLastChapter ? outline.chapters[chapterIndex + 1] : null;
  const alvoTotal = ctx.wordGoal && ctx.wordGoal > 0 ? ctx.wordGoal : ctx.pageCount * ctx.wordsPerPage;
  const wordsPerChapter = Math.round(alvoTotal / outline.chapters.length);
  const ficcao = ehFiccao(classificacao(ctx));
  const { abertura, fechamento } = aberturaEFechamento(chapterIndex, ficcao, isLastChapter);
  const elenco = elencoAcumulado(outline, escritos);

  const naCena = (chapter.personagens ?? []).filter(Boolean);
  const instrucaoPresenca =
    naCena.length > 0
      ? `\nSegundo o sumário, aparecem neste capítulo: ${naCena.join(", ")}. Eles precisam estar na cena de verdade, não apenas citados de passagem.\n`
      : "";

  const prompt = `Escreva o conteúdo completo do capítulo ${chapterIndex + 1} de ${outline.chapters.length} do ebook "${outline.title}".
Título do capítulo: "${chapter.title}"
O que este capítulo deve cobrir: ${chapter.summary}
Tema geral do livro: ${classificacao(ctx)}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(elenco)}${instrucaoPresenca}${historicoBlock(escritos)}${fiosBlock(escritos)}${
    escritos.length === 0 ? "\nEste é o primeiro capítulo do livro.\n" : ""
  }${
    isLastChapter
      ? "\nEste é o ÚLTIMO capítulo do livro — não faça nenhuma referência a um próximo capítulo, pois não existe, e feche o que ficou em aberto.\n"
      : nextChapter
        ? `\nO próximo capítulo vai tratar de: "${nextChapter.title}". Deixe o caminho aberto para ele, sem antecipá-lo.\n`
        : ""
  }${groundingBlock(ctx)}
Abra o capítulo com ${abertura}. Não anuncie o que o capítulo vai abordar antes de começar — vá direto ao ponto escolhido para a abertura.
Encerre o capítulo com ${fechamento}.

Escreva aproximadamente ${wordsPerChapter} palavras, com parágrafos de tamanhos variados. Use no máximo uma lista curta ou caixa de destaque, só se fizer sentido — o capítulo não deve virar um formulário de tópicos. Não inclua o título do capítulo no texto (ele já é exibido separadamente).
${pedidoDeEstado(ficcao)}`;

  // O teto subiu junto com o bloco de estado, que sai na mesma resposta: com
  // 4000 o registro do capitulo podia ser justamente o pedaco cortado no fim.
  const bruto = await askOpenAI(systemPrompt(ctx), prompt, 4600);
  return separarEstado(bruto);
}

export async function generateConclusion(
  ctx: EbookContext,
  outline: Outline,
  escritos: CapituloEscrito[] = []
): Promise<string> {
  const ficcao = ehFiccao(classificacao(ctx));
  const elenco = elencoAcumulado(outline, escritos);
  const comEstado = escritos.filter((c) => c.estado?.resumo);

  // Antes a conclusao recebia so a lista de titulos e a ordem de "amarrar os
  // aprendizados centrais dos capitulos" -- amarrava um livro que nao tinha
  // lido. Com o estado gravado, ela recebe o que de fato aconteceu.
  const percurso =
    comEstado.length > 0
      ? comEstado.map((c) => `${c.idx + 1}. "${c.title}" — ${c.estado!.resumo}`).join("\n")
      : outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");

  const prompt = `Escreva a conclusão do ebook "${outline.title}", a partir do que o livro de fato conta:
${percurso}
Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${elencoBlock(elenco)}${fiosBlock(escritos)}${groundingBlock(ctx)}
${
  ficcao
    ? `Esta é a conclusão de uma obra de ficção: feche a história com os personagens do elenco, resolvendo o que ficou em aberto ou deixando claro o que fica por resolver. Não resuma o enredo, não explique o significado do livro e não fale com o leitor.`
    : `Não repita a introdução com outras palavras. Termine com um convite prático e específico para o leitor aplicar algo do livro — evite frases motivacionais genéricas de encerramento.`
}
Escreva de 250 a 400 palavras. Responda apenas com o texto final.`;
  return askOpenAI(systemPrompt(ctx), prompt, 1200);
}

export async function generateAboutAuthor(
  authorName: string,
  authorBio: string,
  language: string
): Promise<string> {
  const prompt = `Escreva uma seção "Sobre o Autor" para um ebook, em ${language}, para o autor "${authorName}".
${authorBio ? `Use como base esta informação fornecida pelo autor, sem inventar credenciais além dela: "${authorBio}"` : "O autor não forneceu bio — escreva algo genérico e breve, sem inventar credenciais específicas (formação, prêmios, cargos)."}
Escreva de 60 a 120 palavras, em terceira pessoa, num tom natural, sem clichês de contracapa de livro. Responda apenas com o texto final.`;
  return askOpenAI(SISTEMA_NAO_FICCAO, prompt, 500);
}

/**
 * Segunda passada editorial: revisa um texto já escrito removendo padrões
 * característicos de IA, preservando o conteúdo e a mensagem original.
 *
 * `nomes` existe porque esta passada roda por capitulo, sem elenco e sem
 * sumario: ao "remover generalizacoes vagas" ela podia trocar ou apagar um nome
 * proprio sem ter como saber que aquilo era uma referencia do livro.
 */
export async function humanizeText(
  text: string,
  contextLabel: string,
  maxTokens = 4000,
  nomes: string[] = []
): Promise<string> {
  const guarda =
    nomes.length > 0
      ? `\nNÃO ALTERE, em hipótese nenhuma, estes nomes próprios, nem os substitua por pronomes ou descrições: ${nomes.join(", ")}. Também não mude a ordem dos acontecimentos nem quem faz o quê.\n`
      : "";
  const prompt = `Revise o texto abaixo como um editor especializado em detectar e remover padrões artificiais de textos gerados por IA, preservando 100% do conteúdo, dos fatos e da mensagem original.

Contexto: ${contextLabel}
${guarda}
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
  return askOpenAI(SISTEMA_BASE, prompt, maxTokens);
}
