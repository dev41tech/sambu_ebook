import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS ebooks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL,
    audience TEXT NOT NULL,
    tone TEXT NOT NULL,
    language TEXT NOT NULL,
    template TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    author_name TEXT NOT NULL DEFAULT '',
    author_bio TEXT NOT NULL DEFAULT '',
    include_copyright INTEGER NOT NULL DEFAULT 0,
    include_about INTEGER NOT NULL DEFAULT 0,
    title_mode TEXT NOT NULL DEFAULT 'ai',
    status TEXT NOT NULL DEFAULT 'draft',
    error_message TEXT,
    outline_json TEXT,
    intro TEXT,
    conclusion TEXT,
    about_author TEXT,
    chapters_total INTEGER NOT NULL DEFAULT 0,
    chapters_done INTEGER NOT NULL DEFAULT 0,
    current_step TEXT,
    pdf_path TEXT,
    docx_path TEXT,
    audio_path TEXT,
    audio_status TEXT NOT NULL DEFAULT 'none',
    audio_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    ebook_id TEXT NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    audio_path TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_ebook ON chapters(ebook_id);

  CREATE TABLE IF NOT EXISTS chapter_images (
    id TEXT PRIMARY KEY,
    ebook_id TEXT NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chapter_images_chapter ON chapter_images(chapter_id);
`);

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn("ebooks", "generate_cover", "generate_cover INTEGER NOT NULL DEFAULT 0");
ensureColumn("ebooks", "cover_style", "cover_style TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "cover_path", "cover_path TEXT");
ensureColumn("ebooks", "generate_images", "generate_images INTEGER NOT NULL DEFAULT 0");
ensureColumn("ebooks", "image_count", "image_count INTEGER NOT NULL DEFAULT 0");
ensureColumn("ebooks", "images_done", "images_done INTEGER NOT NULL DEFAULT 0");
ensureColumn("ebooks", "cover_suggestion", "cover_suggestion TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "image_suggestion", "image_suggestion TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "cover_alt_text", "cover_alt_text TEXT NOT NULL DEFAULT ''");
ensureColumn("chapter_images", "alt_text", "alt_text TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "cover_source", "cover_source TEXT NOT NULL DEFAULT 'ai'");
ensureColumn("ebooks", "cover_stock_url", "cover_stock_url TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "cover_credit", "cover_credit TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "image_source", "image_source TEXT NOT NULL DEFAULT 'ai'");
ensureColumn("chapter_images", "credit", "credit TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "epub_path", "epub_path TEXT");
ensureColumn("ebooks", "category", "category TEXT NOT NULL DEFAULT 'geral'");
ensureColumn("ebooks", "reference_material", "reference_material TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "extra_instructions", "extra_instructions TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "web_research", "web_research TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "marketing_json", "marketing_json TEXT");
ensureColumn("ebooks", "cover_local_file", "cover_local_file TEXT NOT NULL DEFAULT ''");
ensureColumn("ebooks", "version", "version TEXT NOT NULL DEFAULT 'v1.0'");
ensureColumn("ebooks", "words_per_page", "words_per_page INTEGER NOT NULL DEFAULT 250");

db.exec(`
  CREATE TABLE IF NOT EXISTS learnings (
    id TEXT PRIMARY KEY,
    ebook_id TEXT REFERENCES ebooks(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'geral',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Tabelas da vitrine (portadas do Sambu Online). O catálogo em si continua sendo
// a tabela `ebooks` — estas guardam só o que é do leitor: onde parou, o que
// favoritou, plano e dados de perfil.
db.exec(`
  CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_owner_book
    ON reading_progress(user_email, book_id);

  CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    book_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_owner_book
    ON favorites(user_email, book_id);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL DEFAULT 0,
    chapter_id TEXT,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_owner_book_chapter
    ON bookmarks(user_email, book_id, chapter);

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'trialing',
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    email TEXT PRIMARY KEY,
    full_name TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    birth_date TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'pt-BR',
    pronouns TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'BR',
    role TEXT NOT NULL DEFAULT 'reader',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    event TEXT NOT NULL,
    book_id TEXT,
    chapter_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface LearningRow {
  id: string;
  ebook_id: string | null;
  category: EbookCategory;
  content: string;
  created_at: string;
}

export type EbookStatus = "draft" | "generating" | "review" | "ready" | "error";
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
  author_name: string;
  author_bio: string;
  include_copyright: number;
  include_about: number;
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
  generate_cover: number;
  cover_style: string;
  cover_suggestion: string;
  cover_path: string | null;
  cover_alt_text: string;
  cover_source: "ai" | "stock" | "local";
  cover_stock_url: string;
  cover_credit: string;
  cover_local_file: string;
  version: string;
  generate_images: number;
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
