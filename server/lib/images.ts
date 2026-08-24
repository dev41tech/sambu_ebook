import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { withRetry } from "./retry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.resolve(__dirname, "..", "..", "data", "images");
fs.mkdirSync(imagesDir, { recursive: true });

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

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export interface GeneratedImage {
  path: string;
  altText: string;
}

function styleHint(suggestion: string): string {
  const trimmed = suggestion.trim();
  return trimmed || "editorial moderno: aparência de revista, fotografia limpa, cores controladas, iluminação natural, uso inteligente de espaço negativo";
}

async function requestImage(
  prompt: string,
  size: "1024x1536" | "1536x1024" | "1024x1024",
  quality: "high" | "medium"
): Promise<Buffer> {
  const openai = getClient();
  const response = await withRetry(() =>
    openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size,
      quality,
      n: 1,
    })
  );
  const item = response.data?.[0];
  if (!item) {
    throw new Error("A IA não retornou nenhuma imagem.");
  }
  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Falha ao baixar imagem gerada (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Resposta de imagem sem dados utilizáveis.");
}

// Exclusões — a API de imagem não tem um campo de "prompt negativo" separado,
// então as exclusões entram como instrução direta dentro do prompt principal.
const EXCLUSOES = `Evite completamente: texto, letras, números ou logotipos (mesmo ilegíveis); mãos deformadas ou com dedos extras; anatomia incorreta; pele com aparência artificial ou excesso de retoque; poses forçadas ou artificiais; aparência de banco de imagens genérico; marcas comerciais; objetos duplicados; fundo poluído ou com excesso de elementos; baixa resolução, ruído ou artefatos visuais; saturação excessiva; expressões faciais exageradas; rostos humanos renderizados de perto (prefira silhueta, vulto à distância, ou enquadramento que corte antes do rosto, para evitar os artefatos típicos de IA em rostos).`;

// Regras de representação de pessoas — dignidade, naturalidade e coerência
// com o público, sem estética artificial de banco de imagens.
const REPRESENTACAO_PESSOAS = `Se a imagem incluir pessoas: respeite a faixa etária do público-alvo informado, use expressões e poses naturais, represente diversidade de forma coerente e sem estereótipo, evite corpos ou proporções irreais, evite roupas ou contextos inadequados à situação, preserve a dignidade e a naturalidade da cena — nada de situação constrangedora ou pose de banco de imagens.`;

const PALAVRAS_SAUDE = [
  "emagrec",
  "peso",
  "dieta",
  "saúde",
  "saude",
  "bem-estar",
  "bem estar",
  "corpo",
  "fitness",
  "nutri",
];

function precisaBlindagemSaude(...campos: string[]): boolean {
  const texto = campos.join(" ").toLowerCase();
  return PALAVRAS_SAUDE.some((p) => texto.includes(p));
}

const BLINDAGEM_SAUDE = `Como o tema toca em saúde, corpo ou bem-estar, siga também: não mostre transformação corporal irreal, não sugira promessa de resultado, não use comparações humilhantes (como "antes e depois"), não associe o corpo a fracasso ou culpa, não use balança como símbolo central, não retrate procedimento médico ou estética de dieta extrema. Prefira transmitir equilíbrio, autocuidado, rotina saudável, movimento, alimentação adequada e bem-estar sustentável — nunca o valor pessoal ligado ao peso.`;

function buildAudienceLine(audience: string): string {
  return audience.trim() ? `Público-alvo da imagem: ${audience.trim()}.` : "";
}

export async function generateCoverImage(
  ebookId: string,
  title: string,
  theme: string,
  audience: string,
  suggestion: string
): Promise<GeneratedImage> {
  const safety = precisaBlindagemSaude(theme, audience) ? `\n${BLINDAGEM_SAUDE}` : "";
  const prompt = `Crie uma ilustração/fotografia editorial de alta qualidade para servir de ARTE DE FUNDO da capa de um ebook sobre "${theme}".
IMPORTANTE: esta imagem é APENAS a arte de fundo, não é um mockup de capa pronta — ela não deve conter nenhum texto, título, subtítulo, nome de autor ou tipografia de nenhum tipo. Título, subtítulo e nome do autor serão adicionados depois, por cima, via código.
${buildAudienceLine(audience)}
Objetivo: comunicar o tema em poucos segundos e funcionar bem mesmo em miniatura reduzida.
Orientação de estilo do autor: ${styleHint(suggestion)}.
Composição: um elemento visual principal como ponto focal, com espaço reservado e limpo no terço superior OU inferior da imagem para receber título, subtítulo e nome do autor por cima depois — deixe essa área com menos detalhe para não competir com o texto que será adicionado depois.
Paleta de cores coesa e sofisticada (2 a 3 cores dominantes). Iluminação intencional, com contraste que dê profundidade. Qualidade de capa de editora/revista, não arte genérica de banco de imagens.
${REPRESENTACAO_PESSOAS}
${EXCLUSOES}${safety}`;
  const buffer = await requestImage(prompt, "1024x1536", "high");
  const outPath = path.join(imagesDir, `${ebookId}-cover.png`);
  fs.writeFileSync(outPath, buffer);
  return { path: outPath, altText: `Capa do ebook "${title}", sobre ${theme}.` };
}

