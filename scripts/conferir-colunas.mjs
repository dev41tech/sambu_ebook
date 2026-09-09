// Leitura pura: lista as colunas de uma tabela no banco de DATABASE_URL.
// Existe para conferir o estado do banco antes e depois de uma migration, sem
// precisar abrir um cliente de Postgres à parte.
//
//   node scripts/conferir-colunas.mjs chapters ebooks
import "dotenv/config";
import postgres from "postgres";

const tabelas = process.argv.slice(2);
if (tabelas.length === 0) {
  console.error("Uso: node scripts/conferir-colunas.mjs <tabela> [tabela...]");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  for (const tabela of tabelas) {
    const linhas = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${tabela} ORDER BY ordinal_position
    `;
    console.log(`${tabela}: ${linhas.map((l) => l.column_name).join(", ") || "(tabela não encontrada)"}`);
  }
} finally {
  await sql.end();
}
