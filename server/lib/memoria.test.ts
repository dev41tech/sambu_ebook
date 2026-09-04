import test from "node:test";
import assert from "node:assert/strict";
import { memoriaBlock, type CapituloAnterior } from "./ai";

function cap(idx: number, title: string, resumo: string | null): CapituloAnterior {
  return { idx, title, resumo };
}

test("primeiro capitulo nao inventa historico", () => {
  const b = memoriaBlock([]);
  assert.match(b, /primeiro capítulo/i);
  assert.doesNotMatch(b, /JÁ ACONTECEU/);
});

test("o resumo do capitulo anterior chega no prompt", () => {
  // O defeito real: "Ilha do Desespero" termina o capitulo 4 com todos dentro da
  // jangada, no mar, e comeca o 5 na ilha.
  const b = memoriaBlock([cap(3, "Planos de Fuga", "O grupo entra no mar na jangada que construiu.")]);
  assert.match(b, /Capítulo 4 — "Planos de Fuga": O grupo entra no mar/);
  assert.match(b, /não recomece/i);
});

test("acima da janela, os antigos entram so como titulo", () => {
  const anteriores = Array.from({ length: 20 }, (_, i) =>
    cap(i, `Capítulo ${i + 1}`, `resumo ${i + 1}`),
  );
  const b = memoriaBlock(anteriores);
  // os 8 ultimos vem com resumo
  assert.match(b, /"Capítulo 20": resumo 20/);
  assert.match(b, /"Capítulo 13": resumo 13/);
  // o 12 e anteriores nao trazem resumo
  assert.doesNotMatch(b, /"Capítulo 12": resumo 12/);
  assert.match(b, /apenas pelos títulos/);
  assert.match(b, /"Capítulo 1"/);
});

test("capitulo sem resumo registrado nao vira texto vazio", () => {
  // Ebooks anteriores a esta memoria tem resumo_fatos nulo.
  const b = memoriaBlock([cap(0, "A Queda", null)]);
  assert.match(b, /sem resumo registrado/);
  assert.doesNotMatch(b, /: null/);
  assert.doesNotMatch(b, /: undefined/);
});

test("pede explicitamente para nao repetir", () => {
  const b = memoriaBlock([cap(0, "Um", "aconteceu algo")]);
  assert.match(b, /Não repita fatos, exemplos, cenas ou conclusões/);
});
