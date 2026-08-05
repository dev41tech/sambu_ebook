import OpenAI from "openai";

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
  theme: string;
  audience: string;
  tone: string;
  language: string;
  pageCount: number;
  titleMode: "ai" | "manual";
  customTitle?: string | null;
  customSubtitle?: string | null;
  authorContext?: string | null;
}

export interface OutlineChapter {
  title: string;
  summary: string;
}

export interface Outline {
  title: string;
  subtitle: string;
  chapters: OutlineChapter[];
}

function chapterCountFor(pageCount: number): number {
  const raw = Math.round(pageCount / 4);
  return Math.min(12, Math.max(3, raw));
}

async function askOpenAI(
  system: string,
  prompt: string,
  maxTokens: number,
  jsonMode = false
): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Resposta vazia da IA.");
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

const SYSTEM_PROMPT = `Você é um ghostwriter e editor profissional especializado em livros e ebooks humanizados.

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

export async function generateOutline(ctx: EbookContext): Promise<Outline> {
  const chapterCount = chapterCountFor(ctx.pageCount);
  const titleInstruction =
    ctx.titleMode === "manual" && ctx.customTitle
      ? `Use exatamente este título: "${ctx.customTitle}". ${
          ctx.customSubtitle ? `Use exatamente este subtítulo: "${ctx.customSubtitle}".` : "Crie um subtítulo curto e complementar."
        }`
      : "Crie um título forte e um subtítulo curto e complementar. Evite títulos genéricos de autoajuda (nada de \"O Poder de...\", \"Desperte...\", \"Transforme sua vida...\").";

  const prompt = `Planeje a estrutura de um ebook com estas informações:
- Tema/nicho: ${ctx.theme}
- Público-alvo: ${ctx.audience}
- Tom de voz: ${ctx.tone}
- Idioma do ebook: ${ctx.language}
- Extensão alvo: ~${ctx.pageCount} páginas (aproximadamente ${ctx.pageCount * 250} palavras no total)
- Número de capítulos: exatamente ${chapterCount}
${ctx.authorContext ? `- Contexto/voz do autor fornecido: ${ctx.authorContext}` : ""}

${titleInstruction}

Cada resumo de capítulo deve indicar um ângulo específico, não uma repetição do tema geral com outras palavras — os capítulos precisam progredir e se diferenciar entre si.

Responda em JSON, APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois:
{
  "title": "...",
  "subtitle": "...",
  "chapters": [
    { "title": "...", "summary": "uma frase descrevendo o ângulo específico deste capítulo" }
  ]
}`;

  const raw = await askOpenAI(SYSTEM_PROMPT, prompt, 2000, true);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as Outline;
  if (!parsed.chapters || parsed.chapters.length === 0) {
    throw new Error("A IA não retornou capítulos válidos.");
  }
  return parsed;
}

export async function generateIntro(ctx: EbookContext, outline: Outline): Promise<string> {
  const prompt = `Escreva a introdução do ebook "${outline.title}" (${outline.subtitle}).
Tema: ${ctx.theme}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}

A introdução deve criar conexão real com o leitor a partir de uma situação, dúvida ou dificuldade concreta — não anuncie o sumário do livro nem liste os capítulos que virão a seguir. O leitor só precisa sentir que este livro fala com a experiência dele; a estrutura interna do livro não precisa ser explicada aqui.

Escreva de 300 a 450 palavras, em parágrafos corridos, sem repetir o título do livro como cabeçalho. Responda apenas com o texto final da introdução, sem comentários.`;
  return askOpenAI(SYSTEM_PROMPT, prompt, 1500);
}

export async function generateChapter(
  ctx: EbookContext,
  outline: Outline,
  chapterIndex: number,
  previousChapterTitles: string[]
): Promise<string> {
  const chapter = outline.chapters[chapterIndex];
  const isLastChapter = chapterIndex === outline.chapters.length - 1;
  const nextChapter = !isLastChapter ? outline.chapters[chapterIndex + 1] : null;
  const wordsPerChapter = Math.round((ctx.pageCount * 250) / outline.chapters.length);
  const opening = CHAPTER_OPENINGS[chapterIndex % CHAPTER_OPENINGS.length];
  const closingPool = isLastChapter ? CHAPTER_CLOSINGS_LAST : CHAPTER_CLOSINGS;
  const closing = closingPool[chapterIndex % closingPool.length];
  const prompt = `Escreva o conteúdo completo do capítulo ${chapterIndex + 1} do ebook "${outline.title}".
Título do capítulo: "${chapter.title}"
O que este capítulo deve cobrir: ${chapter.summary}
Tema geral do livro: ${ctx.theme}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}
${previousChapterTitles.length > 0 ? `Capítulos anteriores já escritos: ${previousChapterTitles.join(", ")}. Não repita o mesmo conteúdo ou os mesmos exemplos deles.` : "Este é o primeiro capítulo."}
${isLastChapter ? "Este é o ÚLTIMO capítulo do livro — não faça nenhuma referência a um próximo capítulo, pois não existe." : nextChapter ? `O próximo capítulo vai tratar de: "${nextChapter.title}".` : ""}

Abra o capítulo com ${opening}. Não anuncie o que o capítulo vai abordar antes de começar — vá direto ao ponto escolhido para a abertura.
Encerre o capítulo com ${closing}.

Escreva aproximadamente ${wordsPerChapter} palavras, com parágrafos de tamanhos variados. Use no máximo uma lista curta ou caixa de destaque, só se fizer sentido — o capítulo não deve virar um formulário de tópicos. Não inclua o título do capítulo no texto (ele já é exibido separadamente). Responda apenas com o corpo do texto.`;
  return askOpenAI(SYSTEM_PROMPT, prompt, 4000);
}

export async function generateConclusion(ctx: EbookContext, outline: Outline): Promise<string> {
  const prompt = `Escreva a conclusão do ebook "${outline.title}", amarrando os aprendizados centrais dos capítulos:
${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}
Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${ctx.authorContext ? `Contexto/voz do autor: ${ctx.authorContext}` : ""}

Não repita a introdução com outras palavras. Termine com um convite prático e específico para o leitor aplicar algo do livro — evite frases motivacionais genéricas de encerramento.
Escreva de 250 a 400 palavras. Responda apenas com o texto final.`;
  return askOpenAI(SYSTEM_PROMPT, prompt, 1200);
}

export async function generateAboutAuthor(
  authorName: string,
  authorBio: string,
  language: string
): Promise<string> {
  const prompt = `Escreva uma seção "Sobre o Autor" para um ebook, em ${language}, para o autor "${authorName}".
${authorBio ? `Use como base esta informação fornecida pelo autor, sem inventar credenciais além dela: "${authorBio}"` : "O autor não forneceu bio — escreva algo genérico e breve, sem inventar credenciais específicas (formação, prêmios, cargos)."}
Escreva de 60 a 120 palavras, em terceira pessoa, num tom natural, sem clichês de contracapa de livro. Responda apenas com o texto final.`;
  return askOpenAI(SYSTEM_PROMPT, prompt, 500);
}

/**
 * Segunda passada editorial: revisa um texto já escrito removendo padrões
 * característicos de IA, preservando o conteúdo e a mensagem original.
 */
export async function humanizeText(text: string, contextLabel: string, maxTokens = 4000): Promise<string> {
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
  return askOpenAI(SYSTEM_PROMPT, prompt, maxTokens);
}
