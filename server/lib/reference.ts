// Extrai texto de fontes de referência que o usuário fornece (link ou PDF) para servir
// de base ao conteúdo do ebook. Não faz busca autônoma na web — só lê exatamente a URL
// ou o arquivo que o usuário informou.

const MAX_CHARS = 20000;

function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
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

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : "";
}

export interface ExtractedReference {
  title: string;
  text: string;
}

export async function extractTextFromUrl(url: string): Promise<ExtractedReference> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL inválida.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Só são aceitos links http:// ou https://.");
  }

  const res = await fetch(parsed, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SambuEbooks/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Não consegui acessar esse link (${res.status}).`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("Esse link não retornou uma página de texto/HTML legível.");
  }
  const html = await res.text();
  const text = stripHtml(html).slice(0, MAX_CHARS);
  if (!text.trim()) {
    throw new Error("Não encontrei texto legível nessa página.");
  }
  return { title: extractTitle(html), text };
}

export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedReference> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result.text || "").trim().slice(0, MAX_CHARS);
    if (!text) {
      throw new Error("Não encontrei texto legível nesse PDF (pode ser um PDF escaneado/imagem).");
    }
    return { title: "", text };
  } finally {
    await parser.destroy();
  }
}
