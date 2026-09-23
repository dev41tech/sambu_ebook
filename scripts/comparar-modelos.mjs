// Gera um livro curto com os prompts reais do app, para comparar modelos.
//
// NAO toca no banco: monta o contexto em memoria, chama generateOutline,
// generateChapter e resumirCapitulo direto de server/lib/ai.ts e escreve um
// markdown em data/comparacao/. Existe porque trocar OPENAI_MODEL e barato, mas
// so da para saber se o modelo barato aguenta lendo o que ele escreve.
//
//   npx tsx scripts/comparar-modelos.mjs <modelo> [capitulos] [palavras-por-capitulo]
//
// O modelo vem por argumento e sobrescreve OPENAI_MODEL: a ideia e rodar o
// mesmo briefing em dois modelos e ler os dois arquivos lado a lado.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
const modelo = process.argv[2];
const capitulos = Number(process.argv[3] || 6);
if (!modelo) {
  console.error("Uso: npx tsx scripts/comparar-modelos.mjs <modelo> [capitulos]");
  process.exit(1);
}
// Precisa valer ANTES do import de ai.ts: o modelo e lido no topo do modulo.
process.env.OPENAI_MODEL = modelo;

const { generateOutline, generateChapter, resumirCapitulo, elencoEfetivo } = await import(
  "../server/lib/ai.ts"
);

// Default: a mesma calibracao que o app usa (src/lib/custo.ts). Pedir menos que
// isso e um teste valido -- e o caso em que o teto de saida morde -- mas nao e o
// caminho normal, e comparar modelos com um alvo fora da calibracao mistura duas
// coisas diferentes.
const PALAVRAS_POR_CAPITULO = Number(process.argv[4] || 1400);

const ctx = {
  theme: "Romance > Romance contemporaneo",
  secondaryCategories: [],
  audience: "Adultos de 25 a 45 anos que gostam de drama familiar",
  tone: "Intimista",
  language: "Português (Brasil)",
  pageCount: Math.round((capitulos * PALAVRAS_POR_CAPITULO) / 250),
  wordsPerPage: 250,
  wordGoal: capitulos * PALAVRAS_POR_CAPITULO,
  chapterCount: capitulos,
  titleMode: "ai",
  extraInstructions:
    "A historia gira em torno de uma oficina de moveis herdada e de uma irma que desapareceu ha quinze anos.",
};

const t0 = Date.now();
const seg = () => Math.round((Date.now() - t0) / 1000);

console.log(`[${modelo}] sumario...`);
const outline = await generateOutline(ctx);
console.log(`[${modelo}] sumario pronto: ${outline.chapters.length} capitulos, ${seg()}s`);

const anteriores = [];
const registrados = [];
const textos = [];

for (let i = 0; i < outline.chapters.length; i++) {
  const cap = outline.chapters[i];
  const texto = await generateChapter(ctx, outline, i, anteriores, registrados);
  const palavras = texto.trim().split(/\s+/).filter(Boolean).length;
  textos.push({ ...cap, texto, palavras });

  const conhecidos = elencoEfetivo(outline, registrados).map((p) => p.nome);
  let resumo = null;
  try {
    const r = await resumirCapitulo(ctx, cap.title, texto, conhecidos);
    resumo = r.resumo;
    registrados.push(...(r.personagensNovos || []));
  } catch (err) {
    console.warn(`  ! resumo do cap ${i + 1} falhou: ${err.message}`);
  }
  anteriores.push({ idx: i, title: cap.title, resumo });
  console.log(`[${modelo}] cap ${i + 1}/${outline.chapters.length}: ${palavras} palavras, ${seg()}s`);
}

const dir = path.resolve("data", "comparacao");
fs.mkdirSync(dir, { recursive: true });
const arquivo = path.join(dir, `${modelo.replace(/[^\w.-]/g, "_")}.md`);

const total = textos.reduce((s, c) => s + c.palavras, 0);
const linhas = [
  `# ${outline.title}`,
  `*${outline.subtitle}*`,
  "",
  `> Modelo: \`${modelo}\` · ${textos.length} capitulos · ${total} palavras · ${seg()}s`,
  "",
  "## Elenco do sumario",
  ...(outline.personagens || []).map((p) => `- **${p.nome}** (${p.papel}) — ${p.descricao}`),
  "",
  "## Fatos fixos",
  ...(outline.fatosFixos || []).map((f) => `- ${f}`),
  "",
  "## Elenco registrado na prosa",
  registrados.length ? registrados.map((p) => `- **${p.nome}** (${p.papel}) — ${p.descricao}`).join("\n") : "_nenhum_",
  "",
  "---",
  "",
];
for (const [i, c] of textos.entries()) {
  linhas.push(`## ${i + 1}. ${c.title}`);
  linhas.push(`*funcao: ${c.funcao || "-"} · em cena: ${(c.personagens || []).join(", ") || "-"} · ${c.palavras} palavras*`);
  if (c.resultado) linhas.push(`*resultado: ${c.resultado}*`);
  linhas.push("", c.texto, "");
  const resumo = anteriores[i]?.resumo;
  linhas.push(`> **Resumo registrado:** ${resumo || "_falhou_"}`, "");
}

fs.writeFileSync(arquivo, linhas.join("\n"), "utf8");
console.log(`\n[${modelo}] pronto: ${arquivo}`);
console.log(`[${modelo}] ${textos.length} capitulos, ${total} palavras, ${seg()}s`);
