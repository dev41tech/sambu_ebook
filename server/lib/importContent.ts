// Interpreta um manuscrito (.txt, .md ou texto extraído de .pdf) enviado pelo usuário e
// separa em introdução / capítulos / conclusão, para pular a escrita por IA e ir direto
// para a etapa de revisão (ver server/routes/ebooks.ts, rota POST /ebooks/import).

export interface ParsedChapter {
  title: string;
  content: string;
}

export interface ParsedManuscript {
  title: string;
  intro: string;
  chapters: ParsedChapter[];
  conclusion: string;
}

// Transforma um nome de arquivo em algo apresentável como título de capa
// ("estrutura_voltar_a_amar_depois_dos_40" -> "Estrutura Voltar A Amar Depois Dos 40"),
// usado apenas quando o usuário não escreveu um título e o texto não tem um título
// óbvio na primeira linha. Ainda é só um fallback — o ideal é o usuário informar o
// título manualmente na tela de importação.
export function prettifyFilenameTitle(filename: string): string {
  const words = filename
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return filename;
  return words.map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

// Reconhece cabeçalhos markdown (# ou ##) e marcadores de texto puro como
// "Capítulo 3", "Capítulo 3 — O início", "Chapter 3: The start".
const CHAPTER_LINE_RE = /^(?:#{1,2}\s+(.+)|cap[íi]tulo\s+\d+\s*[:.\-–]?\s*(.*)|chapter\s+\d+\s*[:.\-–]?\s*(.*))$/i;

const INTRO_WORDS = ["introdução", "introducao", "introduction", "prefácio", "prefacio", "preface", "apresentação", "apresentacao"];
const CONCLUSION_WORDS = [
  "conclusão",
  "conclusao",
  "conclusion",
  "considerações finais",
  "consideracoes finais",
  "epílogo",
  "epilogo",
  "palavras finais",
];
// Linha isolada e curta que é só um desses rótulos (sem numeração) também conta como
// cabeçalho de seção — comum em .txt sem marcação nenhuma, como "Introdução" sozinha
// numa linha, com o parágrafo só começando na linha seguinte.
const LABELED_SECTION_WORDS = [...INTRO_WORDS, ...CONCLUSION_WORDS, "sobre o autor", "about the author"];

// Retorna o texto do cabeçalho se a linha for reconhecida como início de uma nova seção,
// ou null se for apenas texto normal.
function matchHeading(rawLine: string): string | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;
  const chapterMatch = trimmed.match(CHAPTER_LINE_RE);
  if (chapterMatch) {
    return (chapterMatch[1] || chapterMatch[2] || chapterMatch[3] || "").trim() || trimmed;
  }
  const bareLabel = trimmed.toLowerCase().replace(/[:.]+$/, "");
  if (trimmed.length <= 40 && LABELED_SECTION_WORDS.includes(bareLabel)) {
    return trimmed;
  }
  return null;
}

interface RawSection {
  heading: string | null;
  body: string;
}

function splitSections(text: string): RawSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: RawSection[] = [];
  let current: RawSection = { heading: null, body: "" };
  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading !== null) {
      if (current.heading !== null || current.body.trim()) sections.push(current);
      current = { heading, body: "" };
    } else {
      current.body += line + "\n";
    }
  }
  if (current.heading !== null || current.body.trim()) sections.push(current);
  return sections;
}

export function parseManuscript(
  rawText: string,
  fallbackTitle: string,
  titleIsExplicit = false
): ParsedManuscript {
  const sections = splitSections(rawText);
  const hasHeadings = sections.some((s) => s.heading !== null);

  if (!hasHeadings) {
    // Nenhum cabeçalho reconhecido: o texto entra inteiro, num bloco só, para o
    // usuário dividir na revisão. Não inventamos um "Capítulo 1" que não existe
    // no arquivo — o título abaixo deixa explícito que a divisão está pendente.
    const body = rawText.trim();
    return {
      title: fallbackTitle,
      intro: "",
      chapters: body
        ? [{ title: "Texto importado (dividir na revisão)", content: body }]
        : [],
      conclusion: "",
    };
  }

  let title = fallbackTitle;
  let intro = "";
  let conclusion = "";
  const chapters: ParsedChapter[] = [];

  for (const section of sections) {
    const body = section.body.trim();
    if (section.heading === null) {
      // Texto antes do primeiro cabeçalho — geralmente é só o título do livro. Só usamos
      // essa detecção automática se o usuário não informou um título explicitamente —
      // um título digitado à mão nunca deve ser sobrescrito pelo conteúdo do arquivo.
      if (body && !titleIsExplicit) {
        const firstLine = body.split("\n")[0].trim();
        if (firstLine.length > 0 && firstLine.length <= 120 && body.length <= 300) {
          title = firstLine;
        }
      }
      continue;
    }
    if (!body) continue;
    const headingLower = section.heading.toLowerCase();
    if (chapters.length === 0 && INTRO_WORDS.some((w) => headingLower.includes(w))) {
      intro = intro ? `${intro}\n\n${body}` : body;
    } else if (CONCLUSION_WORDS.some((w) => headingLower.includes(w))) {
      conclusion = conclusion ? `${conclusion}\n\n${body}` : body;
    } else {
      chapters.push({ title: section.heading, content: body });
    }
  }

  return { title, intro, chapters, conclusion };
}

