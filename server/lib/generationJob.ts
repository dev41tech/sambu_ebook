import { randomUUID } from "node:crypto";
import { db, type EbookRow } from "./db";
import {
  generateOutline,
  generateIntro,
  generateChapter,
  generateConclusion,
  generateAboutAuthor,
  humanizeText,
  type EbookContext,
  type Outline,
} from "./ai";
import { renderEbookPdf } from "./pdf";
import { renderEbookDocx } from "./docx";
import { generateCoverImage, generateChapterImage } from "./images";
import { searchPhotos, downloadPhoto } from "./pexels";

const activeJobs = new Set<string>();

function getEbook(id: string): EbookRow | undefined {
  return db.prepare("SELECT * FROM ebooks WHERE id = ?").get(id) as EbookRow | undefined;
}

function setStep(id: string, step: string) {
  db.prepare("UPDATE ebooks SET current_step = ? WHERE id = ?").run(step, id);
}

function ctxFromRow(row: EbookRow): EbookContext {
  return {
    theme: row.theme,
    audience: row.audience,
    tone: row.tone,
    language: row.language,
    pageCount: row.page_count,
    titleMode: row.title_mode as "ai" | "manual",
  };
}

async function runJob(ebookId: string) {
  try {
    let row = getEbook(ebookId);
    if (!row || row.status === "ready") return;

    const ctx = ctxFromRow(row);

    // Etapa 1: outline
    let outline: Outline;
    if (!row.outline_json) {
      setStep(ebookId, "outline");
      outline = await generateOutline({
        ...ctx,
        customTitle: row.title_mode === "manual" ? row.title : null,
        customSubtitle: row.title_mode === "manual" ? row.subtitle : null,
      });
      const insertChapter = db.prepare(
        "INSERT INTO chapters (id, ebook_id, idx, title, summary, content) VALUES (?, ?, ?, ?, ?, '')"
      );
      const tx = db.transaction(() => {
        db.prepare(
          "UPDATE ebooks SET title = ?, subtitle = ?, outline_json = ?, chapters_total = ? WHERE id = ?"
        ).run(outline.title, outline.subtitle, JSON.stringify(outline), outline.chapters.length, ebookId);
        outline.chapters.forEach((c, i) => {
          insertChapter.run(randomUUID(), ebookId, i, c.title, c.summary);
        });
      });
      tx();
      row = getEbook(ebookId)!;
    } else {
      outline = JSON.parse(row.outline_json);
    }

    // Etapa 2: capa (opcional)
    if (row.generate_cover && !row.cover_path) {
      setStep(ebookId, "cover");
      if (row.cover_source === "stock" && row.cover_stock_url) {
        const cover = await downloadPhoto(row.cover_stock_url, "", row.cover_alt_text || outline.title, `${ebookId}-cover`);
        db.prepare("UPDATE ebooks SET cover_path = ?, cover_credit = ? WHERE id = ?").run(
          cover.path,
          row.cover_credit,
          ebookId
        );
      } else {
        const cover = await generateCoverImage(ebookId, outline.title, row.theme, row.audience, row.cover_suggestion);
        db.prepare("UPDATE ebooks SET cover_path = ?, cover_alt_text = ? WHERE id = ?").run(
          cover.path,
          cover.altText,
          ebookId
        );
      }
      row = getEbook(ebookId)!;
    }

    // Etapa 3: introdução
    if (!row.intro) {
      setStep(ebookId, "intro");
      const draft = await generateIntro(ctx, outline);
      const intro = await humanizeText(draft, `Introdução do ebook "${outline.title}"`, 1500);
      db.prepare("UPDATE ebooks SET intro = ? WHERE id = ?").run(intro, ebookId);
      row = getEbook(ebookId)!;
    }

    // Etapa 4: capítulos, um de cada vez
    const chapters = db
      .prepare("SELECT * FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
      .all(ebookId) as { id: string; idx: number; title: string; summary: string; content: string }[];

    for (const chapter of chapters) {
      if (chapter.content && chapter.content.trim().length > 0) continue;
      setStep(ebookId, "chapter");
      const previousTitles = chapters.filter((c) => c.idx < chapter.idx).map((c) => c.title);
      const draft = await generateChapter(ctx, outline, chapter.idx, previousTitles);
      const content = await humanizeText(draft, `Capítulo "${chapter.title}" do ebook "${outline.title}"`, 4000);
      db.prepare("UPDATE chapters SET content = ? WHERE id = ?").run(content, chapter.id);
      db.prepare("UPDATE ebooks SET chapters_done = chapters_done + 1 WHERE id = ?").run(ebookId);
    }

    row = getEbook(ebookId)!;

    // Etapa 4b: imagens internas (opcional), distribuídas entre os capítulos em sequência
    if (row.generate_images && chapters.length > 0 && row.images_done < row.image_count) {
      setStep(ebookId, "images");
      for (let i = row.images_done; i < row.image_count; i++) {
        const chapter = chapters[i % chapters.length];
        let path: string;
        let altText: string;
        let credit = "";
        if (row.image_source === "stock") {
          const searchQuery = row.image_suggestion.trim() || `${chapter.title} ${row.theme}`;
          const results = await searchPhotos(searchQuery, "landscape", 1);
          const photo = results[0];
          if (!photo) {
            throw new Error(`Nenhuma foto encontrada no Pexels para "${searchQuery}".`);
          }
          const saved = await downloadPhoto(photo.downloadUrl, photo.photographer, photo.alt, `${chapter.id}-${i}`);
          path = saved.path;
          altText = saved.altText;
          credit = saved.credit;
        } else {
          const image = await generateChapterImage(
            ebookId,
            `${chapter.id}-${i}`,
            i,
            chapter.title,
            chapter.summary || chapter.title,
            row.audience,
            row.image_suggestion,
            row.cover_suggestion
          );
          path = image.path;
          altText = image.altText;
        }
        db.prepare(
          "INSERT INTO chapter_images (id, ebook_id, chapter_id, path, alt_text, credit) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(randomUUID(), ebookId, chapter.id, path, altText, credit);
        db.prepare("UPDATE ebooks SET images_done = images_done + 1 WHERE id = ?").run(ebookId);
      }
      row = getEbook(ebookId)!;
    }

    // Etapa 5: conclusão
    if (!row.conclusion) {
      setStep(ebookId, "conclusion");
      const draft = await generateConclusion(ctx, outline);
      const conclusion = await humanizeText(draft, `Conclusão do ebook "${outline.title}"`, 1200);
      db.prepare("UPDATE ebooks SET conclusion = ? WHERE id = ?").run(conclusion, ebookId);
      row = getEbook(ebookId)!;
    }

    // Etapa 5b: sobre o autor (opcional)
    if (row.include_about && row.author_name && !row.about_author) {
      setStep(ebookId, "about");
      const about = await generateAboutAuthor(row.author_name, row.author_bio, row.language);
      db.prepare("UPDATE ebooks SET about_author = ? WHERE id = ?").run(about, ebookId);
      row = getEbook(ebookId)!;
    }

    // Etapa 6: exportação PDF + DOCX
    setStep(ebookId, "export");
    row = getEbook(ebookId)!;
    const finalChapters = db
      .prepare("SELECT * FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
      .all(ebookId) as { id: string; title: string; content: string }[];

    const pdfPath = await renderEbookPdf(row, finalChapters);
    const docxPath = await renderEbookDocx(row, finalChapters);

    db.prepare(
      "UPDATE ebooks SET status = 'ready', current_step = NULL, pdf_path = ?, docx_path = ? WHERE id = ?"
    ).run(pdfPath, docxPath, ebookId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado durante a geração.";
    db.prepare("UPDATE ebooks SET status = 'error', error_message = ? WHERE id = ?").run(message, ebookId);
  } finally {
    activeJobs.delete(ebookId);
  }
}

export function ensureGenerationRunning(ebookId: string) {
  if (activeJobs.has(ebookId)) return;
  const row = getEbook(ebookId);
  if (!row || row.status === "ready") return;
  activeJobs.add(ebookId);
  void runJob(ebookId);
}
