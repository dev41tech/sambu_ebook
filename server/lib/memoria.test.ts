import test from "node:test";
import assert from "node:assert/strict";
import { memoriaBlock, blocoQueCobre, type CapituloAnterior } from "./ai";

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

test("a memoria longa entra no prompt, e o que ela cobre nao volta como titulo solto", () => {
  // Num livro de 75 capitulos, o 60 recebia os resumos do 52 ao 59 e apenas os
  // TITULOS de tudo antes disso -- um fio aberto no capitulo 3 e retomado no 70
  // nao tinha garantia nenhuma.
  const anteriores = Array.from({ length: 20 }, (_, i) =>
    cap(i, `Capítulo ${i + 1}`, `resumo ${i + 1}`),
  );
  const b = memoriaBlock(anteriores, [
    { ate: 7, resumo: "Capitulos 1 a 8: o grupo naufraga e chega à ilha." },
  ]);

  assert.match(b, /ANTES DISSO/);
  assert.match(b, /o grupo naufraga e chega à ilha/);
  // os 8 mais recentes seguem com resumo inteiro
  assert.match(b, /"Capítulo 20": resumo 20/);
  // o que o bloco ja cobre nao aparece mais na linha de titulos soltos
  assert.doesNotMatch(b, /apenas pelos títulos: "Capítulo 1"/);
  // o que ficou entre o bloco e a janela ainda entra como titulo
  assert.match(b, /"Capítulo 9"/);
});

test("sem memoria longa, o comportamento e exatamente o de antes", () => {
  const anteriores = Array.from({ length: 20 }, (_, i) =>
    cap(i, `Capítulo ${i + 1}`, `resumo ${i + 1}`),
  );
  const b = memoriaBlock(anteriores);
  assert.doesNotMatch(b, /ANTES DISSO/);
  assert.match(b, /apenas pelos títulos/);
  assert.match(b, /"Capítulo 1"/);
});

test("bloco de memoria vazio e ignorado em vez de virar um item em branco", () => {
  const b = memoriaBlock([cap(0, "Um", "aconteceu algo")], [{ ate: 0, resumo: "   " }]);
  assert.doesNotMatch(b, /ANTES DISSO/);
});

test("blocoQueCobre acha o bloco certo, e nada quando o capitulo ainda nao foi coberto", () => {
  // Reescrever um capitulo antigo deixava o bloco condensado descrevendo uma
  // versao do texto que nao existe mais -- e e essa versao velha que viaja para
  // todos os capitulos seguintes.
  const blocos = [
    { ate: 7, resumo: "Capitulos 1 a 8" },
    { ate: 15, resumo: "Capitulos 9 a 16" },
  ];

  assert.deepEqual(blocoQueCobre(blocos, 0), { inicio: 0, fim: 7 });
  assert.deepEqual(blocoQueCobre(blocos, 7), { inicio: 0, fim: 7 });
  assert.deepEqual(blocoQueCobre(blocos, 8), { inicio: 8, fim: 15 });
  assert.deepEqual(blocoQueCobre(blocos, 15), { inicio: 8, fim: 15 });
  // capitulo 17 ainda nao fechou bloco -- nao ha nada a refazer
  assert.equal(blocoQueCobre(blocos, 16), null);
  assert.equal(blocoQueCobre([], 3), null);
});

test("blocoQueCobre nao depende da ordem em que os blocos foram gravados", () => {
  const foraDeOrdem = [
    { ate: 15, resumo: "Capitulos 9 a 16" },
    { ate: 7, resumo: "Capitulos 1 a 8" },
  ];
  assert.deepEqual(blocoQueCobre(foraDeOrdem, 3), { inicio: 0, fim: 7 });
  assert.deepEqual(blocoQueCobre(foraDeOrdem, 12), { inicio: 8, fim: 15 });
});
