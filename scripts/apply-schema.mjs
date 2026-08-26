// Aplica db/schema.sql no Postgres apontado por DATABASE_URL.
//
//   npm run db:schema
//
// Le a DATABASE_URL do .env (mesmo arquivo que o app usa). Rodando da sua
// maquina, use a URL EXTERNA; de dentro da rede do EasyPanel, a INTERNA.
//
// Roda uma vez, na mao. De proposito nao e chamado no boot do app: era o
// "CREATE TABLE IF NOT EXISTS" no boot que deixava o app subir com banco
// vazio sem reclamar, e escondeu a perda de dados.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "..", "db", "schema.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definida. Copie .env.example para .env e preencha.");
  process.exit(1);
}

// O "@" da senha separa credencial de host e quebra a URL — o sintoma e um erro
// de host desconhecido, que parece problema de rede. Melhor avisar aqui.
const credentials = url.slice(url.indexOf("//") + 2, url.lastIndexOf("@"));
if (credentials.includes("@")) {
  console.error("A senha na DATABASE_URL tem '@' sem escapar. Troque por %40 ou gere uma senha sem '@'.");
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Mensagens de erro do Postgres vem com codigo — traduzir os tres que mais
// aparecem evita tentativa e erro as cegas.
const HINTS = {
  "28P01": "senha errada para o usuario da DATABASE_URL",
  "3D000": "o banco nao existe — falta rodar o CREATE DATABASE do passo 1",
  "42P07": "ja existe tabela com esse nome — o schema provavelmente ja foi aplicado",
  "42501": "sem permissao no schema public — falta o GRANT ALL ON SCHEMA public",
  ECONNREFUSED: "porta fechada ou host errado — confira se e a URL externa",
  ENOTFOUND: "host nao resolve — confira o endereco da DATABASE_URL",
};

try {
  // .simple() e obrigatorio: o protocolo estendido nao aceita varios
  // comandos num mesmo envio, e o schema tem dezenas.
  await sql.unsafe(schema).simple();

  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log(`Schema aplicado. ${tables.length} tabelas em public:`);
  for (const t of tables) console.log(`  - ${t.tablename}`);
  if (tables.length !== 10) {
    console.error(`\nEsperava 10 tabelas, encontrei ${tables.length}. Confira antes de seguir.`);
    process.exitCode = 1;
  }
} catch (err) {
  const code = err.code;
  console.error(`Falhou: ${err.message}`);
  if (HINTS[code]) console.error(`(${code}) ${HINTS[code]}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
