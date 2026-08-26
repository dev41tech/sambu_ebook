import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, type EbookRow, type ChapterRow, type ChapterImageRow } from "../lib/db";
import { ensureGenerationRunning, finalizeEbookExport } from "../lib/generationJob";
import { startAudiobookGeneration } from "../lib/tts";
import { generateCoverImage, generateChapterImage, generateMarketingImage } from "../lib/images";
import { downloadPhoto } from "../lib/pexels";
import { useLocalCover } from "../lib/localCovers";
import { renderEbookPdf, renderPageThumbnails, layoutPreviewPagePath } from "../lib/pdf";
import { renderEbookDocx } from "../lib/docx";
import { renderEbookEpub } from "../lib/epub";
import { addLearning } from "../lib/memory";
import { generateMarketingStrategy, type MarketingCreative, type MarketingStrategy } from "../lib/marketing";
import { renderCreative } from "../lib/creatives";
import {
  parseManuscript,
  estimatePageCount,
  extractFullTextFromPdf,
  extractFullTextFromEpub,
  prettifyFilenameTitle,
} from "../lib/importContent";

export const ebooksRouter = Router();

// Não há mais seleção de template visual — todo ebook usa o layout único de livro
// (ver server/templates/index.ts). Esse valor fixo só existe para preencher a coluna
// `template` (NOT NULL) do banco sem precisar de uma migração de schema.
const FIXED_TEMPLATE = "livro";
const TONES = new Set(["Motivador", "Técnico e direto", "Descontraído", "Formal"]);
const CATEGORIES = new Set(["geral", "tecnico", "comportamental"]);

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

ebooksRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, theme, status, page_count, chapters_done, chapters_total, template, audio_status, category, version, created_at
       FROM ebooks ORDER BY created_at DESC`
    )
    .all();
  res.json(rows);
});

ebooksRouter.post("/", (req, res) => {
  const body = req.body ?? {};
  const theme = String(body.theme ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const tone = String(body.tone ?? "Motivador");
  const language = String(body.language ?? "Português (Brasil)").trim();
  const pageCount = Number(body.page_count);
  const wordsPerPage = Number(body.words_per_page ?? 250);
  const authorName = String(body.author_name ?? "").trim();
  const authorBio = String(body.author_bio ?? "").trim();
  const includeCopyright = !!body.include_copyright && authorName.length > 0;
  const includeAbout = !!body.include_about && authorName.length > 0;
  const titleMode = body.title_mode === "manual" ? "manual" : "ai";
  const customTitle = String(body.custom_title ?? "").trim();
  const customSubtitle = String(body.custom_subtitle ?? "").trim();
  const generateCover = !!body.generate_cover;
  const coverSuggestion = String(body.cover_suggestion ?? "").trim().slice(0, 500);
  const coverSource = body.cover_source === "stock" ? "stock" : body.cover_source === "local" ? "local" : "ai";
  const coverStockUrl = String(body.cover_stock_url ?? "").trim();
  const coverCredit = String(body.cover_credit ?? "").trim().slice(0, 200);
  const coverLocalFile = String(body.cover_local_file ?? "").trim();
  const coverAltText = String(body.cover_alt_text ?? "").trim().slice(0, 300);
  const generateImages = !!body.generate_images;
  const imageCount = generateImages ? Number(body.image_count) : 0;
  const imageSuggestion = String(body.image_suggestion ?? "").trim().slice(0, 500);
  const imageSource = body.image_source === "stock" ? "stock" : "ai";
  const category = CATEGORIES.has(body.category) ? body.category : "geral";
  const referenceMaterial = String(body.reference_material ?? "").trim().slice(0, 20000);
  const extraInstructions = String(body.extra_instructions ?? "").trim().slice(0, 5000);

  if (!theme || !audience) {
    res.status(400).json({ error: "Tema e público-alvo são obrigatórios." });
    return;
  }
  if (!Number.isFinite(pageCount) || pageCount < 1 || pageCount > 1000) {
    res.status(400).json({ error: "Número de páginas deve estar entre 1 e 1000." });
    return;
  }
  if (!Number.isFinite(wordsPerPage) || wordsPerPage < 150 || wordsPerPage > 500) {
    res.status(400).json({ error: "Palavras por página deve estar entre 150 e 500." });
    return;
  }
  if (!TONES.has(tone)) {
    res.status(400).json({ error: "Tom de voz inválido." });
    return;
  }
  if (titleMode === "manual" && !customTitle) {
    res.status(400).json({ error: "Informe o título manual ou deixe a IA gerar." });
    return;
  }
  if (generateImages && (!Number.isFinite(imageCount) || imageCount < 1 || imageCount > 39)) {
    res.status(400).json({ error: "Quantidade de imagens internas deve estar entre 1 e 39." });
    return;
  }
  if (generateCover && coverSource === "stock" && !coverStockUrl) {
    res.status(400).json({ error: "Selecione uma foto do banco de imagens para a capa." });
    return;
  }
  if (generateCover && coverSource === "local" && !coverLocalFile) {
    res.status(400).json({ error: "Selecione um arquivo da pasta covers/ para a capa." });
    return;
  }
  if (category !== "geral" && !referenceMaterial) {
    res.status(400).json({ error: "Cole ou envie um material de referência para este tipo de ebook." });
    return;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count, words_per_page,
       author_name, author_bio, include_copyright, include_about, title_mode,
       generate_cover, cover_suggestion, cover_source, cover_stock_url, cover_credit, cover_alt_text,
       cover_local_file,
       generate_images, image_count, image_suggestion, image_source, category, reference_material,
       extra_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')`
  ).run(
    id,
    titleMode === "manual" ? customTitle : "",
    titleMode === "manual" ? customSubtitle : "",
    theme,
    audience,
    tone,
    language,
    FIXED_TEMPLATE,
    pageCount,
    wordsPerPage,
    authorName,
    authorBio,
    includeCopyright ? 1 : 0,
    includeAbout ? 1 : 0,
    titleMode,
    generateCover ? 1 : 0,
    generateCover ? coverSuggestion : "",
    coverSource,
    generateCover && coverSource === "stock" ? coverStockUrl : "",
    generateCover && coverSource === "stock" ? coverCredit : "",
    generateCover && coverSource === "stock" ? coverAltText : "",
    generateCover && coverSource === "local" ? coverLocalFile : "",
    generateImages ? 1 : 0,
    generateImages ? imageCount : 0,
    generateImages ? imageSuggestion : "",
    imageSource,
    category,
    referenceMaterial,
    extraInstructions
  );

  ensureGenerationRunning(id);
  res.status(201).json({ id });
});

