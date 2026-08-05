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
import { db, type EbookRow } from "./db";
import { getTemplate } from "../templates/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.resolve(__dirname, "..", "..", "data", "exports");
fs.mkdirSync(exportsDir, { recursive: true });

function hex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

function imageParagraph(filePath: string, width: number, height: number): Paragraph | null {
  try {
    const buffer = fs.readFileSync(filePath);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new ImageRun({
          type: "png",
          data: buffer,
          transformation: { width, height },
        }),
      ],
    });
  } catch {
    return null;
  }
}

function chapterImageParagraphs(chapterId: string): Paragraph[] {
  const rows = db
    .prepare("SELECT path FROM chapter_images WHERE chapter_id = ? ORDER BY created_at ASC")
    .all(chapterId) as { path: string }[];
  return rows
    .map((r) => imageParagraph(r.path, 420, 280))
    .filter((p): p is Paragraph => !!p);
}

function bodyParagraphs(text: string, color: string): Paragraph[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: p, color: hex(color) })],
        })
    );
}

export async function renderEbookDocx(
  ebook: EbookRow,
  chapters: { id: string; title: string; content: string }[]
): Promise<string> {
  const t = getTemplate(ebook.template);
  const year = new Date().getFullYear();
  const accent = hex(t.accent);
  const heading = hex(t.heading);
  const text = hex(t.text);

  const children: Paragraph[] = [];

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
      ...bodyParagraphs(ebook.intro, text),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  chapters.forEach((c, i) => {
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
      ...chapterImageParagraphs(c.id),
      ...bodyParagraphs(c.content, text),
      new Paragraph({ children: [new PageBreak()] })
    );
  });

  if (ebook.conclusion) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
        children: [new TextRun({ text: "Conclusão", color: heading, bold: true })],
      }),
      ...bodyParagraphs(ebook.conclusion, text)
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
      ...bodyParagraphs(ebook.about_author, text)
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
