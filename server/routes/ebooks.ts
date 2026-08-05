import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { db, type EbookRow, type ChapterRow } from "../lib/db";
import { ensureGenerationRunning } from "../lib/generationJob";
import { startAudiobookGeneration } from "../lib/tts";
import { VISUAL_TEMPLATES } from "../templates/index";

export const ebooksRouter = Router();

const TEMPLATE_IDS = new Set(VISUAL_TEMPLATES.map((t) => t.id));
const TONES = new Set(["Motivador", "Técnico e direto", "Descontraído", "Formal"]);

ebooksRouter.get("/templates", (_req, res) => {
  res.json(VISUAL_TEMPLATES);
});

ebooksRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, theme, status, page_count, chapters_done, chapters_total, template, audio_status, created_at
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
  const template = String(body.template ?? "editorial");
  const pageCount = Number(body.page_count);
  const authorName = String(body.author_name ?? "").trim();
  const authorBio = String(body.author_bio ?? "").trim();
  const includeCopyright = !!body.include_copyright && authorName.length > 0;
  const includeAbout = !!body.include_about && authorName.length > 0;
  const titleMode = body.title_mode === "manual" ? "manual" : "ai";
  const customTitle = String(body.custom_title ?? "").trim();
  const customSubtitle = String(body.custom_subtitle ?? "").trim();
  const generateCover = !!body.generate_cover;
  const coverSuggestion = String(body.cover_suggestion ?? "").trim().slice(0, 500);
  const coverSource = body.cover_source === "stock" ? "stock" : "ai";
  const coverStockUrl = String(body.cover_stock_url ?? "").trim();
  const coverCredit = String(body.cover_credit ?? "").trim().slice(0, 200);
  const coverAltText = String(body.cover_alt_text ?? "").trim().slice(0, 300);
  const generateImages = !!body.generate_images;
  const imageCount = generateImages ? Number(body.image_count) : 0;
  const imageSuggestion = String(body.image_suggestion ?? "").trim().slice(0, 500);
  const imageSource = body.image_source === "stock" ? "stock" : "ai";

  if (!theme || !audience) {
    res.status(400).json({ error: "Tema e público-alvo são obrigatórios." });
    return;
  }
  if (!Number.isFinite(pageCount) || pageCount < 10 || pageCount > 50) {
    res.status(400).json({ error: "Número de páginas deve estar entre 10 e 50." });
    return;
  }
  if (!TEMPLATE_IDS.has(template)) {
    res.status(400).json({ error: "Template visual inválido." });
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

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count,
       author_name, author_bio, include_copyright, include_about, title_mode,
       generate_cover, cover_suggestion, cover_source, cover_stock_url, cover_credit, cover_alt_text,
       generate_images, image_count, image_suggestion, image_source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')`
  ).run(
    id,
    titleMode === "manual" ? customTitle : "",
    titleMode === "manual" ? customSubtitle : "",
    theme,
    audience,
    tone,
    language,
    template,
    pageCount,
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
    generateImages ? 1 : 0,
    generateImages ? imageCount : 0,
    generateImages ? imageSuggestion : "",
    imageSource
  );

  ensureGenerationRunning(id);
  res.status(201).json({ id });
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

function loadEbookOr404(id: string, res: import("express").Response): EbookRow | null {
  const row = db.prepare("SELECT * FROM ebooks WHERE id = ?").get(id) as EbookRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Ebook não encontrado." });
    return null;
  }
  return row;
}

ebooksRouter.get("/:id", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status === "generating") ensureGenerationRunning(row.id);
  const chapters = db
    .prepare("SELECT id, idx, title, summary, content FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(row.id) as ChapterRow[];
  res.json({ ...row, chapters });
});

ebooksRouter.delete("/:id", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  for (const p of [row.pdf_path, row.docx_path, row.audio_path]) {
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
  res.sendFile(row.cover_path);
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

ebooksRouter.post("/:id/audiobook", (req, res) => {
  const row = loadEbookOr404(req.params.id, res);
  if (!row) return;
  if (row.status !== "ready") {
    res.status(409).json({ error: "Aguarde o ebook terminar de ser gerado antes de criar o audiobook." });
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
