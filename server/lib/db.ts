import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "app.db"));
db.pragma("journal_mode = WAL");

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

export type EbookStatus = "draft" | "generating" | "ready" | "error";
export type AudioStatus = "none" | "generating" | "ready" | "error";

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
  audio_path: string | null;
  audio_status: AudioStatus;
  audio_error: string | null;
  generate_cover: number;
  cover_style: string;
  cover_path: string | null;
  generate_images: number;
  image_count: number;
  images_done: number;
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
  created_at: string;
}
