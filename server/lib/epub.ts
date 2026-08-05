import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { db, type EbookRow } from "./db";
import { getTemplate } from "../templates/index";
import { escapeHtml, escapeAttr, renderMarkdownToHtml } from "./markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
fs.mkdirSync(exportsDir, { recursive: true });

function imageExt(filePath: string): "jpg" | "png" {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg" : "png";
}

function imageMime(ext: string): string {
  return ext === "jpg" ? "image/jpeg" : "image/png";
}

function languageCode(language: string): string {
  const l = language.toLowerCase();
  if (l.includes("portugal")) return "pt-PT";
  if (l.includes("português") || l.includes("portugues")) return "pt-BR";
  if (l.includes("inglês") || l.includes("ingles")) return "en";
  if (l.includes("espanhol")) return "es";
  return "pt-BR";
}

interface ManifestImage {
  id: string;
  href: string;
  mime: string;
  data: Buffer;
}

function chapterImageRows(chapterId: string): { id: string; path: string; alt_text: string }[] {
  return db
    .prepare("SELECT id, path, alt_text FROM chapter_images WHERE chapter_id = ? ORDER BY created_at ASC")
    .all(chapterId) as { id: string; path: string; alt_text: string }[];
}

function xhtmlPage(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export async function renderEbookEpub(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<string> {
  const t = getTemplate(ebook.template);
  const year = new Date().getFullYear();
  const bookId = `urn:uuid:${randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const images: ManifestImage[] = [];
  let coverImageId: string | null = null;

  if (ebook.cover_path && fs.existsSync(ebook.cover_path)) {
    const ext = imageExt(ebook.cover_path);
    coverImageId = "cover-image";
    images.push({
      id: coverImageId,
      href: `images/cover.${ext}`,
      mime: imageMime(ext),
      data: fs.readFileSync(ebook.cover_path),
    });
  }

  // manifest items (não-imagem) na ordem de leitura
  const spineItems: { id: string; href: string }[] = [];
  const manifestExtra: { id: string; href: string; mime: string }[] = [];
  const navEntries: { href: string; label: string }[] = [];
  const textFiles: { href: string; content: string }[] = [];
  const imageCredits: string[] = [];

  function addTextPage(id: string, href: string, title: string, bodyHtml: string, navLabel?: string) {
    manifestExtra.push({ id, href, mime: "application/xhtml+xml" });
    spineItems.push({ id, href });
    textFiles.push({ href, content: xhtmlPage(title, bodyHtml) });
    if (navLabel) navEntries.push({ href, label: navLabel });
  }

  // Capa
  if (coverImageId) {
    addTextPage(
      "titlepage",
      "text/titlepage.xhtml",
      ebook.title,
      `<div class="titlepage"><img src="../images/cover.${imageExt(ebook.cover_path!)}" alt="${escapeAttr(
        ebook.cover_alt_text || ebook.title
      )}" class="cover-img" /></div>`
    );
  } else {
    addTextPage(
      "titlepage",
      "text/titlepage.xhtml",
      ebook.title,
      `<div class="titlepage-text">
        <p class="eyebrow">${escapeHtml(ebook.theme)}</p>
        <h1>${escapeHtml(ebook.title)}</h1>
        ${ebook.subtitle ? `<p class="subtitle">${escapeHtml(ebook.subtitle)}</p>` : ""}
        ${ebook.author_name ? `<p class="author">${escapeHtml(ebook.author_name)}</p>` : ""}
      </div>`
    );
  }

  // Direitos autorais
  if (ebook.include_copyright && ebook.author_name) {
    addTextPage(
      "copyright",
      "text/copyright.xhtml",
      "Direitos Autorais",
      `<div class="copyright">
        <p>© ${year} ${escapeHtml(ebook.author_name)}. Todos os direitos reservados.</p>
        <p>Este ebook foi gerado com apoio de inteligência artificial.</p>
      </div>`
    );
  }

  // Introdução
  if (ebook.intro) {
    addTextPage(
      "intro",
      "text/intro.xhtml",
      "Introdução",
      `<h2>Introdução</h2>${renderMarkdownToHtml(ebook.intro)}`,
      "Introdução"
    );
  }

  // Capítulos
  chapters.forEach((c, i) => {
    const rows = chapterImageRows(c.id);
    let imagesHtml = "";
    for (const row of rows) {
      if (!fs.existsSync(row.path)) continue;
      const ext = imageExt(row.path);
      const imgId = `img-${row.id}`;
      images.push({ id: imgId, href: `images/${row.id}.${ext}`, mime: imageMime(ext), data: fs.readFileSync(row.path) });
      imagesHtml += `<div class="chapter-image-wrap"><img src="../images/${row.id}.${ext}" alt="${escapeAttr(
        row.alt_text
      )}" class="chapter-image" /></div>`;
      const creditRow = db.prepare("SELECT credit FROM chapter_images WHERE id = ?").get(row.id) as
        | { credit: string }
        | undefined;
      if (creditRow?.credit) imageCredits.push(`Capítulo ${i + 1} — ${c.title}: ${creditRow.credit}.`);
    }
    addTextPage(
      `chapter-${i}`,
      `text/chapter-${i}.xhtml`,
      c.title,
      `<p class="eyebrow">Capítulo ${i + 1}</p><h2>${escapeHtml(c.title)}</h2>${imagesHtml}${renderMarkdownToHtml(
        c.content
      )}`,
      `Capítulo ${i + 1}: ${c.title}`
    );
  });

  // Conclusão
  if (ebook.conclusion) {
    addTextPage(
      "conclusion",
      "text/conclusion.xhtml",
      "Conclusão",
      `<h2>Conclusão</h2>${renderMarkdownToHtml(ebook.conclusion)}`,
      "Conclusão"
    );
  }

  // Sobre o Autor
  if (ebook.about_author) {
    addTextPage(
      "about",
      "text/about.xhtml",
      "Sobre o Autor",
      `<h2>Sobre o Autor</h2>${renderMarkdownToHtml(ebook.about_author)}`,
      "Sobre o Autor"
    );
  }

  if (ebook.cover_credit) imageCredits.unshift(`Capa: ${ebook.cover_credit}.`);
  if (imageCredits.length > 0) {
    addTextPage(
      "credits",
      "text/credits.xhtml",
      "Créditos de Imagem",
      `<h2>Créditos de Imagem</h2>${imageCredits.map((c) => `<p>${escapeHtml(c)}</p>`).join("\n")}`
    );
  }

  const styles = `
@charset "utf-8";
body { font-family: ${t.bodyFont}; color: ${t.text}; background: ${t.pageBg}; margin: 0; padding: 5%; line-height: 1.65; }
h1, h2, h3, h4 { font-family: ${t.headingFont}; color: ${t.heading}; text-transform: ${
    t.uppercaseHeadings ? "uppercase" : "none"
  }; }
h2 { font-size: 1.5em; margin: 0 0 1em; }
h3 { font-size: 1.2em; margin: 1.4em 0 0.4em; }
h4 { font-style: italic; color: ${t.accent}; font-size: 1.05em; margin: 1.2em 0 0.4em; }
p { margin: 0 0 1em; text-align: justify; }
strong { font-weight: 700; }
em { font-style: italic; }
ul, ol { margin: 0 0 1em; padding-left: 1.4em; }
li { margin: 0 0 0.4em; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.15em; color: ${t.accent}; font-size: 0.8em; }
.titlepage { text-align: center; padding: 0; }
.cover-img { max-width: 100%; height: auto; }
.titlepage-text { text-align: center; margin-top: 30%; }
.titlepage-text h1 { font-size: 1.8em; margin: 0.5em 0; }
.subtitle { font-style: italic; }
.author { color: ${t.accent}; margin-top: 2em; }
.chapter-image-wrap { margin: 0 0 1em; text-align: center; }
.chapter-image { max-width: 100%; height: auto; border-radius: 4px; }
.copyright p { font-size: 0.85em; opacity: 0.8; text-align: left; }
`;

  const navListItems = navEntries.map((e) => `<li><a href="${e.href}">${escapeHtml(e.label)}</a></li>`).join("\n");
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">
<head><meta charset="utf-8" /><title>Sumário</title><link rel="stylesheet" type="text/css" href="styles.css" /></head>
<body>
<nav epub:type="toc" id="toc">
<h1>Sumário</h1>
<ol>
${navListItems}
</ol>
</nav>
</body>
</html>`;

  const ncxPoints = navEntries
    .map(
      (e, i) => `<navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeHtml(e.label)}</text></navLabel>
      <content src="${e.href}" />
    </navPoint>`
    )
    .join("\n");
  const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}" />
  </head>
  <docTitle><text>${escapeHtml(ebook.title)}</text></docTitle>
  <navMap>
    ${ncxPoints}
  </navMap>
</ncx>`;

  const manifestItems: { id: string; href: string; mime: string; properties?: string }[] = [
    { id: "nav", href: "nav.xhtml", mime: "application/xhtml+xml", properties: "nav" },
    { id: "ncx", href: "toc.ncx", mime: "application/x-dtbncx+xml" },
    { id: "styles", href: "styles.css", mime: "text/css" },
    ...manifestExtra.map((m) => ({ ...m, properties: undefined as string | undefined })),
    ...images.map((img) => ({
      id: img.id,
      href: img.href,
      mime: img.mime,
      properties: img.id === coverImageId ? "cover-image" : undefined,
    })),
  ];

  const manifestXml = manifestItems
    .map(
      (m) =>
        `<item id="${m.id}" href="${m.href}" media-type="${m.mime}"${
          m.properties ? ` properties="${m.properties}"` : ""
        } />`
    )
    .join("\n    ");

  const spineXml = spineItems.map((s) => `<itemref idref="${s.id}" />`).join("\n    ");

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${bookId}</dc:identifier>
    <dc:title>${escapeHtml(ebook.title)}</dc:title>
    <dc:language>${languageCode(ebook.language)}</dc:language>
    <dc:creator>${escapeHtml(ebook.author_name || "Sambu Ebooks")}</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>
    ${coverImageId ? `<meta name="cover" content="${coverImageId}" />` : ""}
  </metadata>
  <manifest>
    ${manifestXml}
  </manifest>
  <spine toc="ncx">
    ${spineXml}
  </spine>
</package>`;

  const containerXml = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")!.file("container.xml", containerXml);
  const oebps = zip.folder("OEBPS")!;
  oebps.file("content.opf", contentOpf);
  oebps.file("nav.xhtml", navXhtml);
  oebps.file("toc.ncx", tocNcx);
  oebps.file("styles.css", styles);
  for (const f of textFiles) oebps.file(f.href, f.content);
  for (const img of images) oebps.file(img.href, img.data);

  const buffer = await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
  const outPath = path.join(exportsDir, `${ebook.id}.epub`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
