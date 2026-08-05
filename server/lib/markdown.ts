// Parser leve de markdown gerado pela IA (títulos #/##/###, **negrito**, *itálico*, listas)
// para uma árvore de blocos neutra, reaproveitada pelo PDF, DOCX e EPUB — evita que
// marcações markdown "vazem" como texto literal (##, **) no ebook final.

export type InlineSegment = { text: string; bold: boolean; italic: boolean };

export type Block =
  | { type: "heading"; level: 1 | 2; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] };

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Para uso dentro de atributos HTML (alt="...", aria-label="...") — escapeHtml sozinho
// não escapa aspas, o que quebra o atributo se o texto contiver `"` (comum em alt-text
// gerado por IA, que costuma citar o título entre aspas).
export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

// Quebra uma linha de texto em segmentos com negrito/itálico marcados,
// sem HTML-escapar (fica a cargo de quem consome, conforme o formato de saída).
export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    }
    if (match[1] !== undefined) {
      segments.push({ text: match[1], bold: true, italic: false });
    } else {
      segments.push({ text: (match[2] ?? match[3])!, bold: false, italic: true });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }
  return segments.length > 0 ? segments : [{ text, bold: false, italic: false }];
}

function blockFromLines(lines: string[]): Block {
  const isUnordered = lines.every((l) => /^[-*]\s+/.test(l));
  const isOrdered = lines.every((l) => /^\d+[.)]\s+/.test(l));
  if (isUnordered || isOrdered) {
    return {
      type: "list",
      ordered: isOrdered,
      items: lines.map((l) => l.replace(/^([-*]|\d+[.)])\s+/, "")),
    };
  }
  return { type: "paragraph", lines };
}

export function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const rawBlocks = raw
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const rawBlock of rawBlocks) {
    let lines = rawBlock
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Um bloco pode conter um título markdown seguido, sem linha em branco,
    // do parágrafo/lista que vem a seguir — separa o título do restante.
    while (lines.length > 0) {
      const headingMatch = lines[0].match(/^(#{1,6})\s+(.*)$/);
      if (!headingMatch) break;
      blocks.push({ type: "heading", level: headingMatch[1].length <= 2 ? 1 : 2, text: headingMatch[2].trim() });
      lines = lines.slice(1);
    }
    if (lines.length > 0) {
      blocks.push(blockFromLines(lines));
    }
  }

  return blocks;
}

function inlineToHtml(text: string): string {
  return parseInlineSegments(text)
    .map((seg) => {
      let html = escapeHtml(seg.text);
      if (seg.bold) html = `<strong>${html}</strong>`;
      if (seg.italic) html = `<em>${html}</em>`;
      return html;
    })
    .join("");
}

export function renderMarkdownToHtml(raw: string): string {
  return parseBlocks(raw)
    .map((block) => {
      if (block.type === "heading") {
        const tag = block.level === 1 ? "h3" : "h4";
        return `<${tag}>${inlineToHtml(block.text)}</${tag}>`;
      }
      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("");
        return `<${tag}>${items}</${tag}>`;
      }
      return `<p>${block.lines.map(inlineToHtml).join("<br/>")}</p>`;
    })
    .join("\n");
}
