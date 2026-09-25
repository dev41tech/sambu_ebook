// Publicacao automatica no Sambu Online (https://ebooks.41tech.cloud).
//
// O acervo antigo foi para o site uma vez, em lote, pelo
// sambu-online/scripts/importar-acervo.mjs. Este modulo faz o mesmo caminho para
// UM livro, no momento em que ele fica pronto aqui: sobe EPUB, capa e audio para
// o Supabase Storage e insere a linha em `books` ja publicada.
//
// Bancos diferentes: os livros vivem no banco deste app, e o catalogo do site
// vive no banco do Sambu Online (SAMBU_ONLINE_DATABASE_URL) -- por isso uma
// conexao propria, e nao a de server/lib/db.ts.
//
// Sem as variaveis configuradas o modulo nao faz nada e avisa no log: um livro
// que nao foi publicado no site e melhor do que uma exportacao que falha.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { one, type EbookRow } from "./db";
import { resolverExport } from "./arquivos";
import { classificacao, sinopseDe } from "../routes/storefront";
import { slugDe } from "./slug";
import { subirParaStorage } from "./storage";

export { slugDe };

export interface ResultadoPublicacao {
  publicado: boolean;
  /** Por que nao publicou, quando publicado = false. */
  motivo?: string;
  slug?: string;
}

export function sambuOnlineConfigurado(): boolean {
  return !!(
    process.env.SAMBU_ONLINE_DATABASE_URL &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Publicar sozinho ao finalizar pode ser desligado sem tirar as credenciais. */
export function publicacaoAutomaticaLigada(): boolean {
  return sambuOnlineConfigurado() && process.env.SAMBU_ONLINE_AUTO_PUBLISH !== "0";
}

/**
 * Publica um ebook ja exportado no catalogo do Sambu Online.
 *
 * Idempotente pelo slug, como o script de carga do acervo: rodar duas vezes no
 * mesmo livro nao duplica. Exige o EPUB -- e o formato que o leitor do site abre.
 */
export async function publicarNoSambuOnline(ebookId: string): Promise<ResultadoPublicacao> {
  if (!sambuOnlineConfigurado()) {
    return { publicado: false, motivo: "Sambu Online não configurado (SAMBU_ONLINE_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const row = await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [ebookId]);
  if (!row) return { publicado: false, motivo: "Ebook não encontrado." };

  const epub = resolverExport(row.epub_path);
  if (!epub) {
    return { publicado: false, motivo: "O EPUB ainda não foi exportado neste ambiente." };
  }

  const contagem = await one<{ n: string }>("SELECT COUNT(*) AS n FROM chapters WHERE ebook_id = $1", [ebookId]);
  const capitulos = Number(contagem?.n ?? 0);
  const slug = slugDe(row.title, row.id);
  const classe = classificacao(row);

  const sql = postgres(process.env.SAMBU_ONLINE_DATABASE_URL!, { max: 1, prepare: false });
  try {
    const existe = await sql`SELECT id FROM books WHERE slug = ${slug} LIMIT 1`;
    if (existe.length > 0) return { publicado: false, motivo: "Já está publicado no site.", slug };

    const id = randomUUID();
    const prefixo = `acervo/${id}`;
    const epubKey = `${prefixo}/${slug}.epub`;
    await subirParaStorage(epubKey, epub);

    // Capa e audio sao opcionais: um livro sem capa entra com o gradiente do
    // card, e sem audio entra como "Ebook".
    let coverKey: string | null = null;
    if (row.cover_path && fs.existsSync(row.cover_path)) {
      coverKey = `${prefixo}/capa${path.extname(row.cover_path).toLowerCase()}`;
      await subirParaStorage(coverKey, row.cover_path);
    }
    let audioKey: string | null = null;
    const audio = row.audio_status === "ready" ? resolverExport(row.audio_path) : null;
    if (audio) {
      audioKey = `${prefixo}/${slug}.mp3`;
      await subirParaStorage(audioKey, audio);
    }

    const agora = new Date().toISOString();
    await sql`
      INSERT INTO books (
        id, slug, title, subtitle, author, author_id, genre, language,
        featured, free_chapters, format, age_rating, description,
        price_cents, subscribers_only, cover_key, epub_key, audio_key,
        status, published_at, created_at, updated_at
      ) VALUES (
        ${id}, ${slug}, ${row.title || "Sem título"}, ${row.subtitle || null},
        ${row.author_name || "Sambu Ebooks"}, ${"sambu-ebooks"}, ${classe.genre}, ${row.language || "pt-BR"},
        ${false}, ${Math.max(1, Math.ceil(capitulos / 4))}, ${audioKey ? "Ebook + Áudio" : "Ebook"}, ${"14"},
        ${sinopseDe(row)}, ${0}, ${false},
        ${coverKey}, ${epubKey}, ${audioKey},
        ${"published"}, ${agora}, ${agora}, ${agora}
      )`;
    return { publicado: true, slug };
  } finally {
    await sql.end();
  }
}
