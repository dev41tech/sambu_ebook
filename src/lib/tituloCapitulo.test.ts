import { test } from "node:test";
import assert from "node:assert/strict";
import { limparTituloCapitulo } from "./tituloCapitulo";

test("tira a numeração que a IA cola no título", () => {
  assert.equal(limparTituloCapitulo("2. O copo rachado de Íris"), "O copo rachado de Íris");
  assert.equal(limparTituloCapitulo("13. A noite em que a porta quase fecha"), "A noite em que a porta quase fecha");
  assert.equal(limparTituloCapitulo("Capítulo 3: A porta"), "A porta");
  assert.equal(limparTituloCapitulo("capitulo 4 - A rua"), "A rua");
  assert.equal(limparTituloCapitulo("5) A loja vazia"), "A loja vazia");
  assert.equal(limparTituloCapitulo("6 — O disco riscado"), "O disco riscado");
  assert.equal(limparTituloCapitulo("IV. O quarto ato"), "O quarto ato");
});

test("não mexe em título sem numeração na frente", () => {
  assert.equal(limparTituloCapitulo("A chave e o silêncio da porta"), "A chave e o silêncio da porta");
  assert.equal(limparTituloCapitulo("1984 e o futuro"), "1984 e o futuro");
  assert.equal(limparTituloCapitulo("3 passos para dormir melhor"), "3 passos para dormir melhor");
  assert.equal(limparTituloCapitulo("Vida nova"), "Vida nova");
  assert.equal(limparTituloCapitulo("Mil e uma noites"), "Mil e uma noites");
});

test("se só houver o rótulo, mantém (não deixa o capítulo sem título)", () => {
  assert.equal(limparTituloCapitulo("Capítulo 3"), "Capítulo 3");
  assert.equal(limparTituloCapitulo("12."), "12.");
  assert.equal(limparTituloCapitulo(""), "");
});
