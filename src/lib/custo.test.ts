import test from "node:test";
import assert from "node:assert/strict";
import { capitulosParaPalavras, estimarCusto, PALAVRAS_POR_CAPITULO, MAX_CAPITULOS } from "./custo";

test("capitulosParaPalavras usa a entrega real medida, nao um numero assumido", () => {
  // Bug real: a formula antiga dividia paginas por 4, o que embutia 1000
  // palavras por capitulo (4 x 250) contra a entrega medida de 841. Pedir
  // 20.000 palavras virava 20 capitulos x meta de 1000 -- 20% inflado antes de
  // qualquer capitulo ser escrito -- e "Amor na Esquina" fechou em 75%.
  const capitulos = capitulosParaPalavras(20000);
  assert.equal(capitulos, Math.round(20000 / PALAVRAS_POR_CAPITULO));
  assert.equal(capitulos, 24); // nao 20
});

test("piso de 3 capitulos e teto de MAX_CAPITULOS respeitados", () => {
  assert.equal(capitulosParaPalavras(100), 3);
  assert.equal(capitulosParaPalavras(1_000_000), MAX_CAPITULOS);
});

test("estimarCusto no modo palavras e no modo paginas concordam para o mesmo total", () => {
  // 400 paginas x 250 palavras/pagina = 100.000 palavras: os dois caminhos de
  // entrada devem chegar no mesmo numero de capitulos.
  const porPaginas = estimarCusto({ pageCount: 400, wordsPerPage: 250 });
  const porPalavras = estimarCusto({ pageCount: 400, wordsPerPage: 250, wordGoal: 100000 });
  assert.equal(porPaginas.capitulos, porPalavras.capitulos);
});

test("estimador de capitulos bate com o que o servidor vai pedir de verdade", () => {
  // Regressao do caso real: "Amor na Esquina" foi criado com meta de 20.000
  // palavras. O painel de custo e o servidor (server/lib/ai.ts:chapterCountFor)
  // precisam concordar, senao a tela promete um numero e a geracao pede outro.
  const r = estimarCusto({ pageCount: 80, wordsPerPage: 250, wordGoal: 20000 });
  assert.equal(r.capitulos, 24);
});
