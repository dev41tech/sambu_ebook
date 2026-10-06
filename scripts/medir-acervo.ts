// Mede, no acervo que JA existe no banco, os dois defeitos relatados em livros
// longos: personagem com peso que some sem destino e fio que nunca fecha.
//
// Leitura pura: nao chama a OpenAI, nao escreve nada. Existe para dar linha de
// base ANTES de mexer na geracao (passo 0 do PLANO-GERACAO-EM-BLOCOS), usando os
// livros que ja custaram dinheiro em vez de gerar outros.
//
//   npx tsx --env-file=.env scripts/medir-acervo.ts
//   npx tsx --env-file=.env scripts/medir-acervo.ts --min 20     (so livros longos)
//   npx tsx --env-file=.env scripts/medir-acervo.ts --json saida.json
//
// Limite conhecido: "fio fechado" e detectado por palavras do proprio fio
// aparecendo no capitulo de fechamento ou depois. E um sinal, nao uma leitura --
// um fio pode ser respondido com outras palavras. Por isso o relatorio separa
// "sem nenhum sinal" (forte) de "sinal fraco".
import { all, one, type EbookRow } from "../server/lib/db";
import { verificarContinuidade, extrairNomes, normalizarTermo } from "../server/lib/continuidade";
import { inicioRetaFinal } from "../server/lib/historia";
import { ehFiccao } from "../src/lib/categorias";
import type { Outline } from "../server/lib/ai";

