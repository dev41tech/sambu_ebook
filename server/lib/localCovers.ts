// Lê imagens que o usuário deixa na pasta ebook-forge/covers/ para usar como capa de
// um ebook, sem precisar gerar por IA ou buscar no Pexels — mesmo padrão da pasta
// knowledge/ (ver server/lib/knowledge.ts).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const coversDir = path.resolve(__dirname, "..", "..", "covers");
fs.mkdirSync(coversDir, { recursive: true });

const README_PATH = path.join(coversDir, "README.md");
if (!fs.existsSync(README_PATH)) {
  fs.writeFileSync(
    README_PATH,
    `# Pasta de capas do Sambu Ebooks

Coloque aqui imagens (.jpg, .jpeg, .png, .webp) que você quer usar como capa de um
ebook, em vez de gerar por IA ou buscar no banco de imagens. Elas aparecem para
seleção na tela de criação e na troca de capa de um ebook existente.
`
  );
}

const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export interface LocalCoverFile {
  filename: string;
  sizeBytes: number;
}

// Salva um arquivo enviado por upload direto na pasta covers/, para quem prefere
// escolher a imagem do computador em vez de copiá-la manualmente pra pasta antes.
export function saveUploadedCover(buffer: Buffer, originalFilename: string): LocalCoverFile {
  const ext = path.extname(originalFilename).toLowerCase();
  if (!EXTENSIONS.includes(ext)) {
    throw new Error("Tipo de arquivo não suportado. Envie .jpg, .jpeg, .png ou .webp.");
  }
  const base = path
    .basename(originalFilename, ext)
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .slice(0, 60) || "capa";
  let filename = `${base}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(coversDir, filename))) {
    filename = `${base}-${counter}${ext}`;
    counter += 1;
  }
  fs.writeFileSync(path.join(coversDir, filename), buffer);
  return { filename, sizeBytes: buffer.length };
}

export function listLocalCovers(): LocalCoverFile[] {
  let files: string[];
  try {
    files = fs.readdirSync(coversDir).filter((f) => EXTENSIONS.includes(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
  return files
    .map((filename) => ({ filename, sizeBytes: fs.statSync(path.join(coversDir, filename)).size }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

// path.basename() garante que o nome do arquivo não escape da pasta covers/ (proteção
// contra path traversal), já que o filename chega como input do cliente.
export function resolveLocalCoverPath(filename: string): string {
  const base = path.basename(filename);
  if (!EXTENSIONS.includes(path.extname(base).toLowerCase())) {
    throw new Error("Tipo de arquivo não suportado.");
  }
  const filePath = path.join(coversDir, base);
  if (!fs.existsSync(filePath)) {
    throw new Error("Arquivo de capa não encontrado na pasta covers/.");
  }
  return filePath;
}

export interface UsedLocalCover {
  path: string;
  altText: string;
}

export function useLocalCover(filename: string, title: string, outFileBase: string): UsedLocalCover {
  const srcPath = resolveLocalCoverPath(filename);
  const ext = path.extname(srcPath).toLowerCase();
  const imagesDir = path.resolve(__dirname, "..", "..", "data", "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const outPath = path.join(imagesDir, `${outFileBase}-cover${ext}`);
  fs.copyFileSync(srcPath, outPath);
  return { path: outPath, altText: `Capa do ebook "${title}".` };
}
