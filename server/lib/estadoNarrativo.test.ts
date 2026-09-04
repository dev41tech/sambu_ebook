import test from "node:test";
import assert from "node:assert/strict";
import { separarEstado, elencoAcumulado, type CapituloEscrito, type Outline } from "./ai";

// O bloco de estado é o que faz um capítulo chegar ao seguinte. Se o parser
// falhar em silêncio, o livro volta a ser 75 capítulos independentes — e o
// sintoma (personagem que aparece uma vez e some) reaparece sem nenhum erro no
// log. Por isso ele é testado, e não só o caminho feliz.

const MARCA = "===ESTADO===";

function outlineFake(personagens: Outline["personagens"] = []): Outline {
  return { title: "Livro", subtitle: "sub", chapters: [], personagens };
}

test("separa a prosa do bloco de estado", () => {
  const bruto = `Ana chegou tarde e não avisou ninguém.

${MARCA}
{"resumo": "Ana chega tarde e esconde de Lucas.", "personagensNovos": [{"nome": "Dona Tereza", "papel": "apoio", "descricao": "vizinha que viu tudo"}], "fiosAbertos": ["Lucas ainda não sabe do atraso"]}`;

  const { texto, estado } = separarEstado(bruto);
  assert.equal(texto, "Ana chegou tarde e não avisou ninguém.");
  assert.equal(estado?.resumo, "Ana chega tarde e esconde de Lucas.");
  assert.equal(estado?.personagensNovos[0].nome, "Dona Tereza");
  assert.deepEqual(estado?.fiosAbertos, ["Lucas ainda não sabe do atraso"]);
});

test("capítulo sem bloco de estado é devolvido inteiro", () => {
  const { texto, estado } = separarEstado("  Só a prosa, sem registro.  ");
  assert.equal(texto, "Só a prosa, sem registro.");
  assert.equal(estado, null);
});

test("JSON quebrado não vaza a marca para dentro do livro", () => {
  // O pior caso possível: o registro se perde, mas publicar o capítulo com
  // "===ESTADO=== {..." colado no fim seria pior do que perdê-lo.
  const { texto, estado } = separarEstado(`Prosa boa.\n\n${MARCA}\n{"resumo": "cortado no me`);
  assert.equal(texto, "Prosa boa.");
  assert.equal(estado, null);
  assert.ok(!texto.includes(MARCA));
});

test("bloco de estado em cerca de código também é lido", () => {
  const bruto = `Prosa.\n\n${MARCA}\n\`\`\`json\n{"resumo": "aconteceu algo", "personagensNovos": [], "fiosAbertos": []}\n\`\`\``;
  const { estado } = separarEstado(bruto);
  assert.equal(estado?.resumo, "aconteceu algo");
});

test("campos ausentes ou de tipo errado viram valores vazios, não exceção", () => {
  const { estado } = separarEstado(`Prosa.\n${MARCA}\n{"resumo": 42, "personagensNovos": "ninguém"}`);
  assert.equal(estado?.resumo, "42");
  assert.deepEqual(estado?.personagensNovos, []);
  assert.deepEqual(estado?.fiosAbertos, []);
});

test("personagem sem nome é descartado", () => {
  const { estado } = separarEstado(
    `Prosa.\n${MARCA}\n{"resumo": "x", "personagensNovos": [{"papel": "apoio"}, {"nome": "Rita"}], "fiosAbertos": []}`,
  );
  assert.deepEqual(
    estado?.personagensNovos.map((p) => p.nome),
    ["Rita"],
  );
});

test("elenco acumulado junta o sumário com quem nasceu na prosa", () => {
  const outline = outlineFake([
    { nome: "Ana", papel: "protagonista", descricao: "fisioterapeuta" },
  ]);
  const escritos: CapituloEscrito[] = [
    {
      idx: 0,
      title: "Um",
      estado: {
        resumo: "r",
        personagensNovos: [{ nome: "Dona Tereza", papel: "apoio", descricao: "vizinha" }],
        fiosAbertos: [],
      },
    },
  ];
  assert.deepEqual(
    elencoAcumulado(outline, escritos).map((p) => p.nome),
    ["Ana", "Dona Tereza"],
  );
});

test("elenco acumulado não duplica quem já estava no sumário", () => {
  const outline = outlineFake([{ nome: "Ana", papel: "protagonista", descricao: "x" }]);
  const escritos: CapituloEscrito[] = [
    {
      idx: 0,
      title: "Um",
      estado: {
        resumo: "r",
        // O modelo às vezes "registra" alguém que já existe, com outra caixa.
        personagensNovos: [{ nome: "ana", papel: "apoio", descricao: "y" }],
        fiosAbertos: [],
      },
    },
  ];
  assert.deepEqual(
    elencoAcumulado(outline, escritos).map((p) => p.nome),
    ["Ana"],
  );
});

test("o elenco do sumário nunca é cortado pelo teto de registrados", () => {
  // Num livro de 75 capítulos os registrados passariam do teto e empurrariam os
  // protagonistas para fora do prompt — que é o defeito que tudo isto corrige.
  const outline = outlineFake([{ nome: "Ana", papel: "protagonista", descricao: "x" }]);
  const escritos: CapituloEscrito[] = Array.from({ length: 40 }, (_, i) => ({
    idx: i,
    title: `Cap ${i}`,
    estado: {
      resumo: "r",
      personagensNovos: [{ nome: `Figurante ${i}`, papel: "apoio", descricao: "z" }],
      fiosAbertos: [],
    },
  }));

  const elenco = elencoAcumulado(outline, escritos);
  assert.equal(elenco[0].nome, "Ana");
  assert.equal(elenco.length, 13); // 1 do sumário + o teto de 12 registrados
  assert.equal(elenco.at(-1)!.nome, "Figurante 39"); // mantém os mais recentes
});

test("capítulo sem estado não derruba o elenco acumulado", () => {
  const outline = outlineFake([{ nome: "Ana", papel: "protagonista", descricao: "x" }]);
  const escritos: CapituloEscrito[] = [{ idx: 0, title: "Um", estado: null }];
  assert.deepEqual(
    elencoAcumulado(outline, escritos).map((p) => p.nome),
    ["Ana"],
  );
});
