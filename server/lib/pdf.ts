import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { db, type EbookRow } from "./db";
import { BOOK_TEMPLATE } from "../templates/index";
import { escapeHtml, escapeAttr, renderMarkdownToHtml } from "./markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
fs.mkdirSync(exportsDir, { recursive: true });
const previewsDir = path.resolve(__dirname, "..", "..", "data", "previews");
fs.mkdirSync(previewsDir, { recursive: true });

export function findChrome(): string {
  const candidates = [
    // CHROME_PATH primeiro: em container (Docker/EasyPanel) é a única pista correta.
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Não encontrei o Chrome/Chromium. Defina CHROME_PATH apontando para o executável " +
      "(ex.: /usr/bin/chromium no container, chrome.exe no Windows)."
  );
}

// Sem --no-sandbox o Chromium recusa subir rodando como root, que é o caso do container
// (o Dockerfile não define USER). --disable-dev-shm-usage evita o crash causado pelo
// /dev/shm de 64MB padrão do Docker em documentos grandes.
export const CHROME_LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

// Ebooks técnicos usam um layout mais sóbrio (sem selo decorativo, sem capitular) —
// mais perto de um livro informativo/acadêmico. Os demais usam o layout literário.
function isPlainInformative(ebook: EbookRow): boolean {
  return ebook.category === "tecnico";
}

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(num: number): string {
  let n = num;
  let result = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
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

export function buildHtml(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): string {
  const t = BOOK_TEMPLATE;
  const year = new Date().getFullYear();
  const isProfessional = isPlainInformative(ebook);

  const coverImageUri = ebook.cover_path ? imageToDataUri(ebook.cover_path) : null;
  // Capa importada pelo usuário (upload próprio) já é um design pronto — o app não deve
  // sobrepor título/subtítulo por cima, senão duplica/atropela o que a pessoa já criou.
  // Só compomos texto por cima de capas geradas por IA ou de banco de imagens (fotos
  // "cruas", pensadas desde o início para receber esse texto por cima).
  const isImportedCover = ebook.cover_source === "local";

  const coverPage = coverImageUri
    ? isImportedCover
      ? `
    <section class="page cover cover-photo" role="img" aria-label="${escapeAttr(ebook.cover_alt_text || ebook.title)}" style="background-image:url('${coverImageUri}');background-size:cover;background-position:center;">
    </section>`
      : `
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
      const heading = isProfessional
        ? `<h2 class="chapter-title chapter-title-plain">${i + 1}. ${escapeHtml(c.title)}</h2>`
        : `<div class="chapter-badge"><span>${toRoman(i + 1)}</span></div>
        <h2 class="chapter-title">${escapeHtml(c.title)}</h2>`;
      return `
      <section class="page chapter">
        ${isProfessional ? "" : decorationHtml(t.decoration)}
        ${heading}
        ${imagesHtml}
        <div class="body-text${isProfessional ? "" : " drop-cap"}">${renderMarkdownToHtml(c.content)}</div>
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
  /* background aqui garante que a folha inteira tenha a cor de fundo do livro mesmo
     quando uma seção termina antes do fim da página física (senão sobra branco). */
  @page { size: A5; margin: 0; background: ${t.pageBg}; }
  * { box-sizing: border-box; }
  /* Fundo de página como base do documento inteiro — quando a última página física de
     uma seção termina antes do fim da folha, essa cor "vaza" por trás em vez de deixar
     um vazio branco (a seção .page não estica pra preencher a página inteira sozinha). */
  body { margin: 0; font-family: ${t.bodyFont}; color: ${t.text}; background: ${t.pageBg}; }
  .page {
    position: relative;
    width: 148mm; min-height: 210mm;
    padding: 18mm 16mm;
    background: ${t.pageBg};
    page-break-after: always;
    overflow: visible;
    /* "clone" garante que CADA página física de uma seção que transborda (não só a
       primeira/última) receba o padding completo — sem isso, o Chrome tira o padding
       inferior das páginas intermediárias e o texto flui até a borda da folha, por cima
       do rodapé. */
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
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
  .cover-inner { position: relative; z-index: 1; max-width: 100%; }

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
    break-inside: avoid;
  }
  .chapter-image {
    display: block; width: 100%; max-height: 62mm; object-fit: cover;
    border-radius: 1mm;
  }
  .eyebrow, .chapter-eyebrow {
    text-transform: uppercase; letter-spacing: 0.16em; font-size: 9pt;
    color: ${t.accent}; font-family: ${t.headingFont};
  }
  .chapter-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17mm; height: 10mm; margin: 0 0 4mm;
    border: 0.4mm solid ${t.accent}; border-radius: 50%;
  }
  .chapter-badge span {
    font-family: ${t.headingFont}; font-weight: 700; font-size: 11pt;
    letter-spacing: 0.05em; color: ${t.accent};
  }
  .chapter-title-plain {
    margin-top: 8mm; line-height: 1.3;
    overflow-wrap: break-word; word-break: break-word;
  }
  .drop-cap > p:first-child::first-letter {
    font-family: ${t.headingFont}; font-weight: 700; color: ${t.heading};
    float: left; font-size: 3.4em; line-height: 0.82;
    padding: 1mm 2mm 0 0;
  }
  .cover-title {
    font-family: ${t.headingFont}; color: ${t.heading};
    font-size: ${28 * t.headingScale}pt; margin: 6mm 0 4mm;
    text-transform: ${t.uppercaseHeadings ? "uppercase" : "none"};
    line-height: 1.15;
    overflow-wrap: break-word; word-break: break-word; hyphens: auto;
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
    overflow-wrap: break-word; word-break: break-word;
  }
  .body-text { font-size: 10.5pt; line-height: 1.65; text-align: justify; }
  .body-text p { margin: 0; text-indent: 6mm; orphans: 3; widows: 3; }
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
    break-after: avoid; break-inside: avoid;
  }
  .body-text h4 {
    font-family: ${t.headingFont}; color: ${t.accent};
    font-size: ${11 * t.headingScale}pt; margin: 5mm 0 2mm; font-style: italic;
    break-after: avoid; break-inside: avoid;
  }
  .body-text ul, .body-text ol { margin: 1mm 0 4mm; padding-left: 6mm; text-align: left; }
  .body-text li { margin: 0 0 1.5mm; padding-left: 1mm; break-inside: avoid; }
  .chapter-title, .chapter-eyebrow { break-after: avoid; }
  .copyright { font-size: 9pt; color: ${t.text}; opacity: 0.8; margin-top: 60mm; text-align: left; }
  .copyright p { text-indent: 0; }
  /* position:fixed se repete em TODA página impressa no motor de impressão do Chrome
     (diferente de absolute, que fica preso à página onde o elemento nasceu) — é assim
     que garantimos a cor de fundo do livro em cada folha física, mesmo quando uma seção
     termina antes do fim da página e não haveria mais nenhum elemento ali embaixo. */
  .page-bg-fill { position: fixed; inset: 0; background: ${t.pageBg}; z-index: -1; }
