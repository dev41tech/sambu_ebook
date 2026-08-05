import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.resolve(__dirname, "..", "..", "data", "images");
fs.mkdirSync(imagesDir, { recursive: true });

function getApiKey(): string {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    throw new Error(
      "PEXELS_API_KEY não configurada. Preencha o arquivo .env (veja .env.example)."
    );
  }
  return key;
}

export interface PexelsPhoto {
  id: number;
  thumbUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
}

interface PexelsApiPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

export async function searchPhotos(
  query: string,
  orientation: "portrait" | "landscape",
  perPage = 15
): Promise<PexelsPhoto[]> {
  const apiKey = getApiKey();
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", String(Math.min(perPage, 30)));

  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    throw new Error(`Falha ao buscar fotos no Pexels (${res.status}).`);
  }
  const data = (await res.json()) as { photos: PexelsApiPhoto[] };
  return data.photos.map((p) => ({
    id: p.id,
    thumbUrl: p.src.small,
    previewUrl: p.src.medium,
    downloadUrl: orientation === "portrait" ? p.src.portrait : p.src.landscape,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    alt: p.alt || query,
  }));
}

export interface SavedPhoto {
  path: string;
  altText: string;
  credit: string;
}

export async function downloadPhoto(
  downloadUrl: string,
  photographer: string,
  alt: string,
  outFileBase: string
): Promise<SavedPhoto> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Falha ao baixar a foto selecionada (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(imagesDir, `${outFileBase}.jpg`);
  fs.writeFileSync(outPath, buffer);
  return {
    path: outPath,
    altText: alt,
    credit: `Foto de ${photographer} (Pexels)`,
  };
}
