import type { EbookDetail } from "./api";

export interface KindlePage {
  type: "cover" | "section";
  sectionLabel?: string;
  sectionTitle?: string;
  isFirstPageOfSection?: boolean;
  paragraphs?: string[];
}

const WORDS_PER_PAGE = 180;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildKindlePages(ebook: EbookDetail): KindlePage[] {
  const sections: { label: string; title: string; text: string }[] = [];
  if (ebook.intro) sections.push({ label: "Introdução", title: "Introdução", text: ebook.intro });
  ebook.chapters.forEach((c, i) => {
    sections.push({ label: `Capítulo ${i + 1}`, title: c.title, text: c.content });
  });
  if (ebook.conclusion) sections.push({ label: "Conclusão", title: "Conclusão", text: ebook.conclusion });
  if (ebook.about_author) sections.push({ label: "Sobre o Autor", title: "Sobre o Autor", text: ebook.about_author });

  const pages: KindlePage[] = [];
  if (ebook.cover_path) pages.push({ type: "cover" });

  for (const section of sections) {
    const paragraphs = splitParagraphs(section.text);
    let current: string[] = [];
    let currentWords = 0;
    let pagesInSection = 0;

    const flush = () => {
      pages.push({
        type: "section",
        sectionLabel: section.label,
        sectionTitle: section.title,
        isFirstPageOfSection: pagesInSection === 0,
        paragraphs: current,
      });
      pagesInSection += 1;
      current = [];
      currentWords = 0;
    };

    for (const paragraph of paragraphs) {
      const pWords = wordCount(paragraph);
      if (currentWords > 0 && currentWords + pWords > WORDS_PER_PAGE) {
        flush();
      }
      current.push(paragraph);
      currentWords += pWords;
    }
    if (current.length > 0) flush();
    if (pagesInSection === 0) {
      pages.push({ type: "section", sectionLabel: section.label, sectionTitle: section.title, isFirstPageOfSection: true, paragraphs: [] });
    }
  }

  if (pages.length === 0) {
    pages.push({ type: "section", sectionLabel: "", sectionTitle: ebook.title, isFirstPageOfSection: true, paragraphs: [] });
  }

  return pages;
}
