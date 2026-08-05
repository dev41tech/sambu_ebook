// Lê arquivos de referência que o usuário deixa na pasta ebook-forge/knowledge/ (.txt,
// .md, .pdf) e usa como contexto extra na geração — uma base de conhecimento persistente,
// separada do material de referência colado por ebook.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { extractTextFromPdf } from "./reference";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const knowledgeDir = path.resolve(__dirname, "..", "..", "knowledge");
fs.mkdirSync(knowledgeDir, { recursive: true });

const README_PATH = path.join(knowledgeDir, "README.md");
if (!fs.existsSync(README_PATH)) {
  fs.writeFileSync(
    README_PATH,
    `# Pasta de conhecimento do Sambu Ebooks

Coloque aqui arquivos .txt, .md ou .pdf com informações que você quer que a IA use como
base ao escrever os ebooks (guias internos, pesquisas, dados de nicho, etc.).

Todo arquivo colocado aqui é lido automaticamente a cada novo ebook gerado.
`
  );
}

interface CacheEntry {
  mtimeMs: number;
  text: string;
}

const cache = new Map<string, CacheEntry>();
const MAX_TOTAL_CHARS = 12000;

async function readFileAsText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const { text } = await extractTextFromPdf(buffer);
    return text;
  }
  if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf-8");
  }
  return "";
}

export async function getKnowledgeContext(): Promise<string> {
  let files: string[];
  try {
    files = fs
      .readdirSync(knowledgeDir)
      .filter((f) => [".txt", ".md", ".pdf"].includes(path.extname(f).toLowerCase()));
  } catch {
    return "";
  }
  if (files.length === 0) return "";

  const parts: string[] = [];
  for (const file of files) {
    const filePath = path.join(knowledgeDir, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    const cached = cache.get(filePath);
    let text: string;
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      text = cached.text;
    } else {
      try {
        text = (await readFileAsText(filePath)).trim();
      } catch {
        continue;
      }
      cache.set(filePath, { mtimeMs: stat.mtimeMs, text });
    }
    if (text) parts.push(`--- ${file} ---\n${text}`);
  }

  if (parts.length === 0) return "";
  return parts.join("\n\n").slice(0, MAX_TOTAL_CHARS);
}
