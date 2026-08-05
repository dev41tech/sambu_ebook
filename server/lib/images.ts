import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

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

function styleHint(suggestion: string): string {
  const trimmed = suggestion.trim();
  return trimmed || "editorial moderno, cores harmoniosas, iluminação sofisticada";
}

async function requestImage(
  prompt: string,
  size: "1024x1536" | "1536x1024" | "1024x1024",
  quality: "high" | "medium"
): Promise<Buffer> {
  const openai = getClient();
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size,
    quality,
    n: 1,
  });
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

// Direção de arte compartilhada: o que separa uma capa "de livraria" de uma
// imagem genérica de IA é composição deliberada, um único ponto focal forte,
// espaço negativo reservado para o título, e ausência dos tiques visuais
// clássicos de IA (excesso de elementos, texturas ruidosas, texto quebrado).
const ART_DIRECTION = `Direção de arte obrigatória:
- Um único ponto focal forte e reconhecível — não uma colagem de vários elementos pequenos.
- Composição limpa, com espaço negativo generoso (a imagem vai receber texto por cima depois).
- Paleta de cores coesa e sofisticada (2 a 3 cores dominantes), nada de arco-íris de cores brigando entre si.
- Iluminação intencional, com contraste que dê profundidade.
- Qualidade de capa de editora/revista, não arte genérica de banco de imagens.
- Nada de texto, letras, números ou logotipos na imagem, mesmo que ilegíveis.
- Nada de rostos humanos renderizados de perto (evite artefatos típicos de IA em rostos); se precisar de figura humana, prefira silhueta, vulto à distância ou enquadramento que corte antes do rosto.`;

export async function generateCoverImage(
  ebookId: string,
  title: string,
  theme: string,
  suggestion: string
): Promise<string> {
  const prompt = `Crie a arte de capa de um ebook profissional, no padrão visual de uma editora de verdade, para um livro sobre "${theme}" (título: "${title}").
Orientação de estilo do autor: ${styleHint(suggestion)}.
Formato retrato (proporção de capa de livro), pensado para ficar com o título e subtítulo sobrepostos no terço inferior ou superior da imagem — deixe essa área com menos detalhe visual para não competir com o texto.
${ART_DIRECTION}`;
  const buffer = await requestImage(prompt, "1024x1536", "high");
  const outPath = path.join(imagesDir, `${ebookId}-cover.png`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

export async function generateChapterImage(
  ebookId: string,
  chapterId: string,
  chapterTitle: string,
  chapterSummary: string,
  suggestion: string
): Promise<string> {
  const prompt = `Crie uma ilustração editorial para um capítulo de ebook chamado "${chapterTitle}", que fala sobre: ${chapterSummary}.
Orientação de estilo do autor: ${styleHint(suggestion)}.
Formato paisagem (mais larga do que alta), pensada para ilustrar o início do capítulo em um livro publicado profissionalmente — não um clipart solto, uma cena ou composição com contexto.
${ART_DIRECTION}`;
  const buffer = await requestImage(prompt, "1536x1024", "medium");
  const outPath = path.join(imagesDir, `${ebookId}-${chapterId}.png`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