// Extração dedicada para importação de manuscrito completo — diferente de
// extractTextFromPdf() em reference.ts, que corta em 20.000 caracteres (adequado para
// "material de referência" de contexto, mas pequeno demais para o texto de um livro
// inteiro). Aqui usamos um teto bem mais alto, só para evitar um upload absurdo travar o servidor.
const MAX_IMPORT_CHARS = 400_000;

function extractAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

// Converte o <body> de uma página XHTML do EPUB em texto simples, promovendo os
// cabeçalhos (h1/h2/h3) para o formato "# Título" reconhecido por parseManuscript() —
// sem isso, cada capítulo do EPUB viraria um bloco de texto sem separação nenhuma.
function htmlBodyToHeadedText(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const withoutScripts = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withHeadings = withoutScripts.replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, (_m, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    return `\n# ${text}\n`;
  });
  const withBreaks = withHeadings
    .replace(/<\/(p|div|li|h[4-6]|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const textOnly = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = textOnly
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function extractFullTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result.text || "").trim();
    if (!text) {
      throw new Error("Não encontrei texto legível nesse PDF (pode ser um PDF escaneado/imagem).");
    }
    return text.slice(0, MAX_IMPORT_CHARS);
  } finally {
    await parser.destroy();
  }
}

export function estimatePageCount(manuscript: ParsedManuscript): number {
  const allText = [manuscript.intro, manuscript.conclusion, ...manuscript.chapters.map((c) => c.content)].join(" ");
  const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / 250));
}

// Extrai os capitulos de um EPUB respeitando a divisao do proprio arquivo: cada
// documento do spine (a ordem de leitura declarada no .opf) vira um capitulo.
// E mais fiel do que procurar cabecalho no texto corrido -- um capitulo sem <h1>
// deixaria de ser detectado e grudaria no anterior.
export async function extractEpubManuscript(
  buffer: Buffer,
  fallbackTitle: string,
  titleIsExplicit = false
): Promise<ParsedManuscript> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Arquivo EPUB inválido: não encontrei META-INF/container.xml.");
  }
  const opfPath = extractAttr(await containerFile.async("string"), "full-path");
  if (!opfPath) {
    throw new Error("Arquivo EPUB inválido: não encontrei o arquivo .opf.");
  }
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error("Arquivo EPUB inválido: arquivo .opf referenciado não existe.");
  }
  const opfXml = await opfFile.async("string");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const tagMatch of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const id = extractAttr(tagMatch[0], "id");
    const href = extractAttr(tagMatch[0], "href");
    const mediaType = extractAttr(tagMatch[0], "media-type") || "";
    if (id && href) manifest.set(id, { href, mediaType });
  }

  const spineIds: string[] = [];
  for (const tagMatch of opfXml.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = extractAttr(tagMatch[0], "idref");
    if (idref) spineIds.push(idref);
  }
  if (spineIds.length === 0) {
    throw new Error("Arquivo EPUB inválido: não encontrei a ordem de leitura (spine).");
  }

  // Titulo do livro pelos metadados, quando o usuario nao digitou um.
  let title = fallbackTitle;
  if (!titleIsExplicit) {
    const dcTitle = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    const found = dcTitle ? dcTitle[1].replace(/<[^>]+>/g, "").trim() : "";
    if (found) title = found;
  }

  let intro = "";
  let conclusion = "";
  const chapters: ParsedChapter[] = [];
  let ordem = 0;

  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item || !/html|xml/i.test(item.mediaType)) continue;
    const fullPath = decodeURIComponent(opfDir + item.href);
    const file = zip.file(fullPath);
    if (!file) continue;

    const html = await file.async("string");
    const texto = htmlBodyToHeadedText(html);
    if (!texto.trim()) continue;

    ordem += 1;
    // htmlBodyToHeadedText marca os cabecalhos com "# ". O primeiro deles e o
    // titulo do capitulo; o resto do texto e o conteudo.
    const linhas = texto.split("\n\n");
    let tituloCap = "";
    const corpo: string[] = [];
    for (const linha of linhas) {
      if (!tituloCap && linha.startsWith("# ")) {
        tituloCap = linha.slice(2).trim();
        continue;
      }
      corpo.push(linha.startsWith("# ") ? linha.slice(2).trim() : linha);
    }
    const conteudo = corpo.join("\n\n").trim();
    if (!conteudo && !tituloCap) continue;

    // Material de rosto (capa, folha de rosto, página de direitos) costuma vir
    // nos primeiros documentos do spine e quase não tem texto. Se entrasse como
    // capítulo, empurraria a Introdução para a lista de capítulos.
    const pareceRosto =
      conteudo.length < 200 &&
      (ordem <= 3 || /direitos reservados|todos os direitos|copyright|©/i.test(conteudo));
    if (pareceRosto) continue;

    if (!tituloCap) tituloCap = `Parte ${ordem}`;

    const lower = tituloCap.toLowerCase();
    if (chapters.length === 0 && INTRO_WORDS.some((w) => lower.includes(w))) {
      intro = intro ? `${intro}\n\n${conteudo}` : conteudo;
    } else if (CONCLUSION_WORDS.some((w) => lower.includes(w))) {
      conclusion = conclusion ? `${conclusion}\n\n${conteudo}` : conteudo;
    } else {
      chapters.push({ title: tituloCap, content: conteudo || tituloCap });
    }
  }

  if (chapters.length === 0 && !intro && !conclusion) {
    throw new Error("Não encontrei texto legível nesse EPUB.");
  }
  return { title, intro, chapters, conclusion };
}