</style>
</head>
<body>
  <div class="page-bg-fill"></div>
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

async function renderPdfFile(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[],
  detectClipping: boolean
): Promise<{ path: string; clippingIssues: number }> {
  const html = buildHtml(ebook, chapters);
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: CHROME_LAUNCH_ARGS,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });
    let clippingIssues = 0;
    if (detectClipping) {
      clippingIssues = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("*"));
        return all.filter((el) => {
          const s = getComputedStyle(el);
          const clips = s.overflowY === "hidden" || s.overflowY === "clip";
          return clips && el.scrollHeight > el.clientHeight + 2;
        }).length;
      });
    }
    const t = BOOK_TEMPLATE;
    const isProfessional = isPlainInformative(ebook);
    // Livros de perfil profissional/técnico seguem convenção de não ficção: número de
    // página discreto no topo. Os demais mantêm rodapé com título + número entre colchetes.
    const headerTemplate = isProfessional
      ? `<div style="width:100%; text-align:right; padding:0 16mm; box-sizing:border-box; font-family:${t.bodyFont}; font-size:8pt; color:${t.text}; opacity:0.6;"><span class="pageNumber"></span></div>`
      : "<span></span>";
    const footerTemplate = isProfessional
      ? "<span></span>"
      : `<div style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:0 16mm; box-sizing:border-box; font-family:${t.bodyFont}; font-size:8pt; color:${t.text}; opacity:0.7;">
      <span>${escapeHtml(ebook.title)}</span>
      <span>[&nbsp;<span class="pageNumber"></span>&nbsp;]</span>
    </div>`;
    const outPath = path.join(exportsDir, `${ebook.id}.pdf`);
    await page.pdf({
      path: outPath,
      // Largura/altura explícitas (A5) em vez de preferCSSPageSize: quando
      // preferCSSPageSize é true, o Chrome usa a margem do `@page` (0, porque o `.page`
      // já cobre a folha inteira e cria sua própria margem visual via padding) para
      // decidir onde o TEXTO quebra de página, mas ainda reserva o espaço da margem
      // abaixo (JS) só para desenhar o rodapé por cima — o texto flui até o fim da folha
      // sem saber que ali embaixo tem um rodapé, e os dois ficam sobrepostos. Passando
      // width/height/margin direto (sem preferCSSPageSize), a MESMA margem vale tanto
      // para onde o texto quebra quanto para onde o rodapé é desenhado — sem conflito.
      width: "148mm",
      height: "210mm",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: isProfessional
        ? { top: "10mm", bottom: "0mm", left: "0mm", right: "0mm" }
        : { top: "0mm", bottom: "12mm", left: "0mm", right: "0mm" },
      timeout: 120000,
    });
    return { path: outPath, clippingIssues };
  } finally {
    await browser.close();
  }
}

