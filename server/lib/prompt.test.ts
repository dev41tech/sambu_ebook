import test from "node:test";
import assert from "node:assert/strict";
import { capituloParaResumir, sumidosBlock } from "./ai";

test("resumo recebe o capitulo inteiro, inclusive o fim", () => {
  // O slice(0, 12000) cortava justamente a decisao e o gancho do capitulo.
  const capitulo = `${"palavra ".repeat(3000)}FIM-DO-CAPITULO`;
  const enviado = capituloParaResumir(capitulo);
  assert.ok(enviado.includes("FIM-DO-CAPITULO"));
  assert.equal(enviado, capitulo);
});

test("capitulo absurdo preserva comeco e fim, e avisa do corte", () => {
  const capitulo = `INICIO${"x".repeat(80000)}FIM-DO-CAPITULO`;
  const enviado = capituloParaResumir(capitulo, 1000);
  assert.ok(enviado.startsWith("INICIO"));
  assert.ok(enviado.endsWith("FIM-DO-CAPITULO"));
  assert.match(enviado, /omitido/);
  assert.ok(enviado.length < 1200);
});

test("bloco de sumidos cita no maximo tres e da as duas saidas", () => {
  const bloco = sumidosBlock([
    { nome: "Chico", ultimo: 21 },
    { nome: "Neco", ultimo: 19 },
    { nome: "Tonhao", ultimo: 13 },
    { nome: "Celina", ultimo: 11 },
  ]);
  assert.match(bloco, /Chico \(última aparição: capítulo 22\)/);
  assert.doesNotMatch(bloco, /Celina/);
  assert.match(bloco, /traga-a de volta/);
  assert.match(bloco, /mostre em cena/);
});

test("sem sumidos o bloco nao entra no prompt", () => {
  assert.equal(sumidosBlock([]), "");
  assert.equal(sumidosBlock(), "");
});
