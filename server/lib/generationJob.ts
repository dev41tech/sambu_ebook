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
import { renderEbookEpub } from "./epub";
import { generateCoverImage, generateChapterImage } from "./images";
import { searchPhotos, downloadPhoto } from "./pexels";
import { useLocalCover } from "./localCovers";
import { getKnowledgeContext } from "./knowledge";
import { hasWebSearch, searchWeb, formatResearch } from "./webSearch";
import { getRecentLearnings } from "./memory";

// Limite de jobs de geração rodando ao mesmo tempo — evita que disparar vários ebooks de
// uma vez (ex.: em lote via n8n) estoure rate limit da OpenAI ou gere custo de imagem
// simultâneo sem controle. O excedente fica na fila e começa assim que uma vaga libera.
const MAX_CONCURRENT_JOBS = 2;
const activeJobs = new Set<string>();
const queuedJobs: string[] = [];

function getEbook(id: string): EbookRow | undefined {
  return db.prepare("SELECT * FROM ebooks WHERE id = ?").get(id) as EbookRow | undefined;
}

function setStep(id: string, step: string) {
  db.prepare("UPDATE ebooks SET current_step = ? WHERE id = ?").run(step, id);
}

async function ctxFromRow(row: EbookRow): Promise<EbookContext> {
  const knowledgeContext = await getKnowledgeContext();
  const learnings = getRecentLearnings(12).map((l) => l.content);
  return {
    theme: row.theme,
    audience: row.audience,
    tone: row.tone,
    language: row.language,
    pageCount: row.page_count,
    wordsPerPage: row.words_per_page,
    titleMode: row.title_mode as "ai" | "manual",
    referenceMaterial: row.reference_material || null,
    extraInstructions: row.extra_instructions || null,
    webResearch: row.web_research || null,
    knowledgeContext: knowledgeContext || null,
    learnings,
  };
}

async function runJob(ebookId: string) {
  try {
    let row = getEbook(ebookId);
    if (!row || row.status === "review" || row.status === "ready") return;

    // Etapa 0: pesquisa na internet (opcional — só roda se TAVILY_API_KEY estiver
    // configurada, e uma única vez por ebook, reaproveitado em todos os capítulos).
    // Ebooks importados de arquivo já chegam com outline_json preenchido e não precisam
    // de pesquisa, já que não passam pela escrita por IA.
    if (hasWebSearch() && !row.web_research && !row.outline_json) {
      setStep(ebookId, "research");
      try {
        const results = await searchWeb(`${row.theme} ${row.audience}`.trim());
        const formatted = formatResearch(results);
        if (formatted) {
          db.prepare("UPDATE ebooks SET web_research = ? WHERE id = ?").run(formatted, ebookId);
          row = getEbook(ebookId)!;
        }
      } catch (err) {
        // Pesquisa é um complemento opcional — não deve travar a geração do ebook.
        console.warn(`[sambu-ebooks] pesquisa na internet falhou para ${ebookId}:`, err);
      }
    }

    const ctx = await ctxFromRow(row);

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
      } else if (row.cover_source === "local" && row.cover_local_file) {
        const cover = useLocalCover(row.cover_local_file, outline.title, ebookId);
        db.prepare("UPDATE ebooks SET cover_path = ?, cover_alt_text = ? WHERE id = ?").run(
          cover.path,
          cover.altText,
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

    // Etapa 3: introdução (intro === '' significa "conteúdo importado sem introdução
    // separada" — só regeramos por IA quando o campo ainda é NULL, nunca escrito).
    if (row.intro === null) {
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
      const usedPhotoIds = new Set<number>();
      for (let i = row.images_done; i < row.image_count; i++) {
        const chapter = chapters[i % chapters.length];
        let path: string;
        let altText: string;
        let credit = "";
        if (row.image_source === "stock") {
          const searchQuery = row.image_suggestion.trim() || row.theme;
          const results = await searchPhotos(searchQuery, "landscape", 8);
          if (results.length === 0) {
            throw new Error(`Nenhuma foto encontrada no Pexels para "${searchQuery}".`);
          }
          // O 1º colocado do Pexels às vezes vem sem nenhuma relação com a busca (ex.:
          // "marmitas saudáveis" retornou um atleta de cadeira de rodas em 1º, mas comida
          // de verdade do 2º ao 5º lugar). Preferimos o restante do top-8 e só usamos o 1º
          // se não sobrar outro candidato ainda não usado no livro.
          const pool = results.length > 1 ? results.slice(1) : results;
          const photo = pool.find((r) => !usedPhotoIds.has(r.id)) ?? pool[0];
          usedPhotoIds.add(photo.id);
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

    // Etapa 5: conclusão (mesma lógica da introdução — ver comentário na etapa 3)
    if (row.conclusion === null) {
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

    // Etapa 6: conteúdo pronto — para aqui para revisão, sem exportar ainda.
    // A exportação final (PDF/DOCX/EPUB) só roda quando o usuário confirma pela
    // tela de revisão (ver finalizeEbookExport, chamado por POST /:id/finalize).
    db.prepare("UPDATE ebooks SET status = 'review', current_step = NULL WHERE id = ?").run(ebookId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado durante a geração.";
    db.prepare("UPDATE ebooks SET status = 'error', error_message = ? WHERE id = ?").run(message, ebookId);
  } finally {
    activeJobs.delete(ebookId);
    startNextQueuedJob();
  }
}

function startNextQueuedJob() {
  while (activeJobs.size < MAX_CONCURRENT_JOBS && queuedJobs.length > 0) {
    const nextId = queuedJobs.shift()!;
    if (activeJobs.has(nextId)) continue;
    const row = getEbook(nextId);
    if (!row || row.status === "review" || row.status === "ready") continue;
    activeJobs.add(nextId);
    void runJob(nextId);
  }
}

export function ensureGenerationRunning(ebookId: string) {
  if (activeJobs.has(ebookId) || queuedJobs.includes(ebookId)) return;
  const row = getEbook(ebookId);
  if (!row || row.status === "review" || row.status === "ready") return;
  queuedJobs.push(ebookId);
  startNextQueuedJob();
}

export async function finalizeEbookExport(ebookId: string): Promise<void> {
  const row = getEbook(ebookId);
  if (!row) throw new Error("Ebook não encontrado.");
  const chapters = db
    .prepare("SELECT * FROM chapters WHERE ebook_id = ? ORDER BY idx ASC")
    .all(ebookId) as { id: string; title: string; content: string }[];

  const pdfPath = await renderEbookPdf(row, chapters);
  const docxPath = await renderEbookDocx(row, chapters);
  const epubPath = await renderEbookEpub(row, chapters);

  db.prepare(
    "UPDATE ebooks SET status = 'ready', current_step = NULL, pdf_path = ?, docx_path = ?, epub_path = ? WHERE id = ?"
  ).run(pdfPath, docxPath, epubPath, ebookId);
}
