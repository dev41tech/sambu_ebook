import test from "node:test";
import assert from "node:assert/strict";
import { elencoEfetivo, type Outline, type Personagem } from "./ai";

// O elenco do sumario resolve o protagonista; quem nasce na prosa e o resto do
// livro. Se esta funcao errar, volta o defeito que ela existe para corrigir --
// o personagem que aparece uma vez e some -- e sem nenhum erro no log.

function outlineCom(personagens: Personagem[] = []): Outline {
  return { title: "Livro", subtitle: "sub", chapters: [], personagens };
}

const ANA: Personagem = { nome: "Ana Ribeiro", papel: "protagonista", descricao: "fisioterapeuta" };

test("sem registrados, o elenco e o do sumario", () => {
  assert.deepEqual(
    elencoEfetivo(outlineCom([ANA])).map((p) => p.nome),
    ["Ana Ribeiro"],
  );
});

test("quem nasceu na prosa entra depois do elenco do sumario", () => {
  const registrados = [{ nome: "Dona Tereza", papel: "apoio", descricao: "vizinha" }];
  assert.deepEqual(
    elencoEfetivo(outlineCom([ANA]), registrados).map((p) => p.nome),
    ["Ana Ribeiro", "Dona Tereza"],
  );
});

test("nao duplica quem ja estava no sumario, mesmo com outra caixa", () => {
  // O modelo as vezes "registra" alguem que ja existe, escrito diferente.
  const registrados = [{ nome: "ana ribeiro", papel: "apoio", descricao: "outra coisa" }];
  assert.deepEqual(
    elencoEfetivo(outlineCom([ANA]), registrados).map((p) => p.nome),
    ["Ana Ribeiro"],
  );
});

test("nao duplica o mesmo nome registrado duas vezes", () => {
  const registrados = [
    { nome: "Rita", papel: "apoio", descricao: "a enfermeira" },
    { nome: "Rita", papel: "apoio", descricao: "a enfermeira" },
  ];
  assert.equal(elencoEfetivo(outlineCom([ANA]), registrados).length, 2);
});

test("o elenco do sumario nunca e cortado pelo teto de registrados", () => {
  // Num livro de 75 capitulos os registrados passam do teto. Se o corte pegasse
  // os protagonistas, eles sairiam do prompt -- exatamente o defeito a corrigir.
  const registrados = Array.from({ length: 40 }, (_, i) => ({
    nome: `Figurante ${i}`,
    papel: "apoio",
    descricao: "z",
  }));

  const elenco = elencoEfetivo(outlineCom([ANA]), registrados);
  assert.equal(elenco[0].nome, "Ana Ribeiro");
  assert.equal(elenco.length, 13, "1 do sumario + teto de 12 registrados");
  assert.equal(elenco.at(-1)!.nome, "Figurante 39", "mantem os mais recentes");
});

test("nome vazio nao entra no elenco", () => {
  const registrados = [{ nome: "  ", papel: "apoio", descricao: "x" }];
  assert.deepEqual(
    elencoEfetivo(outlineCom([ANA]), registrados).map((p) => p.nome),
    ["Ana Ribeiro"],
  );
});

test("livro de nao ficcao, sem elenco nenhum, devolve lista vazia", () => {
  assert.deepEqual(elencoEfetivo(outlineCom()), []);
});