export async function renderEbookPdf(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<string> {
  const { path: outPath } = await renderPdfFile(ebook, chapters, false);
  return outPath;
}

export interface PdfValidation {
  textCoverage: number;
  clippingIssues: number;
  sourceWordCount: number;
  pdfWordCount: number;
}

function normalizeForComparison(text: string): string {
  return text
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function wordCount(text: string): number {
  const normalized = normalizeForComparison(text);
  return normalized ? normalized.split(" ").filter(Boolean).length : 0;
}

function canonicalText(ebook: EbookRow, chapters: { content: string }[]): string {
  const parts = [ebook.intro, ...chapters.map((c) => c.content), ebook.conclusion, ebook.about_author].filter(
    (p): p is string => !!p
  );
  return parts.join("\n\n");
}

export async function renderEbookPdfValidated(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<{ path: string; pageCount: number; validation: PdfValidation }> {
  const { path: outPath, clippingIssues } = await renderPdfFile(ebook, chapters, true);

  const { PDFParse } = await import("pdf-parse");
  const buffer = fs.readFileSync(outPath);
  const parser = new PDFParse({ data: buffer });
  let pdfText = "";
  let pageCount = 0;
  try {
    const result = await parser.getText();
    pdfText = result.text || "";
    pageCount = result.total ?? result.pages?.length ?? 0;
  } finally {
    await parser.destroy();
  }

  const source = canonicalText(ebook, chapters);
  const sourceWordCount = wordCount(source);
  const pdfWordCount = wordCount(pdfText);
  const textCoverage = sourceWordCount > 0 ? Math.min(1, pdfWordCount / sourceWordCount) : 1;

  return {
    path: outPath,
    pageCount,
    validation: { textCoverage, clippingIssues, sourceWordCount, pdfWordCount },
  };
}

export interface LayoutPreview {
  pageCount: number;
  clippingIssues: number;
  overflowIssues: number;
}

function previewDirFor(ebookId: string): string {
  return path.join(previewsDir, ebookId);
}

export function layoutPreviewPagePath(ebookId: string, index: number): string {
  return path.join(previewDirFor(ebookId), `page-${index}.png`);
}

// Gera um PNG por seção do livro (capa, introdução, cada capítulo, conclusão...) direto
// do HTML renderizado, para o usuário conferir a diagramação visualmente antes de
// exportar — sem precisar exportar o PDF final pra descobrir que algo ficou ruim.
// Um capítulo ficar mais alto que 210mm é NORMAL (o texto flui pra uma página extra,
// de propósito — ver o comentário em `.page` no CSS acima), então isso não é sinalizado
// como problema. Os dois problemas reais que detectamos são: texto cortado por
// overflow:hidden (clippingIssues) e elemento vazando pra fora da largura fixa da
// página (overflowIssues) — o mesmo padrão do bug do título com nome de arquivo cru
// que quebrava a diagramação da capa.
export async function renderPageThumbnails(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<LayoutPreview> {
  const dir = previewDirFor(ebook.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const html = buildHtml(ebook, chapters);
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: CHROME_LAUNCH_ARGS });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 700, height: 1000 });
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });

    const clippingIssues = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      return all.filter((el) => {
        const s = getComputedStyle(el);
        const clips = s.overflowY === "hidden" || s.overflowY === "clip";
        return clips && el.scrollHeight > el.clientHeight + 2;
      }).length;
    });

    const overflowIssues = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll(".page"));
      return pages.filter((p) => p.scrollWidth > p.clientWidth + 2).length;
    });

    const sections = await page.$$(".page");
    for (let i = 0; i < sections.length; i++) {
      await sections[i].screenshot({ path: layoutPreviewPagePath(ebook.id, i) as `${string}.png` });
    }
    return { pageCount: sections.length, clippingIssues, overflowIssues };
  } finally {
    await browser.close();
  }
}