const IMPORT_EXTENSIONS = new Set([".txt", ".md", ".pdf", ".epub"]);

ebooksRouter.post("/import", importUpload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Envie um arquivo .txt, .md, .pdf ou .epub com o conteúdo do ebook." });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!IMPORT_EXTENSIONS.has(ext)) {
    res.status(400).json({
      error: "Formato não suportado. Envie um arquivo .txt, .md, .pdf ou .epub (.docx ainda não é suportado).",
    });
    return;
  }

  const body = req.body ?? {};
  const audience = String(body.audience ?? "").trim();
  const language = String(body.language ?? "Português (Brasil)").trim();
  const authorName = String(body.author_name ?? "").trim();
  const authorBio = String(body.author_bio ?? "").trim();
  const includeCopyright = !!body.include_copyright && authorName.length > 0;
  const includeAbout = !!body.include_about && authorName.length > 0;
  const generateCover = !!body.generate_cover;
  const coverSuggestion = String(body.cover_suggestion ?? "").trim().slice(0, 500);
  const coverSource = body.cover_source === "stock" ? "stock" : body.cover_source === "local" ? "local" : "ai";
  const coverStockUrl = String(body.cover_stock_url ?? "").trim();
  const coverCredit = String(body.cover_credit ?? "").trim().slice(0, 200);
  const coverAltText = String(body.cover_alt_text ?? "").trim().slice(0, 300);
  const coverLocalFile = String(body.cover_local_file ?? "").trim();
  const generateImages = !!body.generate_images;
  const imageCount = generateImages ? Number(body.image_count) : 0;
  const imageSuggestion = String(body.image_suggestion ?? "").trim().slice(0, 500);
  const imageSource = body.image_source === "stock" ? "stock" : "ai";

  if (generateCover && coverSource === "stock" && !coverStockUrl) {
    res.status(400).json({ error: "Selecione uma foto do banco de imagens para a capa." });
    return;
  }
  if (generateCover && coverSource === "local" && !coverLocalFile) {
    res.status(400).json({ error: "Selecione um arquivo da pasta covers/ para a capa." });
    return;
  }
  if (generateImages && (!Number.isFinite(imageCount) || imageCount < 1 || imageCount > 39)) {
    res.status(400).json({ error: "Quantidade de imagens internas deve estar entre 1 e 39." });
    return;
  }

  let rawText: string;
  try {
    rawText =
      ext === ".pdf"
        ? await extractFullTextFromPdf(req.file.buffer)
        : ext === ".epub"
          ? await extractFullTextFromEpub(req.file.buffer)
          : req.file.buffer.toString("utf-8");
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Falha ao ler o arquivo enviado." });
    return;
  }
  if (!rawText.trim()) {
    res.status(422).json({ error: "Não foi possível extrair texto do arquivo enviado." });
    return;
  }

  const explicitTitle = String(body.title ?? "").trim();
  const fallbackTitle = explicitTitle || prettifyFilenameTitle(path.basename(req.file.originalname, ext));
  const manuscript = parseManuscript(rawText, fallbackTitle, !!explicitTitle);
  if (manuscript.chapters.length === 0) {
    res.status(422).json({ error: "Não foi possível identificar capítulos no arquivo enviado." });
    return;
  }

  const subtitle = String(body.subtitle ?? "").trim();
  const theme = String(body.theme ?? "").trim() || manuscript.title;
  const outline = {
    title: manuscript.title,
    subtitle,
    chapters: manuscript.chapters.map((c) => ({ title: c.title, summary: c.content.slice(0, 200) })),
  };
  const pageCount = estimatePageCount(manuscript);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count,
       author_name, author_bio, include_copyright, include_about, title_mode,
       outline_json, intro, conclusion, chapters_total, chapters_done,
       generate_cover, cover_suggestion, cover_source, cover_stock_url, cover_credit, cover_alt_text, cover_local_file,
       generate_images, image_count, image_suggestion, image_source, category, reference_material,
       extra_instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')`
  ).run(
    id,
    outline.title,
    outline.subtitle,
    theme,
    audience,
    "Importado",
    language,
    FIXED_TEMPLATE,
    pageCount,
    authorName,
    authorBio,
    includeCopyright ? 1 : 0,
    includeAbout ? 1 : 0,
    "manual",
    JSON.stringify(outline),
    manuscript.intro,
    manuscript.conclusion,
    manuscript.chapters.length,
    manuscript.chapters.length,
    generateCover ? 1 : 0,
    generateCover ? coverSuggestion : "",
    coverSource,
    generateCover && coverSource === "stock" ? coverStockUrl : "",
    generateCover && coverSource === "stock" ? coverCredit : "",
    generateCover && coverSource === "stock" ? coverAltText : "",
    generateCover && coverSource === "local" ? coverLocalFile : "",
    generateImages ? 1 : 0,
    generateImages ? imageCount : 0,
    generateImages ? imageSuggestion : "",
    imageSource,
    "geral",
    "",
    ""
  );

  const insertChapter = db.prepare(
    "INSERT INTO chapters (id, ebook_id, idx, title, summary, content) VALUES (?, ?, ?, ?, ?, ?)"
  );
  manuscript.chapters.forEach((c, i) => {
    insertChapter.run(randomUUID(), id, i, c.title, c.content.slice(0, 200), c.content);
  });

  ensureGenerationRunning(id);
  res.status(201).json({ id });
});

