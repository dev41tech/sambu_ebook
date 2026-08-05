// Renderiza blocos de markdown simples gerados pela IA (títulos #/##, **negrito**,
// *itálico*, listas) como elementos reais, em vez de mostrar os marcadores como texto cru.

interface InlineSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseInlineSegments(text: string): InlineSegment[] {
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

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInlineSegments(text).map((seg, i) => {
        let node: React.ReactNode = seg.text;
        if (seg.bold) node = <strong>{node}</strong>;
        if (seg.italic) node = <em>{node}</em>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

export function splitBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export function MarkdownBlock({ block, className }: { block: string; className?: string }) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const headingMatch = lines[0].match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const Tag = level <= 2 ? "h3" : "h4";
    const rest = lines.slice(1).join("\n");
    return (
      <>
        <Tag className={level <= 2 ? "mb-1.5 mt-4 font-semibold" : "mb-1 mt-3 italic"}>
          <Inline text={headingMatch[2].trim()} />
        </Tag>
        {rest && <MarkdownBlock block={rest} className={className} />}
      </>
    );
  }

  const isUnordered = lines.every((l) => /^[-*]\s+/.test(l));
  const isOrdered = lines.every((l) => /^\d+[.)]\s+/.test(l));
  if (isUnordered || isOrdered) {
    const items = lines.map((l) => l.replace(/^([-*]|\d+[.)])\s+/, ""));
    const ListTag = isOrdered ? "ol" : "ul";
    return (
      <ListTag className={isOrdered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
        {items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p className={className}>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <Inline text={line} />
        </span>
      ))}
    </p>
  );
}
