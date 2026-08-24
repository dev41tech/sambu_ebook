// Compõe um criativo de marketing final: pega a imagem-base (gerada por IA, sem texto) e
// aplica headline/subheadline/CTA/marca por cima via Puppeteer, usando a paleta e as
// fontes do template visual do próprio ebook — sem depender de Bannerbear/Creatomate.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./pdf";
import { BOOK_TEMPLATE } from "../templates/index";
import { escapeHtml } from "./markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports", "criativos");
fs.mkdirSync(exportsDir, { recursive: true });

export interface CreativeInput {
  id: string;
  tipo: "capa" | "post" | "story" | "banner" | string;
  headline: string;
  subheadline: string;
  cta: string;
}

const DIMENSIONS: Record<string, { width: number; height: number }> = {
  capa: { width: 1000, height: 1500 },
  post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  banner: { width: 1200, height: 628 },
};

function imageToDataUri(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const lower = filePath.toLowerCase();
  const mime = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function buildHtml(
  creative: CreativeInput,
  imageDataUri: string,
  brandName: string
): string {
  const t = BOOK_TEMPLATE;
  const dims = DIMENSIONS[creative.tipo] || DIMENSIONS.post;
  // Banners são baixos e largos — o texto fica melhor num painel lateral, não num
  // gradiente por cima da foto inteira como nos formatos verticais/quadrados.
  const isBanner = creative.tipo === "banner";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: ${dims.width}px; height: ${dims.height}px; overflow: hidden; font-family: ${t.bodyFont}; }
  .frame { position: relative; width: 100%; height: 100%; background: ${t.pageBg}; }
  .photo { position: absolute; inset: 0; background-image: url('${imageDataUri}'); background-size: cover; background-position: center; }
  .panel-bottom {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: ${isBanner ? "0" : "7% 8% 9%"};
    background: linear-gradient(to top, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.82) 55%, rgba(10,10,10,0) 100%);
  }
  .panel-side {
    position: absolute; top: 0; bottom: 0; right: 0; width: 44%;
    display: flex; flex-direction: column; justify-content: center;
    padding: 6% 5%;
    background: ${t.pageBg};
  }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: ${dims.width * 0.018}px; color: ${t.accent}; font-family: ${t.headingFont}; font-weight: 700; }
  .headline { font-family: ${t.headingFont}; font-weight: 700; font-size: ${dims.width * 0.062}px; line-height: 1.12; margin: 0.4em 0 0.3em; }
  .headline.light { color: #ffffff; }
  .headline.dark { color: ${t.heading}; }
  .sub { font-size: ${dims.width * 0.026}px; line-height: 1.4; margin-bottom: 0.9em; max-width: 92%; }
  .sub.light { color: rgba(255,255,255,0.88); }
  .sub.dark { color: ${t.text}; }
  .cta {
    display: inline-block; padding: ${dims.width * 0.022}px ${dims.width * 0.045}px;
    background: ${t.accent}; color: #ffffff; font-family: ${t.headingFont}; font-weight: 700;
    font-size: ${dims.width * 0.024}px; border-radius: 999px; letter-spacing: 0.01em;
  }
  .brand { position: absolute; ${isBanner ? "bottom: 6%; right: 5%;" : "top: 5%; left: 6%;"} font-size: ${dims.width * 0.02}px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: ${isBanner ? t.accent : "rgba(255,255,255,0.85)"}; font-family: ${t.headingFont}; }
</style>
</head>
<body>
  <div class="frame">
    ${isBanner ? "" : `<div class="photo"></div>`}
    ${brandName ? `<div class="brand">${escapeHtml(brandName)}</div>` : ""}
    ${
      isBanner
        ? `<div class="photo" style="right:44%; left:0;"></div>
           <div class="panel-side">
             <p class="eyebrow">${escapeHtml(creative.tipo)}</p>
             <h1 class="headline dark">${escapeHtml(creative.headline)}</h1>
             <p class="sub dark">${escapeHtml(creative.subheadline)}</p>
             <span class="cta">${escapeHtml(creative.cta)}</span>
           </div>`
        : `<div class="panel-bottom">
             <h1 class="headline light">${escapeHtml(creative.headline)}</h1>
             <p class="sub light">${escapeHtml(creative.subheadline)}</p>
             <span class="cta">${escapeHtml(creative.cta)}</span>
           </div>`
    }
  </div>
</body>
</html>`;
}

export async function renderCreative(
  ebookId: string,
  creative: CreativeInput,
  baseImagePath: string,
  brandName: string
): Promise<string> {
  const dims = DIMENSIONS[creative.tipo] || DIMENSIONS.post;
  const imageDataUri = imageToDataUri(baseImagePath);
  const html = buildHtml(creative, imageDataUri, brandName);

  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    const safeId = creative.id.replace(/[\\/:*?"<>|]/g, "-");
    const outPath = path.join(exportsDir, `${ebookId}-${safeId}.png`);
    await page.screenshot({ path: outPath as `${string}.png`, type: "png" });
    return outPath;
  } finally {
    await browser.close();
  }
}
