// Aplica um arquivo .sql de db/migrations no banco de DATABASE_URL.
//   node scripts/aplicar-migration.mjs db/migrations/0003_custom_categories.sql
import "dotenv/config";
import fs from "node:fs";
import postgres from "postgres";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: node scripts/aplicar-migration.mjs <caminho .sql>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(fs.readFileSync(arquivo, "utf8"));
  console.log(`aplicada: ${arquivo}`);
} finally {
  await sql.end();
}
