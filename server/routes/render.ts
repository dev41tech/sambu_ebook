// Endpoints usados pelo pipeline v2 (fluxo n8n de 9 agentes) para renderizar PDF/EPUB
// a partir de um manuscrito já pronto, com validação automática de cobertura de texto e
// clipping. Substitui o microsserviço "ebook-renderer" separado descrito na especificação
// original — a mesma lógica de validação vive aqui, dentro do Sambu Ebooks.
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, type EbookRow } from "../lib/db";
import { renderEbookPdfValidated } from "../lib/pdf";
import { renderEbookEpubValidated } from "../lib/epub";

export const renderRouter = Router();

// Não há mais seleção de template visual — todo ebook usa o layout único de livro.
const FIXED_TEMPLATE = "livro";

interface ManuscriptChapter {
  chapter_number: number;
  chapter_type: string;
  title: string;
  content_markdown: string;
}

function upsertManuscript(body: Record<string, unknown>): EbookRow {
  const ebookId = String(body.ebook_id || randomUUID());
  const manuscript = (body.manuscript as Record<string, unknown>) || {};
  const chaptersIn: ManuscriptChapter[] = Array.isArray(manuscript.chapters)
    ? (manuscript.chapters as ManuscriptChapter[])
    : [];

  const intro = chaptersIn.find((c) => c.chapter_type === "introduction");
  const conclusion = chaptersIn.find((c) => c.chapter_type === "conclusion");
  const core = chaptersIn
    .filter((c) => c.chapter_type !== "introduction" && c.chapter_type !== "conclusion")
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));

  const title = String(manuscript.book_title || body.theme || "Ebook sem título");
  const subtitle = String(manuscript.subtitle || "");
  const theme = String(body.theme || title);
  const audience = String(body.audience || "não informado");
  const tone = String(body.tone || "não informado");
  const language = String(body.language || "Português (Brasil)");
  const pageCount = Number(body.page_count) || 20;
  const version = String(body.version || "").trim();

  const exists = db.prepare("SELECT id, version FROM ebooks WHERE id = ?").get(ebookId) as
    | { id: string; version: string }
    | undefined;
  if (exists) {
    // Se o payload não trouxer versão explícita (ex.: re-render sem mudança editorial),
    // mantém a versão já registrada em vez de resetar para o default.
    const nextVersion = version || exists.version;
    db.prepare(
      `UPDATE ebooks SET title=?, subtitle=?, theme=?, audience=?, tone=?, language=?, template=?, page_count=?,
       intro=?, conclusion=?, version=?, status='ready', error_message=NULL WHERE id=?`
    ).run(
      title,
      subtitle,
      theme,
      audience,
      tone,
      language,
      FIXED_TEMPLATE,
      pageCount,
      intro?.content_markdown || null,
      conclusion?.content_markdown || null,
      nextVersion,
      ebookId
    );
    db.prepare("DELETE FROM chapters WHERE ebook_id = ?").run(ebookId);
  } else {
    db.prepare(
      `INSERT INTO ebooks
        (id, title, subtitle, theme, audience, tone, language, template, page_count, title_mode, status, intro, conclusion, category, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'ready', ?, ?, 'geral', ?)`
    ).run(
      ebookId,
      title,
      subtitle,
      theme,
      audience,
      tone,
      language,
      FIXED_TEMPLATE,
      pageCount,
      intro?.content_markdown || null,
      conclusion?.content_markdown || null,
      version || "v1.0"
    );
  }

  const insertChapter = db.prepare(
    "INSERT INTO chapters (id, ebook_id, idx, title, summary, content) VALUES (?, ?, ?, ?, '', ?)"
  );
  core.forEach((c, i) => {
    insertChapter.run(randomUUID(), ebookId, i, c.title, c.content_markdown);
  });
  db.prepare("UPDATE ebooks SET chapters_total = ?, chapters_done = ? WHERE id = ?").run(
    core.length,
    core.length,
    ebookId
  );

  return db.prepare("SELECT * FROM ebooks WHERE id = ?").get(ebookId) as EbookRow;
}

function loadChapters(ebookId: string) {
  return db
    .prepare("SELECT id, title, content FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(ebookId) as { id: string; title: string; content: string }[];
}

renderRouter.post("/pdf", async (req, res) => {
  try {
    const ebook = upsertManuscript(req.body ?? {});
    const chapters = loadChapters(ebook.id);
    const { path: pdfPath, pageCount, validation } = await renderEbookPdfValidated(ebook, chapters);
    db.prepare("UPDATE ebooks SET pdf_path = ? WHERE id = ?").run(pdfPath, ebook.id);

    const ok = validation.textCoverage >= 0.995 && validation.clippingIssues === 0;
    res.status(ok ? 200 : 422).json({
      ok,
      file_url: `/api/ebooks/${ebook.id}/pdf`,
      file_name: `${ebook.id}.pdf`,
      page_count: pageCount,
      validation: {
        text_coverage: validation.textCoverage,
        clipping_issues: validation.clippingIssues,
        missing_chapter_titles: [],
        source_word_count: validation.sourceWordCount,
        pdf_word_count: validation.pdfWordCount,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Falha ao renderizar PDF." });
  }
});

renderRouter.post("/epub", async (req, res) => {
  try {
    const ebook = upsertManuscript(req.body ?? {});
    const chapters = loadChapters(ebook.id);
    const { path: epubPath, validation } = await renderEbookEpubValidated(ebook, chapters);
    db.prepare("UPDATE ebooks SET epub_path = ? WHERE id = ?").run(epubPath, ebook.id);

    res.status(validation.structureOk ? 200 : 422).json({
      ok: validation.structureOk,
      file_url: `/api/ebooks/${ebook.id}/epub`,
      file_name: `${ebook.id}.epub`,
      validation: {
        epubcheck: validation.structureOk ? "PASS" : "FAIL",
        missing_chapters: validation.missingChapters,
        malformed_files: validation.malformedFiles,
        reflowable: true,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Falha ao renderizar EPUB." });
  }
});
