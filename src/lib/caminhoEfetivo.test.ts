import { test } from "node:test";
import assert from "node:assert/strict";
import { caminhoEfetivo, ehFiccao } from "./categorias";
import { modoDe } from "./modos";

test("ícone desligado: a categoria decide, como sempre", () => {
  assert.equal(caminhoEfetivo("Minhas categorias > Drama Familiar", null), "Minhas categorias > Drama Familiar");
  assert.equal(caminhoEfetivo("Minhas categorias > Drama Familiar", false), "Minhas categorias > Drama Familiar");
  assert.equal(ehFiccao("Minhas categorias > Drama Familiar"), false);
});

test("ícone ligado transforma em história o que não parecia ficção", () => {
  const c = caminhoEfetivo("Minhas categorias > Drama Familiar", true);
  assert.equal(c, "Ficção > Drama Familiar");
  assert.equal(ehFiccao(c), true);
  assert.equal(modoDe(c), "narrativo");
});

test("categoria que já é ficção não muda", () => {
  assert.equal(caminhoEfetivo("Romance > Comédia romântica", true), "Romance > Comédia romântica");
  assert.equal(caminhoEfetivo("Minhas categorias > Fantasia acolhedora", true), "Minhas categorias > Fantasia acolhedora");
});