// Tipos de imagem interna, alternados por índice para variar entre pessoas,
// objetos e ambientes ao longo do livro, em vez de repetir sempre a mesma
// abordagem de composição.
const INTERNAL_IMAGE_TYPES = [
  "uma cena humanizada mostrando, na prática, o conceito deste trecho do capítulo sendo aplicado no dia a dia",
  "uma ilustração conceitual ou metáfora visual para a ideia central deste trecho do capítulo, sem depender de pessoas",
  "uma composição de objetos relacionados ao tema deste trecho do capítulo, sem pessoas, como uma natureza-morta editorial",
  "uma cena de ambiente ou cenário relacionado ao contexto deste trecho do capítulo, com o foco no espaço e não em rostos",
];

export async function generateChapterImage(
  ebookId: string,
  chapterId: string,
  imageIndex: number,
  chapterTitle: string,
  chapterSummary: string,
  audience: string,
  suggestion: string,
  coverSuggestion: string
): Promise<GeneratedImage> {
  const imageType = INTERNAL_IMAGE_TYPES[imageIndex % INTERNAL_IMAGE_TYPES.length];
  const safety = precisaBlindagemSaude(chapterTitle, chapterSummary, audience) ? `\n${BLINDAGEM_SAUDE}` : "";
  const consistency = coverSuggestion.trim()
    ? `Mantenha consistência visual com a capa do mesmo livro, que segue esta direção: ${coverSuggestion.trim()}.`
    : "";
  const prompt = `Crie ${imageType}, para abrir um capítulo de ebook chamado "${chapterTitle}", que fala sobre: ${chapterSummary}.
${buildAudienceLine(audience)}
Orientação de estilo do autor: ${styleHint(suggestion)}. ${consistency}
Composição pensada para ilustrar a abertura de um capítulo em um livro publicado profissionalmente — uma cena ou composição com contexto, não um clipart solto ou ícone genérico. A imagem não deve competir com o texto do capítulo nem repetir a composição de outras imagens do mesmo livro.
${REPRESENTACAO_PESSOAS}
${EXCLUSOES}${safety}`;
  const buffer = await requestImage(prompt, "1536x1024", "medium");
  const outPath = path.join(imagesDir, `${ebookId}-${chapterId}.png`);
  fs.writeFileSync(outPath, buffer);
  return { path: outPath, altText: `Ilustração do capítulo "${chapterTitle}": ${chapterSummary}` };
}

const MARKETING_SIZES: Record<string, "1024x1536" | "1536x1024" | "1024x1024"> = {
  capa: "1024x1536",
  post: "1024x1024",
  story: "1024x1536",
  banner: "1536x1024",
};

// Imagem-base de um criativo de marketing (capa alternativa, post, story, banner) — sem
// texto embutido, já que headline/subheadline/CTA são compostos por cima depois via
// Puppeteer. Deixa uma área limpa para o texto, igual à capa do livro.
export async function generateMarketingImage(
  ebookId: string,
  creativeId: string,
  tipo: string,
  descricaoVisual: string,
  theme: string,
  audience: string
): Promise<GeneratedImage> {
  const size = MARKETING_SIZES[tipo] || "1024x1024";
  const safety = precisaBlindagemSaude(theme, audience, descricaoVisual) ? `\n${BLINDAGEM_SAUDE}` : "";
  const prompt = `Crie uma imagem publicitária para divulgar um ebook sobre "${theme}", sem nenhum texto embutido na imagem.
Cena: ${descricaoVisual}.
${buildAudienceLine(audience)}
Deixe uma área limpa e com menos detalhe (terço superior ou inferior) reservada para receber título e botão de ação por cima depois — não a preencha com elementos que vão competir com o texto.
Qualidade de anúncio/capa de editora profissional, não arte genérica de banco de imagens. Paleta coesa, iluminação intencional.
${REPRESENTACAO_PESSOAS}
${EXCLUSOES}${safety}`;
  const buffer = await requestImage(prompt, size, "medium");
  const outPath = path.join(imagesDir, `${ebookId}-marketing-${creativeId}.png`);
  fs.writeFileSync(outPath, buffer);
  return { path: outPath, altText: `Imagem publicitária (${tipo}) para o ebook sobre ${theme}.` };
}
