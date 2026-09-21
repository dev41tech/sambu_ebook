import test from "node:test";
import assert from "node:assert/strict";
import {
  capitulosEscolhidos,
  capitulosParaPalavras,
  estimarCusto,
  PALAVRAS_POR_CAPITULO,
  MAX_CAPITULOS,
} from "./custo";

test("capitulosParaPalavras usa a entrega real medida, nao um numero assumido", () => {
  // Bug real: a formula antiga dividia paginas por 4, o que embutia 1000
  // palavras por capitulo (4 x 250) contra a entrega medida. Com o gpt-5.5 a
  // entrega medida passou a ~1.400: 20.000 palavras sao 14 capitulos, nao 24
  // (o que valia com a media de 841 do gpt-4o) -- 24 capitulos x ~1.400 fechariam
  // um livro 70% maior que o pedido.
  const capitulos = capitulosParaPalavras(20000);
  assert.equal(capitulos, Math.round(20000 / PALAVRAS_POR_CAPITULO));
  assert.equal(capitulos, 14);
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
  // O painel de custo e o servidor (server/lib/ai.ts:chapterCountFor) precisam
  // concordar, senao a tela promete um numero e a geracao pede outro.
  const r = estimarCusto({ pageCount: 80, wordsPerPage: 250, wordGoal: 20000 });
  assert.equal(r.capitulos, 14);
});

test("capitulos escolhidos pelo usuario mandam na estimativa", () => {
  const r = estimarCusto({ pageCount: 80, wordsPerPage: 250, wordGoal: 20000, capitulos: 20 });
  assert.equal(r.capitulos, 20);
  // Escolha ausente ou invalida volta para a conta automatica.
  assert.equal(estimarCusto({ pageCount: 80, wordsPerPage: 250, wordGoal: 20000, capitulos: 0 }).capitulos, 14);
});

test("capitulosEscolhidos valida sem impor o piso de 3 da conta automatica", () => {
  assert.equal(capitulosEscolhidos(1), 1);
  assert.equal(capitulosEscolhidos("12"), 12);
  assert.equal(capitulosEscolhidos(7.6), 8);
  assert.equal(capitulosEscolhidos(500), MAX_CAPITULOS);
  assert.equal(capitulosEscolhidos(0), null);
  assert.equal(capitulosEscolhidos(-3), null);
  assert.equal(capitulosEscolhidos("abc"), null);
  assert.equal(capitulosEscolhidos(undefined), null);
  assert.equal(capitulosEscolhidos(null), null);
});
