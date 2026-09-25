/**
 * Envio de arquivo para o Supabase Storage, usado pela publicacao no Sambu
 * Online. Mesmo caminho do script de carga do acervo (sambu-online/scripts).
 *
 * Fica separado de sambuOnline.ts por nao depender de banco: assim da para
 * testar o upload de ponta a ponta contra um servidor local.
 */
import fs from "node:fs";
import path from "node:path";

/** Content-type por extensao. Octet-stream faria o navegador baixar a capa em vez de exibir. */
const MIME: Record<string, string> = {
  ".epub": "application/epub+zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

export function tipoDoArquivo(arquivo: string): string | null {
  return MIME[path.extname(arquivo).toLowerCase()] ?? null;
}

export async function subirParaStorage(chave: string, arquivo: string): Promise<void> {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "sambu";
  const tipo = tipoDoArquivo(arquivo);
  if (!tipo) throw new Error(`extensão ${path.extname(arquivo)} sem content-type mapeado`);

  const url = `${base}/storage/v1/object/${bucket}/${chave.split("/").map(encodeURIComponent).join("/")}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": tipo,
      // Republicar um livro sobrescreve o arquivo em vez de falhar com "já existe".
      "x-upsert": "true",
    },
    body: fs.readFileSync(arquivo),
  });
  if (!r.ok) throw new Error(`upload de ${chave} falhou: ${r.status} ${await r.text()}`);
}
