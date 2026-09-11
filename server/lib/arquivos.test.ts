import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PASTA_DE_EXPORTS,
  paraGuardar,
  resolverExport,
  exportadoEmOutroLugar,
} from "./arquivos";

// Um arquivo de verdade na pasta real de exports, com nome improvável de
// colidir. Removido no fim de cada teste que o cria.
const NOME = "__teste-arquivos-" + process.pid + ".epub";
const CAMINHO = path.join(PASTA_DE_EXPORTS, NOME);

function criar() {
  fs.writeFileSync(CAMINHO, "x");
}
function apagar() {
  fs.rmSync(CAMINHO, { force: true });
}

test("paraGuardar reduz o caminho absoluto ao nome do arquivo", () => {
  assert.equal(paraGuardar("/app/data/exports/abc.epub"), "abc.epub");
  assert.equal(paraGuardar(path.join(PASTA_DE_EXPORTS, "abc.epub")), "abc.epub");
});

test("resolve o formato novo: só o nome", () => {
  criar();
  try {
    assert.equal(resolverExport(NOME), CAMINHO);
  } finally {
    apagar();
  }
});

test("resolve o formato antigo: caminho absoluto desta máquina", () => {
  criar();
  try {
    assert.equal(resolverExport(CAMINHO), CAMINHO);
  } finally {
    apagar();
  }
});

test("caminho de contêiner resolve pelo nome, se o arquivo existir aqui", () => {
  // É o caso dos 19 ebooks exportados em produção: o registro no banco aponta
  // para /app, que não existe no Windows. Assim que o arquivo estiver na pasta
  // local, o registro antigo volta a funcionar sem mexer no banco.
  criar();
  try {
    assert.equal(resolverExport("/app/data/exports/" + NOME), CAMINHO);
  } finally {
    apagar();
  }
});

test("arquivo que não existe em lugar nenhum devolve null", () => {
  assert.equal(resolverExport("/app/data/exports/nao-existe-mesmo.epub"), null);
  assert.equal(resolverExport("nao-existe-mesmo.epub"), null);
});

test("valor vazio devolve null e não é 'exportado em outro lugar'", () => {
  assert.equal(resolverExport(null), null);
  assert.equal(resolverExport(undefined), null);
  assert.equal(resolverExport(""), null);
  // Nunca exportado é diferente de exportado noutro ambiente — é o que separa
  // as duas mensagens de erro na tela.
  assert.equal(exportadoEmOutroLugar(null), false);
  assert.equal(exportadoEmOutroLugar(""), false);
});

test("exportadoEmOutroLugar distingue os dois casos", () => {
  assert.equal(exportadoEmOutroLugar("/app/data/exports/nao-existe.epub"), true);
  criar();
  try {
    assert.equal(exportadoEmOutroLugar(NOME), false);
  } finally {
    apagar();
  }
});
