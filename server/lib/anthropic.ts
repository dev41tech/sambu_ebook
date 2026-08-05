import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Preencha o arquivo .env (veja .env.example)."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface EbookContext {
  theme: string;
  audience: string;
  tone: string;
  language: string;
  pageCount: number;
  titleMode: "ai" | "manual";
  customTitle?: string | null;
  customSubtitle?: string | null;
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

async function askClaude(system: string, prompt: string, maxTokens: number): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Resposta vazia da IA.");
  }
  return block.text.trim();
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text;
}

const SYSTEM_PROMPT = `Você é um ghostwriter profissional especializado em ebooks digitais em português e em outros idiomas conforme solicitado. Escreve com clareza, exemplos concretos e parágrafos bem estruturados. Nunca inventa credenciais ou fatos verificáveis sobre o autor além do que foi informado. Nunca menciona ser uma IA no texto do livro.`;

export async function generateOutline(ctx: EbookContext): Promise<Outline> {
  const chapterCount = chapterCountFor(ctx.pageCount);
  const titleInstruction =
    ctx.titleMode === "manual" && ctx.customTitle
      ? `Use exatamente este título: "${ctx.customTitle}". ${
          ctx.customSubtitle ? `Use exatamente este subtítulo: "${ctx.customSubtitle}".` : "Crie um subtítulo curto e complementar."
        }`
      : "Crie um título forte e um subtítulo curto e complementar.";

  const prompt = `Planeje a estrutura de um ebook com estas informações:
- Tema/nicho: ${ctx.theme}
- Público-alvo: ${ctx.audience}
- Tom de voz: ${ctx.tone}
- Idioma do ebook: ${ctx.language}
- Extensão alvo: ~${ctx.pageCount} páginas (aproximadamente ${ctx.pageCount * 250} palavras no total)
- Número de capítulos: exatamente ${chapterCount}

${titleInstruction}

Responda APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois:
{
  "title": "...",
  "subtitle": "...",
  "chapters": [
    { "title": "...", "summary": "uma frase descrevendo o que o capítulo vai cobrir" }
  ]
}`;

  const raw = await askClaude(SYSTEM_PROMPT, prompt, 2000);
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
A introdução deve apresentar o problema/desejo do leitor, gerar conexão e mostrar o que ele vai aprender nos capítulos a seguir:
${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}

Escreva de 300 a 450 palavras, em parágrafos corridos, sem repetir o título do livro como cabeçalho. Responda apenas com o texto final da introdução, sem comentários.`;
  return askClaude(SYSTEM_PROMPT, prompt, 1500);
}

export async function generateChapter(
  ctx: EbookContext,
  outline: Outline,
  chapterIndex: number,
  previousChapterTitles: string[]
): Promise<string> {
  const chapter = outline.chapters[chapterIndex];
  const wordsPerChapter = Math.round((ctx.pageCount * 250) / outline.chapters.length);
  const prompt = `Escreva o conteúdo completo do capítulo ${chapterIndex + 1} do ebook "${outline.title}".
Título do capítulo: "${chapter.title}"
O que este capítulo deve cobrir: ${chapter.summary}
Tema geral do livro: ${ctx.theme}. Público-alvo: ${ctx.audience}. Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}.
${previousChapterTitles.length > 0 ? `Capítulos anteriores já escritos: ${previousChapterTitles.join(", ")}. Não repita o mesmo conteúdo deles.` : "Este é o primeiro capítulo."}

Escreva aproximadamente ${wordsPerChapter} palavras, com parágrafos bem estruturados, exemplos práticos e, quando fizer sentido, uma pequena lista ou dica em destaque. Não inclua o título do capítulo no texto (ele já é exibido separadamente). Responda apenas com o corpo do texto.`;
  return askClaude(SYSTEM_PROMPT, prompt, 4000);
}

export async function generateConclusion(ctx: EbookContext, outline: Outline): Promise<string> {
  const prompt = `Escreva a conclusão do ebook "${outline.title}", amarrando os principais aprendizados dos capítulos:
${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}
Tom de voz: ${ctx.tone}. Idioma: ${ctx.language}. Termine com um chamado à ação prático para o leitor aplicar o que aprendeu.
Escreva de 250 a 400 palavras. Responda apenas com o texto final.`;
  return askClaude(SYSTEM_PROMPT, prompt, 1200);
}

export async function generateAboutAuthor(
  authorName: string,
  authorBio: string,
  language: string
): Promise<string> {
  const prompt = `Escreva uma seção "Sobre o Autor" para um ebook, em ${language}, para o autor "${authorName}".
${authorBio ? `Use como base esta informação fornecida pelo autor, sem inventar credenciais além dela: "${authorBio}"` : "O autor não forneceu bio — escreva algo genérico e breve, sem inventar credenciais específicas (formação, prêmios, cargos)."}
Escreva de 60 a 120 palavras, em terceira pessoa. Responda apenas com o texto final.`;
  return askClaude(SYSTEM_PROMPT, prompt, 500);
}