const args = process.argv.slice(2);
function valor(nome: string, padrao: string): string {
  const i = args.indexOf(`--${nome}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : padrao;
}
const MIN_CAPITULOS = Number(valor("min", "1"));
const ARQUIVO_JSON = valor("json", "");

interface CapituloMedido {
  idx: number;
  title: string;
  content: string;
  personagens_json: string | null;
}

/** Palavras que nao ajudam a identificar um fio. */
const VAZIAS = new Set([
  "sobre", "entre", "quando", "porque", "depois", "antes", "ainda", "sempre", "nunca", "muito",
  "pouco", "todos", "todas", "cada", "mesmo", "mesma", "outro", "outra", "quem", "como", "para",
  "pelo", "pela", "este", "esta", "isso", "aquilo", "ser", "estar", "fazer", "ter", "haver",
  "historia", "livro", "capitulo", "personagem", "final", "verdade",
]);

function palavrasChave(texto: string): string[] {
  const vistas = new Set<string>();
  for (const bruta of texto.split(/[^\p{L}\p{N}]+/u)) {
    const p = normalizarTermo(bruta);
    if (p.length < 5 || VAZIAS.has(p)) continue;
    vistas.add(p);
  }
  return [...vistas];
}

function medirLivro(row: EbookRow, capitulos: CapituloMedido[]) {
  const outline = JSON.parse(row.outline_json || "{}") as Outline;
  const escritos = capitulos.filter((c) => (c.content || "").trim().length > 0);
  const total = escritos.length;
  const ficcao = ehFiccao(row.category_main || row.theme);

  // Elenco registrado na prosa (migration 0010), do jeito que a geracao monta.
  const registrados: Array<{ nome: string; descricao: string }> = [];
  for (const c of escritos) {
    try {
      const lista = JSON.parse(c.personagens_json || "[]");
      if (Array.isArray(lista)) {
        for (const p of lista) {
          const nome = String(p?.nome ?? p ?? "").trim();
          if (nome && !registrados.some((r) => r.nome === nome)) {
            registrados.push({ nome, descricao: String(p?.descricao ?? "") });
          }
        }
      }
    } catch {
      // personagens_json invalido: o livro e anterior a migration 0010.
    }
  }

  const achados = verificarContinuidade({
    outline,
    intro: row.intro,
    conclusao: row.conclusion,
    capitulos: escritos.map((c) => ({ idx: c.idx, title: c.title, content: c.content })),
    ficcao,
    elencoRegistrado: registrados,
  });
  const porCategoria: Record<string, number> = {};
  for (const a of achados) porCategoria[a.categoria] = (porCategoria[a.categoria] ?? 0) + 1;

  // --- Personagens com peso que somem ---
  // "Peso" = 5 mencoes ou mais no livro (mesmo piso do plano B do registro).
  const elenco = [
    ...((outline.personagens ?? []).map((p) => ({ nome: p.nome, destino: p.destino ?? "", origem: "sumario" as const }))),
    ...registrados.map((r) => ({ nome: r.nome, destino: "", origem: "prosa" as const })),
  ];
  const retaFinal = inicioRetaFinal(total);
  const sumidos: Array<{ nome: string; origem: string; mencoes: number; ultimo: number; temDestino: boolean }> = [];
  for (const p of elenco) {
    const alvo = normalizarTermo(p.nome.split(/\s+/)[0] ?? p.nome);
    if (alvo.length < 3) continue;
    let mencoes = 0;
    let ultimo = -1;
    for (const c of escritos) {
      const nomes = extrairNomes(c.content);
      let n = 0;
      for (const [nome, qtd] of nomes) {
        if (normalizarTermo(nome).split(/\s+/)[0] === alvo) n += qtd;
      }
      if (n > 0) {
        mencoes += n;
        ultimo = c.idx;
      }
    }
    // Some = tem peso, mas a ultima aparicao fica antes da reta final.
    if (mencoes >= 5 && ultimo >= 0 && ultimo < retaFinal) {
      sumidos.push({ nome: p.nome, origem: p.origem, mencoes, ultimo: ultimo + 1, temDestino: !!p.destino });
    }
  }

  // --- Fios planejados que nao dao sinal de fechamento ---
  const fios = outline.fios ?? [];
  const fiosAbertos: Array<{ fio: string; fecha: number; sinais: number; chaves: number }> = [];
  for (const f of fios) {
    const chaves = palavrasChave(`${f.fio} ${f.resposta ?? ""}`);
    if (chaves.length === 0) continue;
    const alvo = Math.max(0, (f.fechaNoCapitulo ?? total) - 1);
    const depois = escritos.filter((c) => c.idx >= alvo).map((c) => normalizarTermo(c.content)).join(" ");
    const sinais = chaves.filter((k) => depois.includes(k)).length;
    // Metade das palavras-chave presentes = tratado como fechado.
    if (sinais < Math.max(2, Math.ceil(chaves.length / 2))) {
      fiosAbertos.push({ fio: f.fio, fecha: f.fechaNoCapitulo, sinais, chaves: chaves.length });
    }
  }

  return {
    id: row.id,
    titulo: row.title,
    modelo: (row as unknown as { modelo_texto?: string }).modelo_texto ?? null,
    criado: row.created_at,
    ficcao,
    capitulos: total,
    personagensSumario: (outline.personagens ?? []).length,
    personagensProsa: registrados.length,
    fiosPlanejados: fios.length,
    sumidos,
    fiosAbertos,
    achados: porCategoria,
  };
}

const livros = await all<EbookRow>(
  "SELECT * FROM ebooks WHERE status IN ('ready', 'review') AND chapters_total >= $1 ORDER BY created_at",
  [MIN_CAPITULOS],
);

const relatorio: ReturnType<typeof medirLivro>[] = [];
for (const row of livros) {
  const capitulos = await all<CapituloMedido>(
    "SELECT idx, title, content, personagens_json FROM chapters WHERE ebook_id = $1 ORDER BY idx",
    [row.id],
  );
  if (capitulos.length === 0) continue;
  relatorio.push(medirLivro(row, capitulos));
}

relatorio.sort((a, b) => a.capitulos - b.capitulos);

console.log("cap | sumidos | fios abertos | pers. abandonado (continuidade) | livro");
for (const r of relatorio) {
  const abandonados = r.achados["personagem-abandonado"] ?? 0;
  console.log(
    `${String(r.capitulos).padStart(3)} | ${String(r.sumidos.length).padStart(7)} | ${String(r.fiosAbertos.length).padStart(12)} | ${String(abandonados).padStart(31)} | ${r.titulo} (${r.ficcao ? "ficção" : "não ficção"})`,
  );
}

const curtos = relatorio.filter((r) => r.capitulos <= 12);
const longos = relatorio.filter((r) => r.capitulos >= 20);
function media(xs: number[]): string {
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-";
}
console.log("\n=== Curtos (<= 12 capitulos):", curtos.length, "livros");
console.log(`  personagens que somem: media ${media(curtos.map((r) => r.sumidos.length))} | fios sem sinal: media ${media(curtos.map((r) => r.fiosAbertos.length))}`);
console.log("=== Longos (>= 20 capitulos):", longos.length, "livros");
console.log(`  personagens que somem: media ${media(longos.map((r) => r.sumidos.length))} | fios sem sinal: media ${media(longos.map((r) => r.fiosAbertos.length))}`);

if (ARQUIVO_JSON) {
  const fs = await import("node:fs");
  fs.writeFileSync(ARQUIVO_JSON, JSON.stringify(relatorio, null, 2));
  console.log(`\ndetalhe por livro em ${ARQUIVO_JSON}`);
}

process.exit(0);
