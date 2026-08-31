import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
} from "docx";
import { all, type EbookRow } from "./db";
import { BOOK_TEMPLATE } from "../templates/index";
import { parseBlocks, parseInlineSegments } from "./markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
fs.mkdirSync(exportsDir, { recursive: true });

function hex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

function imageType(filePath: string): "jpg" | "png" {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg" : "png";
}

function imageParagraph(filePath: string, width: number, height: number): Paragraph | null {
  try {
    const buffer = fs.readFileSync(filePath);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new ImageRun({
          type: imageType(filePath),
          data: buffer,
          transformation: { width, height },
        }),
      ],
    });
  } catch {
    return null;
  }
}

async function chapterImageParagraphs(chapterId: string): Promise<Paragraph[]> {
  const rows = await all<{ path: string }>(
    "SELECT path FROM chapter_images WHERE chapter_id = $1 ORDER BY created_at ASC",
    [chapterId]
  );
  return rows
    .map((r) => imageParagraph(r.path, 420, 280))
    .filter((p): p is Paragraph => !!p);
}

async function chapterImageCredits(chapterId: string): Promise<string[]> {
  const rows = await all<{ credit: string }>(
    "SELECT credit FROM chapter_images WHERE chapter_id = $1 ORDER BY created_at ASC",
    [chapterId]
  );
  return rows.map((r) => r.credit).filter(Boolean);
}

function segmentsToRuns(text: string, color: string): TextRun[] {
  return parseInlineSegments(text).map(
    (seg) => new TextRun({ text: seg.text, color: hex(color), bold: seg.bold, italics: seg.italic })
  );
}

// Converte markdown (títulos #/##, **negrito**, *itálico*, listas) em parágrafos do
// DOCX, em vez de despejar os marcadores como texto literal.
function bodyParagraphs(raw: string, textColor: string, headingColor: string, accentColor: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const block of parseBlocks(raw)) {
    if (block.type === "heading") {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: block.text,
              bold: true,
              italics: block.level === 2,
              color: hex(block.level === 1 ? headingColor : accentColor),
              size: block.level === 1 ? 24 : 22,
            }),
          ],
        })
      );
    } else if (block.type === "list") {
      block.items.forEach((item, i) => {
        const runs = block.ordered
          ? [new TextRun({ text: `${i + 1}. `, color: hex(textColor) }), ...segmentsToRuns(item, textColor)]
          : segmentsToRuns(item, textColor);
        paragraphs.push(
          new Paragraph({
            spacing: { after: 80 },
            bullet: block.ordered ? undefined : { level: 0 },
            indent: { left: 360 },
            children: runs,
          })
        );
      });
    } else {
      paragraphs.push(
        new Paragraph({
          // Justificado para o corpo do texto, como já acontece no PDF e no EPUB.
          // Títulos e listas mantêm o alinhamento próprio.
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          children: block.lines.flatMap((line, idx) => {
            const runs = segmentsToRuns(line, textColor);
            return idx > 0 ? [new TextRun({ text: "", break: 1 }), ...runs] : runs;
          }),
        })
      );
    }
  }
  return paragraphs;
}

export async function renderEbookDocx(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<string> {
  const t = BOOK_TEMPLATE;
  const year = new Date().getFullYear();
  const accent = hex(t.accent);
  const heading = hex(t.heading);
  const text = hex(t.text);

  const children: Paragraph[] = [];
  const imageCredits: string[] = [];
  if (ebook.cover_credit) imageCredits.push(`Capa: ${ebook.cover_credit}.`);

  if (ebook.cover_path) {
    const cover = imageParagraph(ebook.cover_path, 320, 480);
    if (cover) children.push(cover);
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: accent },
      },
      children: [
        new TextRun({ text: ebook.theme.toUpperCase(), color: accent, size: 18, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: ebook.title, color: heading, bold: true, size: 56 })],
    })
  );

  if (ebook.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: ebook.subtitle, color: text, italics: true, size: 28 })],
      })
    );
  }

  if (ebook.author_name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800 },
        children: [new TextRun({ text: ebook.author_name, color: accent, size: 24 })],
      })
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  if (ebook.include_copyright && ebook.author_name) {
    children.push(
      new Paragraph({
        spacing: { before: 4000 },
        children: [
          new TextRun({
            text: `© ${year} ${ebook.author_name}. Todos os direitos reservados.`,
            color: text,
            size: 18,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Este ebook foi gerado com apoio de inteligência artificial.",
            color: text,
            size: 18,
          }),
        ],
      }),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  if (ebook.intro) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: "Introdução", color: heading, bold: true })],
      }),
      ...bodyParagraphs(ebook.intro, text, heading, accent),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  // for...of no lugar de forEach: o callback do forEach nao espera promise,
  // entao o await das imagens seria silenciosamente ignorado.
  for (const [i, c] of chapters.entries()) {
    for (const credit of await chapterImageCredits(c.id)) {
      imageCredits.push(`Capítulo ${i + 1} — ${c.title}: ${credit}.`);
    }
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `CAPÍTULO ${i + 1}`, color: accent, bold: true, size: 18 }),
        ],
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: c.title, color: heading, bold: true })],
      }),
      ...(await chapterImageParagraphs(c.id)),
      ...bodyParagraphs(c.content, text, heading, accent),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  if (ebook.conclusion) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: "Conclusão", color: heading, bold: true })],
      }),
      ...bodyParagraphs(ebook.conclusion, text, heading, accent)
    );
  }

  if (ebook.about_author) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: "Sobre o Autor", color: heading, bold: true })],
      }),
      ...bodyParagraphs(ebook.about_author, text, heading, accent)
    );
  }

  if (imageCredits.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: "Créditos de Imagem", color: heading, bold: true })],
      }),
      ...imageCredits.map(
        (c) =>
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: c, color: text, size: 18 })],
          })
      )
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(exportsDir, `${ebook.id}.docx`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
