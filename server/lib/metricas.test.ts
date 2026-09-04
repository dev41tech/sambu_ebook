import test from "node:test";
import assert from "node:assert/strict";
import { medir, medirComResumos } from "./metricas";

function cap(idx: number, content: string) {
  return { idx, content };
}

const ROMANCE = "Romance > Romance contemporâneo";
const NAO_FICCAO = "Negócios e finanças > Gestão financeira";

test("nome de 3 letras nao e apagado da contagem (bug real: Ana sempre 'sem funcao')", () => {
  // vocabulario() descarta palavra com <=3 letras. Sem tratamento à parte, "Ana"
  // nunca entraria no conjunto e apareceria como personagem sem função mesmo
  // citada centenas de vezes -- foi o que a primeira versão fez.
  const capitulos = [
    cap(0, "Ana correu pela rua. Ana estava atrasada para o encontro."),
    cap(1, "Ana voltou para casa. Ana pensou em tudo que houve."),
  ];
  const m = medir({ caminhoCategoria: ROMANCE, capitulos, elenco: ["Ana Costa"] });
  assert.deepEqual(m.personagensSemFuncao, []);
});

test("honorifico no elenco nao vira o nome buscado (bug real: 'Delegada' em vez de 'Mariana')", () => {
  // "Delegada Mariana Silva" -- pegar a primeira palavra ingenuamente busca por
  // "Delegada" no texto, que é o título, não a pessoa.
  const capitulos = [
    cap(0, "Mariana chegou à delegacia ao amanhecer."),
    cap(1, "Mariana revisou o caso mais uma vez."),
  ];
  const m = medir({ caminhoCategoria: ROMANCE, capitulos, elenco: ["Delegada Mariana Silva"] });
  assert.deepEqual(m.personagensSemFuncao, []);
});

test("personagem que so aparece em 1 capitulo e sinalizado", () => {
  const capitulos = [cap(0, "Bruno apareceu uma vez e sumiu."), cap(1, "Ninguém mais falou dele.")];
  const m = medir({ caminhoCategoria: ROMANCE, capitulos, elenco: ["Bruno Alves"] });
  assert.deepEqual(m.personagensSemFuncao, ["Bruno Alves"]);
});

test("dialogo so conta em modo narrativo", () => {
  const capitulos = [cap(0, "— Olá, disse ela.\n— Oi, respondeu ele.")];
  const ficcao = medir({ caminhoCategoria: ROMANCE, capitulos });
  const naoFiccao = medir({ caminhoCategoria: NAO_FICCAO, capitulos });
  assert.ok(ficcao.dialogoPorMil > 0);
  assert.equal(naoFiccao.dialogoPorMil, 0);
});

test("livro vazio nao quebra e nao divide por zero", () => {
  const m = medir({ caminhoCategoria: ROMANCE, capitulos: [] });
  assert.equal(m.palavras, 0);
  assert.equal(m.dialogoPorMil, 0);
  assert.equal(m.repeticaoEntreCapitulos, 0);
});

test("capitulo unico nao gera repeticao (nao ha par para comparar)", () => {
  const m = medir({ caminhoCategoria: ROMANCE, capitulos: [cap(0, "Texto qualquer aqui.")] });
  assert.equal(m.repeticaoEntreCapitulos, 0);
});

test("dois capitulos identicos tem repeticao alta", () => {
  const texto = "Marina caminhava pela praia observando o horizonte distante todas as tardes.";
  const m = medir({ caminhoCategoria: ROMANCE, capitulos: [cap(0, texto), cap(1, texto)] });
  assert.equal(m.repeticaoEntreCapitulos, 1);
});

test("capitulos sobre assuntos diferentes tem repeticao baixa", () => {
  const m = medir({
    caminhoCategoria: ROMANCE,
    capitulos: [
      cap(0, "Marina caminhava pela praia observando o horizonte distante."),
      cap(1, "Roberto calculava os impostos do trimestre com cuidado."),
    ],
  });
  assert.ok(m.repeticaoEntreCapitulos < 0.2, `repeticao alta demais: ${m.repeticaoEntreCapitulos}`);
});

test("nao ficcao nao roda exemplosRepetidos sem resumos (medir simples)", () => {
  const m = medir({ caminhoCategoria: NAO_FICCAO, capitulos: [cap(0, "texto")] });
  assert.equal(m.exemplosRepetidos, 0);
});

test("medirComResumos detecta exemplo repetido em nao ficcao", () => {
  const capitulos = [
    { idx: 0, content: "texto 1", resumoFatos: "Explica margem de contribuição usando o exemplo da padaria com pão francês." },
    { idx: 1, content: "texto 2", resumoFatos: "Explica ponto de equilíbrio usando o exemplo da padaria com pão francês." },
  ];
  const m = medirComResumos(NAO_FICCAO, capitulos);
  assert.equal(m.exemplosRepetidos, 1);
});

test("medirComResumos nao roda a checagem de exemplo em ficcao", () => {
  const capitulos = [
    { idx: 0, content: "texto 1", resumoFatos: "Ana encontra Lucas na praia ao entardecer." },
    { idx: 1, content: "texto 2", resumoFatos: "Ana encontra Lucas na praia ao entardecer." },
  ];
  const m = medirComResumos(ROMANCE, capitulos);
  assert.equal(m.exemplosRepetidos, 0);
});
