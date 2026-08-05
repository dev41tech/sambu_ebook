import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { db, type EbookRow } from "./db";
import { getTemplate } from "../templates/index";
import { escapeHtml, escapeAttr, renderMarkdownToHtml } from "./markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
fs.mkdirSync(exportsDir, { recursive: true });

function findChrome(): string {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Não encontrei o Google Chrome instalado. Defina CHROME_PATH no .env apontando para o chrome.exe."
  );
}

function imageToDataUri(filePath: string): string | null {
  try {
    const buffer = fs.readFileSync(filePath);
    const mime = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function chapterImages(chapterId: string): { uri: string; alt: string; credit: string }[] {
  const rows = db
    .prepare("SELECT path, alt_text, credit FROM chapter_images WHERE chapter_id = ? ORDER BY created_at ASC")
    .all(chapterId) as { path: string; alt_text: string; credit: string }[];
  return rows
    .map((r) => ({ uri: imageToDataUri(r.path), alt: r.alt_text, credit: r.credit }))
    .filter((r): r is { uri: string; alt: string; credit: string } => !!r.uri);
}

// Só usamos decorações ancoradas no TOPO da página (top: Xmm). Uma página de capítulo
// pode crescer além de uma página física quando tem várias imagens + texto longo, e o
// Chrome imprime esse excesso em páginas de continuação — qualquer decoração ancorada na
// base (bottom: Xmm) cai então no meio do conteúdo dessa continuação, cortando o texto.
function decorationHtml(decoration: string): string {
  switch (decoration) {
    case "thin_border":
      return `<div class="deco deco-border"></div>`;
    case "left_bar":
      return `<div class="deco deco-left"></div>`;
    case "top_bar":
      return `<div class="deco deco-top"></div>`;
    case "rules":
      return `<div class="deco deco-rule-top"></div>`;
    case "corner_block":
      return `<div class="deco deco-corner"></div>`;
    case "bottom_bar":
      return `<div class="deco deco-bottom"></div>`;
    case "brackets":
      return `<div class="deco deco-bracket deco-bracket-tl"></div><div class="deco deco-bracket deco-bracket-tr"></div>`;
    case "double_rule":
      return `<div class="deco deco-drule-top"></div>`;
    default:
      return "";
  }
}

function buildHtml(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): string {
  const t = getTemplate(ebook.template);
  const year = new Date().getFullYear();

  const coverImageUri = ebook.cover_path ? imageToDataUri(ebook.cover_path) : null;

  const coverPage = coverImageUri
    ? `
    <section class="page cover cover-photo" role="img" aria-label="${escapeAttr(ebook.cover_alt_text || ebook.title)}" style="background-image:url('${coverImageUri}');background-size:cover;background-position:center;">
      <div class="cover-panel">
        <p class="eyebrow eyebrow-light">${escapeHtml(ebook.theme)}</p>
        <div class="cover-rule"></div>
        <h1 class="cover-title cover-title-light">${escapeHtml(ebook.title)}</h1>
        ${ebook.subtitle ? `<p class="cover-subtitle cover-subtitle-light">${escapeHtml(ebook.subtitle)}</p>` : ""}
        ${ebook.author_name ? `<p class="cover-author cover-author-light">${escapeHtml(ebook.author_name)}</p>` : ""}
      </div>
    </section>`
    : `
    <section class="page cover">
      ${decorationHtml(t.decoration)}
      <div class="cover-inner">
        <p class="eyebrow">${escapeHtml(ebook.theme)}</p>
        <h1 class="cover-title">${escapeHtml(ebook.title)}</h1>
        ${ebook.subtitle ? `<p class="cover-subtitle">${escapeHtml(ebook.subtitle)}</p>` : ""}
        ${ebook.author_name ? `<p class="cover-author">${escapeHtml(ebook.author_name)}</p>` : ""}
      </div>
    </section>`;

  const copyrightPage =
    ebook.include_copyright && ebook.author_name
      ? `<section class="page">
          <div class="body-text copyright">
            <p>© ${year} ${escapeHtml(ebook.author_name)}. Todos os direitos reservados.</p>
            <p>Este ebook foi gerado com apoio de inteligência artificial.</p>
          </div>
        </section>`
      : "";

  const introPage = ebook.intro
    ? `<section class="page">
        <h2 class="section-title">Introdução</h2>
        <div class="body-text">${renderMarkdownToHtml(ebook.intro)}</div>
      </section>`
    : "";

  const imageCredits: string[] = [];
  if (ebook.cover_credit) imageCredits.push(`Capa: ${escapeHtml(ebook.cover_credit)}.`);

  const chapterPages = chapters
    .map((c, i) => {
      const images = chapterImages(c.id);
      const imagesHtml = images
        .map((img) => {
          if (img.credit) imageCredits.push(`Capítulo ${i + 1} — ${escapeHtml(c.title)}: ${escapeHtml(img.credit)}.`);
          return `<div class="chapter-image-wrap"><img class="chapter-image" src="${img.uri}" alt="${escapeAttr(img.alt)}" /></div>`;
        })
        .join("\n");
      return `
      <section class="page chapter">
        ${decorationHtml(t.decoration)}
        <p class="chapter-eyebrow">Capítulo ${i + 1}</p>
        <h2 class="chapter-title">${escapeHtml(c.title)}</h2>
        ${imagesHtml}
        <div class="body-text">${renderMarkdownToHtml(c.content)}</div>
      </section>`;
    })
    .join("\n");

  const creditsPage =
    imageCredits.length > 0
      ? `<section class="page">
          <h2 class="section-title">Créditos de Imagem</h2>
          <div class="body-text">${imageCredits.map((c) => `<p>${c}</p>`).join("\n")}</div>
        </section>`
      : "";

  const conclusionPage = ebook.conclusion
    ? `<section class="page">
        <h2 class="section-title">Conclusão</h2>
        <div class="body-text">${renderMarkdownToHtml(ebook.conclusion)}</div>
      </section>`
    : "";

  const aboutPage = ebook.about_author
    ? `<section class="page">
        <h2 class="section-title">Sobre o Autor</h2>
        <div class="body-text">${renderMarkdownToHtml(ebook.about_author)}</div>
      </section>`
    : "";

  return `<!doctype html>
<html lang="${escapeAttr(ebook.language)}">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A5; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${t.bodyFont}; color: ${t.text}; }
  .page {
    position: relative;
    width: 148mm; height: 210mm;
    padding: 18mm 16mm;
    background: ${t.pageBg};
    page-break-after: always;
    overflow: hidden;
  }
  .deco-border { position: absolute; inset: 6mm; border: 1px solid ${t.accent}; pointer-events: none; }
  .deco-left { position: absolute; top: 0; bottom: 0; left: 0; width: 5mm; background: ${t.accent}; }
  .deco-top { position: absolute; top: 0; left: 0; right: 0; height: 4mm; background: ${t.accent}; }
  .deco-rule-top { position: absolute; top: 12mm; left: 16mm; right: 16mm; height: 0.5mm; background: ${t.accent}; }
  .deco-corner { position: absolute; top: 0; left: 0; height: 6mm; width: 40mm; background: ${t.accent}; }
  .deco-bottom { position: absolute; top: 0; left: 0; right: 0; height: 1.5mm; background: ${t.accent}; }
  .deco-bracket { position: absolute; top: 8mm; width: 10mm; height: 10mm; }
  .deco-bracket-tl { left: 8mm; border-top: 0.6mm solid ${t.accent}; border-left: 0.6mm solid ${t.accent}; }
  .deco-bracket-tr { right: 8mm; border-top: 0.6mm solid ${t.accent}; border-right: 0.6mm solid ${t.accent}; }
  .deco-drule-top { position: absolute; top: 10mm; left: 16mm; right: 16mm; height: 1.6mm; border-top: 0.4mm solid ${t.accent}; border-bottom: 0.4mm solid ${t.accent}; }

  .cover { display: flex; align-items: center; justify-content: center; text-align: center; padding: 18mm 16mm; }
  .cover-inner { position: relative; z-index: 1; }

  .cover-photo { padding: 0; display: block; }
  .cover-panel {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 14mm 14mm 16mm;
    text-align: left;
    background: linear-gradient(to top, rgba(10,10,10,0.86) 0%, rgba(10,10,10,0.86) 62%, rgba(10,10,10,0) 100%);
  }
  .cover-rule { width: 14mm; height: 0.6mm; background: ${t.accent}; margin: 3mm 0 4mm; }
  .eyebrow-light { color: ${t.accent}; }
  .cover-title-light { color: #ffffff; }
  .cover-subtitle-light { color: rgba(255,255,255,0.86); }
  .cover-author-light { color: rgba(255,255,255,0.7); }

  .chapter-image-wrap {
    margin: 0 0 5mm; padding: 2mm; background: ${t.pageBg};
    border: 1px solid ${t.accent}30; border-radius: 1.5mm;
    box-shadow: 0 1mm 3mm rgba(0,0,0,0.08);
  }
  .chapter-image {
    display: block; width: 100%; max-height: 62mm; object-fit: cover;
    border-radius: 1mm;
  }
  .eyebrow, .chapter-eyebrow {
    text-transform: uppercase; letter-spacing: 0.16em; font-size: 9pt;
    color: ${t.accent}; font-family: ${t.headingFont};
  }
  .cover-title {
    font-family: ${t.headingFont}; color: ${t.heading};
    font-size: ${28 * t.headingScale}pt; margin: 6mm 0 4mm;
    text-transform: ${t.uppercaseHeadings ? "uppercase" : "none"};
    line-height: 1.15;
  }
  .cover-subtitle { font-size: 13pt; color: ${t.text}; margin: 0 0 8mm; }
  .cover-author { font-size: 11pt; color: ${t.accent}; margin-top: 10mm; }
  .cover-panel .cover-title { margin-top: 0; font-size: ${32 * t.headingScale}pt; }
  .cover-panel .cover-subtitle { margin-bottom: 5mm; }
  .cover-panel .cover-author { margin-top: 5mm; font-size: 10pt; letter-spacing: 0.04em; }

  .section-title, .chapter-title {
    font-family: ${t.headingFont}; color: ${t.heading};
    font-size: ${18 * t.headingScale}pt; margin: 2mm 0 8mm;
    text-transform: ${t.uppercaseHeadings ? "uppercase" : "none"};
  }
  .body-text { font-size: 10.5pt; line-height: 1.65; text-align: justify; }
  .body-text p { margin: 0; text-indent: 6mm; orphans: 2; widows: 2; }
  .body-text p:first-child,
  .body-text h3 + p, .body-text h4 + p,
  .body-text ul + p, .body-text ol + p { text-indent: 0; }
  .body-text p + p { margin-top: 0.8mm; }
  .body-text strong { font-weight: 700; }
  .body-text em { font-style: italic; }
  .body-text h3 {
    font-family: ${t.headingFont}; color: ${t.heading};
    font-size: ${13 * t.headingScale}pt; margin: 6mm 0 3mm; line-height: 1.3;
    text-transform: ${t.uppercaseHeadings ? "uppercase" : "none"};
  }
  .body-text h4 {
    font-family: ${t.headingFont}; color: ${t.accent};
    font-size: ${11 * t.headingScale}pt; margin: 5mm 0 2mm; font-style: italic;
  }
  .body-text ul, .body-text ol { margin: 1mm 0 4mm; padding-left: 6mm; text-align: left; }
  .body-text li { margin: 0 0 1.5mm; padding-left: 1mm; }
  .copyright { font-size: 9pt; color: ${t.text}; opacity: 0.8; margin-top: 60mm; text-align: left; }
  .copyright p { text-indent: 0; }
</style>
</head>
<body>
  ${coverPage}
  ${copyrightPage}
  ${introPage}
  ${chapterPages}
  ${conclusionPage}
  ${aboutPage}
  ${creditsPage}
</body>
</html>`;
}

export async function renderEbookPdf(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<string> {
  const html = buildHtml(ebook, chapters);
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });
    const outPath = path.join(exportsDir, `${ebook.id}.pdf`);
    await page.pdf({ path: outPath, printBackground: true, preferCSSPageSize: true, timeout: 120000 });
    return outPath;
  } finally {
    await browser.close();
  }
}
