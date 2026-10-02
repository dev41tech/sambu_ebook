import { test } from "node:test";
import assert from "node:assert/strict";
import { guiaDe, guiaDoModo, juntarGuias, parseGuia, SECOES, slugDoGenero } from "./guias";
import { problemasDaTese, teseBlock, perguntasDoCapitulo } from "./naoFiccao";
import { encurtarNomes, resumoParaEditor } from "./editorial";

test("resumo para o editor perde as anotações de pendência, que não estão no livro", () => {
  const r = resumoParaEditor(
    "Usa Ana, com R$ 2.400 líquidos e sobra de R$ 510. Ficou pendente conferir salário mínimo e regras oficiais atualizadas. Define limite de R$ 300.",
  );
  assert.equal(r, "Usa Ana, com R$ 2.400 líquidos e sobra de R$ 510. Define limite de R$ 300.");
  assert.equal(resumoParaEditor("Ficaram pendentes juros exatos, CET e tarifas."), "");
  assert.equal(resumoParaEditor(null), "");
});
import type { Outline } from "./ai";

test("todo modo tem guia com as 5 seções preenchidas (o deploy não pode perder regras)", () => {
  for (const modo of ["narrativo", "saude", "comportamento", "financas", "tecnico", "pratico"] as const) {
    const g = guiaDoModo(modo);
    for (const s of SECOES) assert.ok(g[s].length > 40, `${modo}: seção "${s}" vazia`);
  }
  assert.match(guiaDoModo("narrativo").escrita, /^ESTE LIVRO É FICÇÃO/);
  assert.match(guiaDoModo("financas").escrita, /exemplo numérico fechado/);
});

test("parse: seções por título, acentos e título do arquivo ignorados", () => {
  const g = parseGuia("# Guia X\n\nintro\n\n## Promessa\nP1\n\n## Seção estranha\nignorar\n\n## Escrita\nE1\nE2\n## Leitora\nL1");
  assert.equal(g.promessa, "P1");
  assert.equal(g.escrita, "E1\nE2");
  assert.equal(g.leitora, "L1");
  assert.equal(g.estrutura, "");
  assert.ok(!Object.values(g).some((v) => v.includes("ignorar") || v.includes("intro")));
});

test("gênero soma ao modo: romance traz narrativo + romance; não ficção só o modo", () => {
  assert.equal(slugDoGenero("Suspense e mistério > Thriller psicológico"), "suspense-e-misterio");
  const romance = guiaDe("Romance > Romance contemporâneo");
  assert.match(romance.escrita, /^ESTE LIVRO É FICÇÃO[\s\S]*A tensão do casal/);
  assert.match(romance.promessa, /O centro do livro é o casal/);
  const financas = guiaDe("Negócios e finanças > Finanças pessoais e dívidas");
  assert.match(financas.escrita, /^Livro sobre dinheiro/);
  assert.equal(juntarGuias(financas, null), financas);
});

const cap = () => ({ title: "t", summary: "s" });

test("não ficção: tese e perguntas conferidas e levadas ao capítulo", () => {
  const o: Outline = {
    title: "x",
    subtitle: "",
    chapters: [cap(), cap(), cap(), cap(), cap(), cap()],
    tese: "Dívida se resolve com ordem, não com renda extra.",
    perguntasDoLeitor: [
      { pergunta: "Por qual dívida começo?", capitulo: 1 },
      { pergunta: "Vale pegar empréstimo para quitar?", capitulo: 2 },
      { pergunta: "Como negociar com o banco?", capitulo: 3 },
      { pergunta: "E se a renda não cobre o mínimo?", capitulo: 4 },
      { pergunta: "Quanto guardar depois?", capitulo: 5 },
      { pergunta: "Como não voltar a dever?", capitulo: 6 },
    ],
  };
  assert.deepEqual(problemasDaTese(o), []);
  assert.match(teseBlock(o, 1), /TESE DO LIVRO: Dívida[\s\S]*Vale pegar empréstimo/);
  assert.deepEqual(perguntasDoCapitulo(o, 2), ["Como negociar com o banco?"]);

  const ruim: Outline = { ...o, tese: "", perguntasDoLeitor: [{ pergunta: "a", capitulo: 1 }, { pergunta: "b", capitulo: 9 }] };
  const p = problemasDaTese(ruim).join("\n");
  assert.match(p, /Falta "tese"/);
  assert.match(p, /Faltam "perguntasDoLeitor"/);
  const semResposta: Outline = { ...o, perguntasDoLeitor: o.perguntasDoLeitor!.slice(0, 3) };
  assert.match(problemasDaTese(semResposta).join(), /capítulos 4, 5, 6 não respondem/);
  assert.equal(teseBlock({ title: "x", subtitle: "", chapters: [cap()] }, 0), "");
});

test("nome completo só na primeira menção; nome curto repetido no elenco fica por extenso", () => {
  const elenco = ["Joana Martins", "Rafael Duarte", "Dona Célia Martins", "Ana Souza", "Ana Lima"];
  const texto =
    "Joana Martins abriu a porta. Rafael Duarte entrou. — Joana Martins, escuta — disse Rafael Duarte. " +
    "Dona Célia Martins olhou. Dona Célia Martins sorriu. Ana Souza e Ana Lima saíram. Ana Souza voltou. Joana Martinsson não é ela.";
  const r = encurtarNomes(texto, elenco);
  assert.match(r, /^Joana Martins abriu a porta\. Rafael Duarte entrou\. — Joana, escuta — disse Rafael\./);
  assert.match(r, /Dona Célia Martins olhou\. Dona Célia sorriu\./);
  assert.match(r, /Ana Souza e Ana Lima saíram\. Ana Souza voltou\./, "duas Anas: nada encurta");
  assert.match(r, /Joana Martinsson não é ela/, "nome dentro de outra palavra não é tocado");
});
