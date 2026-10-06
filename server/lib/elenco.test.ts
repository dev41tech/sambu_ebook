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

test("ninguem sai do elenco, nem o registrado mais antigo", () => {
  // Esta era a regra ao contrario ate 06/10/2026: o teto cortava os 12 mais
  // recentes e o resto saia do prompt. A medicao do acervo
  // (docs/MEDICAO-ACERVO.md) mostrou o preco: 33 dos 35 personagens que somem
  // sao gente nascida na prosa, e em "Cartas para a Rua de Baixo" cinco somem
  // no MESMO capitulo -- a assinatura do corte. Agora so a descricao encolhe.
  const registrados = Array.from({ length: 40 }, (_, i) => ({
    nome: `Figurante ${i}`,
    papel: "apoio",
    descricao: `mora na mesma rua desde crianca e trabalha na feira aos domingos ha ${i} anos`,
  }));

  const elenco = elencoEfetivo(outlineCom([ANA]), registrados);
  assert.equal(elenco[0].nome, "Ana Ribeiro");
  assert.equal(elenco.length, 41, "1 do sumario + os 40 registrados, sem corte");
  assert.ok(elenco.some((p) => p.nome === "Figurante 0"), "o mais antigo continua no prompt");
  assert.equal(elenco.at(-1)!.nome, "Figurante 39");

  // O que cede e a descricao dos mais antigos; os 12 mais recentes ficam inteiros.
  const antigo = elenco.find((p) => p.nome === "Figurante 0")!;
  const recente = elenco.find((p) => p.nome === "Figurante 39")!;
  assert.ok(antigo.descricao.length < recente.descricao.length);
  assert.equal(recente.descricao, registrados[39].descricao);
  assert.equal(elenco[0].descricao, ANA.descricao, "protagonista nunca e encurtado");
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
