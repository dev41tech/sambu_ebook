#!/usr/bin/env node
// Leva os dados do SQLite antigo (data/app.db) para o Postgres.
//
// A migracao de codigo trocou o driver, mas nao moveu o conteudo: quem ja tinha
// ebooks gerados ficou com eles presos no arquivo .db. Este script cobre essa
// lacuna -- ele le o SQLite e insere no banco apontado por DATABASE_URL.
//
// Uso:
//   node scripts/migrar-sqlite-para-postgres.mjs --dry-run
//   node --env-file=.env scripts/migrar-sqlite-para-postgres.mjs
//   node --env-file=.env scripts/migrar-sqlite-para-postgres.mjs --db=caminho/app.db
//
// Requisitos: o schema ja aplicado no destino (`npm run db:schema`).
// E idempotente: linha cujo id ja exista no Postgres e pulada, entao pode rodar
// de novo depois de uma queda no meio.
//
// Le o SQLite com o modulo nativo node:sqlite -- o better-sqlite3 saiu das
// dependencias na migracao e nao precisa voltar so por causa disto.

import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const DRY = !!args.get("dry-run");
const ARQUIVO_DB = path.resolve(String(args.get("db") || "data/app.db"));

// Ordem importa: chapters referencia ebooks, chapter_images referencia chapters.
const TABELAS = [
  "ebooks",
  "chapters",
  "chapter_images",
  "learnings",
  "reading_progress",
  "favorites",
  "bookmarks",
  "subscriptions",
  "profiles",
  "analytics_events",
];

// No SQLite estas colunas eram INTEGER 0/1; no Postgres sao boolean.
const BOOLEANOS = new Set([
  "include_copyright",
  "include_about",
  "generate_cover",
  "generate_images",
  "audio_requested",
  "cancel_at_period_end",
]);

// profiles usa `email` como chave; as demais usam `id`.
const CHAVE = { profiles: "email" };

if (!fs.existsSync(ARQUIVO_DB)) {
  console.error(`Nao achei ${ARQUIVO_DB}. Use --db=caminho para apontar o arquivo.`);
  process.exit(1);
}
if (!DRY && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao definida. Rode com: node --env-file=.env scripts/migrar-sqlite-para-postgres.mjs");
  process.exit(1);
}

const lite = new DatabaseSync(ARQUIVO_DB, { readOnly: true });
const existentes = new Set(
  lite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
);

let sql = null;
if (!DRY) {
  const { default: postgres } = await import("postgres");
  sql = postgres(process.env.DATABASE_URL, { max: 4, onnotice: () => {} });
}

function converter(tabela, linha, colunasDestino) {
  const saida = {};
  for (const [coluna, valor] of Object.entries(linha)) {
    // Coluna que existe no SQLite mas nao no Postgres e descartada em silencio:
    // o schema novo removeu algumas, e falhar por isso travaria a migracao toda.
    if (!colunasDestino.has(coluna)) continue;
    saida[coluna] = BOOLEANOS.has(coluna) ? valor === 1 || valor === true : valor;
  }
  return saida;
}

const resumo = [];
let totalInseridas = 0, totalPuladas = 0;

try {
  for (const tabela of TABELAS) {
    if (!existentes.has(tabela)) continue;
    const linhas = lite.prepare(`SELECT * FROM "${tabela}"`).all();
    if (linhas.length === 0) continue;

    if (DRY) {
      resumo.push(`${tabela}: ${linhas.length} linhas seriam migradas`);
      totalInseridas += linhas.length;
      continue;
    }

    const colunasDestino = new Set(
      (
        await sql`SELECT column_name FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = ${tabela}`
      ).map((r) => r.column_name),
    );
    if (colunasDestino.size === 0) {
      resumo.push(`${tabela}: tabela nao existe no destino -- rode 'npm run db:schema' antes`);
      continue;
    }

    const chave = CHAVE[tabela] || "id";
    let inseridas = 0, puladas = 0;

    for (const bruta of linhas) {
      const linha = converter(tabela, bruta, colunasDestino);
      const idValor = linha[chave];
      if (idValor === undefined) { puladas++; continue; }

      const ja = await sql`SELECT 1 FROM ${sql(tabela)} WHERE ${sql(chave)} = ${idValor} LIMIT 1`;
      if (ja.length > 0) { puladas++; continue; }

      try {
        await sql`INSERT INTO ${sql(tabela)} ${sql(linha)}`;
        inseridas++;
      } catch (e) {
        console.log(`  ${tabela}[${idValor}] -> ERRO: ${e.message}`);
      }
    }
    resumo.push(`${tabela}: ${inseridas} inseridas, ${puladas} ja existiam`);
    totalInseridas += inseridas;
    totalPuladas += puladas;
  }
} finally {
  if (sql) await sql.end();
}

console.log(resumo.join("\n"));
console.log(`\ntotal: ${totalInseridas} inseridas, ${totalPuladas} puladas`);
if (DRY) console.log("(dry-run: nada foi gravado)");
