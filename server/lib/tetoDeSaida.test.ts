import test from "node:test";
import assert from "node:assert/strict";
import { tetoDeSaida, cortarNoParagrafo } from "./ai";

// O teto de tokens e o unico freio de tamanho que funciona: o prompt pede o
// intervalo e os modelos passam ~45% dele assim mesmo. Se esta conta errar para
// baixo, capitulos legitimos sao cortados; se errar para cima, o livro volta a
// sair com o dobro do pedido.

test("um capitulo dentro do teto de palavras cabe com folga", () => {
  // Alvo 900, teto 1.170. Um capitulo obediente gasta ~1.638 tokens.
  const teto = tetoDeSaida(1170);
  assert.ok(teto >= 1170 * 1.4, `teto ${teto} cortaria um capitulo no limite`);
});

test("o teto e muito menor que os 4.000 fixos de antes", () => {
  // 4.000 davam espaco para ~2.800 palavras: qualquer alvo abaixo disso podia
  // ser ignorado sem consequencia, que e exatamente o que acontecia.
  assert.ok(tetoDeSaida(1170) < 4000);
});

test("cresce junto com o alvo", () => {
  assert.ok(tetoDeSaida(2000) > tetoDeSaida(1000));
});

test("capitulo curto nao recebe teto menor que a propria instrucao", () => {
  assert.equal(tetoDeSaida(10), 700);
  assert.equal(tetoDeSaida(0), 700);
});

test("corta no ultimo paragrafo completo", () => {
  const texto = "Primeiro paragrafo inteiro.\n\nSegundo paragrafo inteiro.\n\nTerceiro que ficou pela met";
  assert.equal(cortarNoParagrafo(texto), "Primeiro paragrafo inteiro.\n\nSegundo paragrafo inteiro.");
});

test("nao corta quando sobraria menos da metade do texto", () => {
  // A unica quebra esta logo no inicio: cortar ali jogaria fora quase o
  // capitulo inteiro. Entregar a ultima frase incompleta e o mal menor.
  const texto = "Abertura curta.\n\n" + "b".repeat(400);
  assert.equal(cortarNoParagrafo(texto), texto);
});

test("corta quando a sobra descartada e pequena", () => {
  const texto = "a".repeat(400) + "\n\n" + "b".repeat(20);
  assert.equal(cortarNoParagrafo(texto), "a".repeat(400));
});

test("texto sem quebra de paragrafo volta inteiro", () => {
  const texto = "Uma frase so, sem paragrafo nenhum, cortada no me";
  assert.equal(cortarNoParagrafo(texto), texto);
});

test("nao deixa espaco em branco no fim", () => {
  const texto = "Paragrafo um.\n\nParagrafo dois.\n\nsobra";
  assert.ok(!cortarNoParagrafo(texto).endsWith("\n"));
});
