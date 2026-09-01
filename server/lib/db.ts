import postgres from "postgres";

// Conexao com o Postgres. A DATABASE_URL vem do ambiente (no EasyPanel, em
// "Ambiente"); nao ha fallback de propósito — sem banco o app nao tem o que
// servir, e falhar aqui e melhor do que subir pela metade.
//
// O schema NAO e criado aqui. Ele vive em db/schema.sql e e aplicado uma vez
// com `npm run db:schema`. Era o "CREATE TABLE IF NOT EXISTS" no boot que
// deixava o app subir com banco vazio sem reclamar, e escondeu a perda de dados
// de 2026-08-26.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL nao definida — o app nao sobe sem banco.");
}

export const sql = postgres(url, {
  // O app roda num container so e faz geracao longa de ebook; um punhado de
  // conexoes basta e evita estourar o limite da instancia compartilhada com o n8n.
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

export type Conn = postgres.Sql | postgres.TransactionSql;

// As tres funcoes abaixo existem para manter as queries do projeto exatamente
// como estavam no SQLite — mesmo texto SQL, so com os placeholders `?` virando
// `$1`, `$2`... Elas nao imitam um driver: sao um atalho para nao repetir
// `sql.unsafe(...).then(r => r[0])` em 89 lugares.
//
// O parametro `conn` permite usar a mesma query dentro de uma transacao,
// passando o `tx` do sql.begin().

/** Todas as linhas. */
export async function all<T>(text: string, params: unknown[] = [], conn: Conn = sql): Promise<T[]> {
  const rows = await conn.unsafe(text, params as never[]);
  return rows as unknown as T[];
}

/** A primeira linha, ou undefined. Equivale ao .get() do better-sqlite3. */
export async function one<T>(text: string, params: unknown[] = [], conn: Conn = sql): Promise<T | undefined> {
  const rows = await conn.unsafe(text, params as never[]);
  return rows[0] as unknown as T | undefined;
}

/** INSERT/UPDATE/DELETE. Devolve quantas linhas foram afetadas. */
export async function run(text: string, params: unknown[] = [], conn: Conn = sql): Promise<number> {
  const rows = await conn.unsafe(text, params as never[]);
  return rows.count ?? 0;
}

export interface LearningRow {
  id: string;
  ebook_id: string | null;
  category: EbookCategory;
  content: string;
  created_at: string;
}

/**
 * `outline_review` e o unico estado novo: a geracao para com o sumario e o
 * elenco prontos, esperando o autor conferir antes de escrever os capitulos.
 */
export type EbookStatus =
  | "draft"
  | "generating"
  | "outline_review"
  | "review"
  | "ready"
  | "error";
export type AudioStatus = "none" | "generating" | "ready" | "error";
export type EbookCategory = "geral" | "tecnico" | "comportamental";

export interface EbookRow {
  id: string;
  title: string;
  subtitle: string;
  theme: string;
  audience: string;
  tone: string;
  language: string;
  template: string;
  page_count: number;
  words_per_page: number;
  extension_mode: string;
  outline_approval: string;
  outline_approved_at: string | null;
  word_goal: number;
  continuity_json: string | null;
  author_name: string;
  author_bio: string;
  include_copyright: boolean;
  include_about: boolean;
  title_mode: string;
  status: EbookStatus;
  error_message: string | null;
  outline_json: string | null;
  intro: string | null;
  conclusion: string | null;
  about_author: string | null;
  chapters_total: number;
  chapters_done: number;
  current_step: string | null;
  pdf_path: string | null;
  docx_path: string | null;
  epub_path: string | null;
  marketing_json: string | null;
  audio_path: string | null;
  audio_status: AudioStatus;
  audio_error: string | null;
  audio_requested: boolean;
  audio_voice: string;
  category_main: string;
  categories_secondary: string;
  generate_cover: boolean;
  cover_style: string;
  cover_suggestion: string;
  cover_path: string | null;
  cover_alt_text: string;
  cover_source: "ai" | "stock" | "local";
  cover_stock_url: string;
  cover_credit: string;
  cover_local_file: string;
  version: string;
  generate_images: boolean;
  image_count: number;
  image_suggestion: string;
  image_source: "ai" | "stock";
  images_done: number;
  category: EbookCategory;
  reference_material: string;
  extra_instructions: string;
  web_research: string;
  created_at: string;
}

export interface ChapterRow {
  id: string;
  ebook_id: string;
  idx: number;
  title: string;
  summary: string;
  content: string;
  audio_path: string | null;
}

export interface ChapterImageRow {
  id: string;
  ebook_id: string;
  chapter_id: string;
  path: string;
  alt_text: string;
  credit: string;
  created_at: string;
}
