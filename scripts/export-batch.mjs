// Baixa em lote os arquivos já exportados (pdf/docx/epub/mp3) de data/exports,
// renomeando pelo título do ebook em vez do UUID.
// Uso:
//   node scripts/export-batch.mjs                -> copia tudo para data/lote/
//   node scripts/export-batch.mjs --dest C:\caminho\destino
//   node scripts/export-batch.mjs --formats pdf,epub
//   node scripts/export-batch.mjs --status ready  (filtra por status; padrão: todos)

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const exportsDir = path.join(root, "data", "exports");
const dbPath = path.join(root, "data", "app.db");

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const destDir = path.resolve(argValue("dest", path.join(root, "data", "lote")));
const formats = argValue("formats", "pdf,docx,epub,mp3").split(",").map((f) => f.trim().toLowerCase());
const statusFilter = argValue("status", null);

fs.mkdirSync(destDir, { recursive: true });

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare(
    `SELECT id, title, status, created_at FROM ebooks ${statusFilter ? "WHERE status = ?" : ""} ORDER BY created_at DESC`
  )
  .all(...(statusFilter ? [statusFilter] : []));

function slugify(title, id) {
  const base = String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base ? base.slice(0, 80) : id;
}

let copied = 0;
let skipped = 0;
const missing = [];

for (const row of rows) {
  const slug = slugify(row.title, row.id);
  for (const fmt of formats) {
    const src = path.join(exportsDir, `${row.id}.${fmt}`);
    if (!fs.existsSync(src)) continue;
    const destName = `${slug}.${fmt}`;
    const dest = path.join(destDir, destName);
    fs.copyFileSync(src, dest);
    copied++;
  }
  const anyFound = formats.some((fmt) => fs.existsSync(path.join(exportsDir, `${row.id}.${fmt}`)));
  if (!anyFound) {
    skipped++;
    missing.push(`${row.title || "(sem título)"} [${row.id}] — status: ${row.status}`);
  }
}

console.log(`Copiados: ${copied} arquivo(s) para ${destDir}`);
if (skipped > 0) {
  console.log(`\nEbooks sem nenhum arquivo exportado nos formatos pedidos (${skipped}):`);
  for (const m of missing) console.log(`  - ${m}`);
}
