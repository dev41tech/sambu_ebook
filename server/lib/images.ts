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
  return trimmed || "ilustração digital estilizada, cores harmoniosas";
}

async function requestImage(prompt: string): Promise<Buffer> {
  const openai = getClient();
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1024",
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

export async function generateCoverImage(
  ebookId: string,
  title: string,
  theme: string,
  suggestion: string
): Promise<string> {
  const prompt = `Capa de ebook profissional e atraente para um livro sobre "${theme}", com o clima do título "${title}". Siga esta orientação de estilo dada pelo autor: ${styleHint(suggestion)}. Composição vertical, sem nenhum texto ou letras na imagem, apenas elementos visuais e simbólicos relacionados ao tema.`;
  const buffer = await requestImage(prompt);
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
  const prompt = `Ilustração para um capítulo de ebook chamado "${chapterTitle}", que fala sobre: ${chapterSummary}. Siga esta orientação de estilo dada pelo autor: ${styleHint(suggestion)}. Sem nenhum texto ou letras na imagem.`;
  const buffer = await requestImage(prompt);
  const outPath = path.join(imagesDir, `${ebookId}-${chapterId}.png`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