ebooksRouter.post("/:id/feedback", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  const feedback = String(req.body?.feedback ?? "").trim();
  if (!feedback) {
    res.status(400).json({ error: "Escreva uma sugestão antes de enviar." });
    return;
  }
  addLearning(feedback, row.id, row.category);
  res.json({ ok: true });
});

ebooksRouter.post("/:id/retry", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "error") {
    db.prepare("UPDATE ebooks SET status = 'generating', error_message = NULL WHERE id = ?").run(row.id);
  }
  ensureGenerationRunning(row.id);
  res.json({ ok: true });
});

interface ContentChapterUpdate {
  id: string;
  title?: string;
  content?: string;
}

ebooksRouter.put("/:id/content", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Só é possível editar o conteúdo depois que a escrita terminar." });
    return;
  }
  const body = req.body ?? {};

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const field of ["title", "subtitle", "intro", "conclusion", "about_author", "version"] as const) {
    if (typeof body[field] === "string") {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }
  if (updates.length > 0) {
    values.push(row.id);
    db.prepare(`UPDATE ebooks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  if (Array.isArray(body.chapters)) {
    const updateChapter = db.prepare("UPDATE chapters SET title = COALESCE(?, title), content = COALESCE(?, content) WHERE id = ? AND ebook_id = ?");
    for (const c of body.chapters as ContentChapterUpdate[]) {
      if (!c || typeof c.id !== "string") continue;
      updateChapter.run(
        typeof c.title === "string" ? c.title : null,
        typeof c.content === "string" ? c.content : null,
        c.id,
        row.id
      );
    }
  }

  res.json({ ok: true });
});

ebooksRouter.post("/:id/finalize", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "O ebook ainda não terminou de ser escrito." });
    return;
  }
  try {
    await finalizeEbookExport(row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao exportar o ebook." });
  }
});

function loadEbookOr404(id: string, res: import("express").Response): EbookRow | null {
  const row = db.prepare("SELECT * FROM ebooks WHERE id = ?").get(id) as EbookRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Ebook não encontrado." });
    return null;
  }
  return row;
}

async function reRenderExports(ebookId: string) {
  const row = db.prepare("SELECT * FROM ebooks WHERE id = ?").get(ebookId) as EbookRow;
  const chapters = db
    .prepare("SELECT id, title, content FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(ebookId) as { id: string; title: string; content: string }[];
  const pdfPath = await renderEbookPdf(row, chapters);
  const docxPath = await renderEbookDocx(row, chapters);
  const epubPath = await renderEbookEpub(row, chapters);
  db.prepare("UPDATE ebooks SET pdf_path = ?, docx_path = ?, epub_path = ? WHERE id = ?").run(
    pdfPath,
    docxPath,
    epubPath,
    ebookId
  );
}

ebooksRouter.post("/:id/layout-preview", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "O ebook ainda não terminou de ser escrito." });
    return;
  }
  const chapters = db
    .prepare("SELECT id, title, content FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(row.id) as { id: string; title: string; content: string }[];
  try {
    const preview = await renderPageThumbnails(row, chapters);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar a prévia de diagramação." });
  }
});

ebooksRouter.get("/:id/layout-preview/:index", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json({ error: "Índice de página inválido." });
    return;
  }
  const filePath = layoutPreviewPagePath(row.id, index);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Prévia ainda não gerada para esta página." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(filePath);
});

ebooksRouter.get("/:id", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "generating") ensureGenerationRunning(row.id);
  const chapters = db
    .prepare("SELECT id, idx, title, summary, content FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(row.id) as ChapterRow[];
  const chapterImages = db
    .prepare("SELECT id, chapter_id, alt_text, credit FROM chapter_images WHERE ebook_id = ? ORDER BY created_at ASC")
    .all(row.id) as Pick<ChapterImageRow, "id" | "chapter_id" | "alt_text" | "credit">[];
  res.json({ ...row, chapters, chapter_images: chapterImages });
});

ebooksRouter.delete("/:id", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  const chapterImagePaths = (
    db.prepare("SELECT path FROM chapter_images WHERE ebook_id = ?").all(row.id) as { path: string }[]
  ).map((r) => r.path);
  for (const p of [row.pdf_path, row.docx_path, row.epub_path, row.audio_path, row.cover_path, ...chapterImagePaths]) {
    if (p && fs.existsSync(p)) fs.rmSync(p, { force: true });
  }
  db.prepare("DELETE FROM ebooks WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

ebooksRouter.get("/:id/cover", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.cover_path || !fs.existsSync(row.cover_path)) {
    res.status(404).json({ error: "Capa ainda não disponível." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(row.cover_path);
});

ebooksRouter.post("/:id/cover/regenerate", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de trocar a capa." });
    return;
  }
  const body = req.body ?? {};
  const source = body.source === "stock" ? "stock" : body.source === "local" ? "local" : "ai";
  try {
    let coverPath: string;
    let altText: string;
    let credit = "";
    let stockUrl = "";
    let localFile = "";
    if (source === "stock") {
      const stockUrlIn = String(body.stock_url ?? "").trim();
      if (!stockUrlIn) {
        res.status(400).json({ error: "Selecione uma foto do banco de imagens." });
        return;
      }
      stockUrl = stockUrlIn;
      altText = String(body.alt_text ?? "").trim().slice(0, 300) || row.title;
      credit = String(body.credit ?? "").trim().slice(0, 200);
      const saved = await downloadPhoto(stockUrlIn, "", altText, `${row.id}-cover`);
      coverPath = saved.path;
    } else if (source === "local") {
      const filename = String(body.local_file ?? "").trim();
      if (!filename) {
        res.status(400).json({ error: "Selecione um arquivo da pasta covers/." });
        return;
      }
      localFile = filename;
      const cover = useLocalCover(filename, row.title, row.id);
      coverPath = cover.path;
      altText = cover.altText;
    } else {
      const suggestion = String(body.suggestion ?? row.cover_suggestion ?? "").trim().slice(0, 500);
      const image = await generateCoverImage(row.id, row.title, row.theme, row.audience, suggestion);
      coverPath = image.path;
      altText = image.altText;
    }
    if (row.cover_path && row.cover_path !== coverPath && fs.existsSync(row.cover_path)) {
      fs.rmSync(row.cover_path, { force: true });
    }
    db.prepare(
      "UPDATE ebooks SET cover_path = ?, cover_alt_text = ?, cover_source = ?, cover_stock_url = ?, cover_credit = ?, cover_local_file = ? WHERE id = ?"
    ).run(coverPath, altText, source, stockUrl, credit, localFile, row.id);
    await reRenderExports(row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar nova capa." });
  }
});

ebooksRouter.get("/:id/chapter-image/:imageId", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  const img = db
    .prepare("SELECT * FROM chapter_images WHERE id = ? AND ebook_id = ?")
    .get(req.params.imageId, row.id) as ChapterImageRow | undefined;
  if (!img || !fs.existsSync(img.path)) {
    res.status(404).json({ error: "Imagem não encontrada." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(img.path);
});

ebooksRouter.post("/:id/images/:imageId/regenerate", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "review" && row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de trocar imagens." });
    return;
  }
  const img = db
    .prepare("SELECT * FROM chapter_images WHERE id = ? AND ebook_id = ?")
    .get(req.params.imageId, row.id) as ChapterImageRow | undefined;
  if (!img) {
    res.status(404).json({ error: "Imagem não encontrada." });
    return;
  }
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(img.chapter_id) as ChapterRow | undefined;
  if (!chapter) {
    res.status(404).json({ error: "Capítulo não encontrado." });
    return;
  }
  const body = req.body ?? {};
  const source = body.source === "stock" ? "stock" : "ai";
  try {
    let newPath: string;
    let altText: string;
    let credit = "";
    if (source === "stock") {
      const stockUrlIn = String(body.stock_url ?? "").trim();
      if (!stockUrlIn) {
        res.status(400).json({ error: "Selecione uma foto do banco de imagens." });
        return;
      }
      altText = String(body.alt_text ?? "").trim().slice(0, 300) || chapter.title;
      credit = String(body.credit ?? "").trim().slice(0, 200);
      const saved = await downloadPhoto(stockUrlIn, "", altText, img.id);
      newPath = saved.path;
    } else {
      const suggestion = String(body.suggestion ?? row.image_suggestion ?? "").trim().slice(0, 500);
      const image = await generateChapterImage(
        row.id,
        img.id,
        chapter.idx,
        chapter.title,
        chapter.summary || chapter.title,
        row.audience,
        suggestion,
        row.cover_suggestion
      );
      newPath = image.path;
      altText = image.altText;
    }
    if (img.path !== newPath && fs.existsSync(img.path)) {
      fs.rmSync(img.path, { force: true });
    }
    db.prepare("UPDATE chapter_images SET path = ?, alt_text = ?, credit = ? WHERE id = ?").run(
      newPath,
      altText,
      credit,
      img.id
    );
    await reRenderExports(row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar nova imagem." });
  }
});

ebooksRouter.get("/:id/pdf", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.pdf_path || !fs.existsSync(row.pdf_path)) {
    res.status(409).json({ error: "PDF ainda não está pronto." });
    return;
  }
  res.download(row.pdf_path, `${row.title || "ebook"}.pdf`);
});

ebooksRouter.get("/:id/docx", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.docx_path || !fs.existsSync(row.docx_path)) {
    res.status(409).json({ error: "DOCX ainda não está pronto." });
    return;
  }
  res.download(row.docx_path, `${row.title || "ebook"}.docx`);
});

ebooksRouter.get("/:id/epub", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.epub_path || !fs.existsSync(row.epub_path)) {
    res.status(409).json({ error: "EPUB ainda não está pronto." });
    return;
  }
  res.download(row.epub_path, `${row.title || "ebook"}.epub`);
});

ebooksRouter.post("/:id/audiobook", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de criar o audiobook." });
    return;
  }
  if (row.audio_status === "generating") {
    res.status(409).json({ error: "O audiobook já está sendo gerado." });
    return;
  }
  if (row.audio_status === "ready") {
    res.status(409).json({ error: "Este ebook já tem um audiobook pronto." });
    return;
  }
  startAudiobookGeneration(row.id);
  res.json({ ok: true });
});

ebooksRouter.get("/:id/audiobook", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.audio_path || !fs.existsSync(row.audio_path)) {
    res.status(409).json({ error: "Audiobook ainda não está pronto." });
    return;
  }
  res.download(row.audio_path, `${row.title || "ebook"}.mp3`);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creativesDir = path.resolve(__dirname, "..", "..", "data", "exports", "criativos");

function creativeFilePath(ebookId: string, creativeId: string): string {
  const safeId = creativeId.replace(/[\\/:*?"<>|]/g, "-");
  return path.join(creativesDir, `${ebookId}-${safeId}.png`);
}

ebooksRouter.get("/:id/marketing/strategy", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.marketing_json) {
    res.status(404).json({ error: "Estratégia de marketing ainda não gerada." });
    return;
  }
  res.json(JSON.parse(row.marketing_json) as MarketingStrategy);
});

ebooksRouter.post("/:id/marketing/strategy", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de criar a estratégia de marketing." });
    return;
  }
  try {
    const chapters = db
      .prepare("SELECT title, summary FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
      .all(row.id) as Pick<ChapterRow, "title" | "summary">[];
    const strategy = await generateMarketingStrategy(row, chapters);
    db.prepare("UPDATE ebooks SET marketing_json = ? WHERE id = ?").run(JSON.stringify(strategy), row.id);
    res.json(strategy);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao gerar estratégia de marketing." });
  }
});

ebooksRouter.post("/:id/marketing/render", async (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (!row.marketing_json) {
    res.status(409).json({ error: "Gere a estratégia de marketing antes de renderizar um criativo." });
    return;
  }
  const creativeId = String(req.body?.creative_id ?? "").trim();
  if (!creativeId) {
    res.status(400).json({ error: "Informe o creative_id." });
    return;
  }
  const strategy = JSON.parse(row.marketing_json) as MarketingStrategy;
  const creative = strategy.criativos.find((c: MarketingCreative) => c.id === creativeId);
  if (!creative) {
    res.status(404).json({ error: "Criativo não encontrado na estratégia." });
    return;
  }
  try {
    const baseImage = await generateMarketingImage(
      row.id,
      creative.id,
      creative.tipo,
      creative.descricao_visual,
      row.theme,
      row.audience
    );
    await renderCreative(
      row.id,
      { id: creative.id, tipo: creative.tipo, headline: creative.headline, subheadline: creative.subheadline, cta: creative.cta },
      baseImage.path,
      row.author_name || row.title
    );
    fs.rmSync(baseImage.path, { force: true });
    res.json({ ok: true, creative_id: creative.id, url: `/api/ebooks/${row.id}/marketing/creative/${encodeURIComponent(creative.id)}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao renderizar criativo." });
  }
});

ebooksRouter.get("/:id/marketing/creative/:creativeId", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  const filePath = creativeFilePath(row.id, req.params.creativeId);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Criativo ainda não renderizado." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(filePath);
});
