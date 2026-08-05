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

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ebooks
      (id, title, subtitle, theme, audience, tone, language, template, page_count,
       author_name, author_bio, include_copyright, include_about, title_mode, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating')`
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
    titleMode
  );

  ensureGenerationRunning(id);
  res.status(201).json({ id });
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
