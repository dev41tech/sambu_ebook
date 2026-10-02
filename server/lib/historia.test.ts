import { test } from "node:test";
import assert from "node:assert/strict";
import { inicioRetaFinal, problemasDoEnredo, retaFinalBlock, tamanhoRetaFinal } from "./historia";
import type { Outline, OutlineChapter } from "./ai";

function cap(funcao: OutlineChapter["funcao"], personagens: string[]): OutlineChapter {
  return { title: "t", summary: "s", funcao, personagens };
}

// 10 capítulos: reta final = 2 (capítulos 9 e 10).
function livroBom(): Outline {
  return {
    title: "L",
    subtitle: "S",
    personagens: [
      { nome: "Clara Souza", papel: "protagonista", descricao: "x", destino: "fica com a oficina" },
      { nome: "Íris Monteiro", papel: "apoio", descricao: "x", destino: "vira sócia" },
      { nome: "Seu Antônio", papel: "ausente", descricao: "pai morto" },
    ],
    chapters: [
      cap("apresentacao", ["Clara"]),
      cap("complicacao", ["Clara", "Íris"]),
      cap("complicacao", ["Clara"]),
      cap("virada", ["Clara", "Íris"]),
      cap("complicacao", ["Clara"]),
      cap("crise", ["Clara"]),
      cap("crise", ["Clara", "Íris"]),
      cap("virada", ["Clara"]),
      cap("climax", ["Clara", "Íris"]),
      cap("desfecho", ["Clara", "Íris"]),
    ],
  };
}

test("tamanho da reta final: 20%, mínimo 2", () => {
  assert.equal(tamanhoRetaFinal(1), 1);
  assert.equal(tamanhoRetaFinal(5), 2);
  assert.equal(tamanhoRetaFinal(10), 2);
  assert.equal(tamanhoRetaFinal(25), 5);
  assert.equal(inicioRetaFinal(25), 20);
});

test("sumário bem estruturado passa", () => {
  assert.deepEqual(problemasDoEnredo(livroBom()), []);
});

test("história que não termina no último capítulo é recusada", () => {
  const o = livroBom();
  o.chapters[9].funcao = "crise";
  assert.match(problemasDoEnredo(o).join(" "), /último capítulo \(10\) precisa ter funcao "desfecho"/);
});

test("clímax cedo demais é recusado", () => {
  const o = livroBom();
  o.chapters[8].funcao = "crise";
  o.chapters[4].funcao = "climax";
  assert.match(problemasDoEnredo(o).join(" "), /clímax está no capítulo 5, cedo demais/);
});

test("sem clímax, dois clímax ou desfecho antes do fim são recusados", () => {
  const sem = livroBom();
  sem.chapters[8].funcao = "crise";
  assert.match(problemasDoEnredo(sem).join(" "), /Nenhum capítulo tem funcao "climax"/);
  const dois = livroBom();
  dois.chapters[7].funcao = "climax";
  assert.match(problemasDoEnredo(dois).join(" "), /Há 2 capítulos com funcao "climax"/);
  const cedo = livroBom();
  cedo.chapters[5].funcao = "desfecho";
  assert.match(problemasDoEnredo(cedo).join(" "), /capítulo 6 está marcado como "desfecho"/);
});

test("protagonista que some antes da reta final é recusado", () => {
  const o = livroBom();
  o.chapters[8].personagens = ["Íris"];
  o.chapters[9].personagens = ["Íris"];
  assert.match(problemasDoEnredo(o).join(" "), /Clara Souza \(protagonista\) some antes da reta final/);
});

test("personagem que nunca entra em cena ou fica sem destino é recusado", () => {
  const o = livroBom();
  o.personagens!.push({ nome: "Leona Dias", papel: "apoio", descricao: "x" });
  const p = problemasDoEnredo(o).join(" ");
  assert.match(p, /Leona Dias está no elenco mas não entra em cena/);
  const o2 = livroBom();
  delete o2.personagens![1].destino;
  assert.match(problemasDoEnredo(o2).join(" "), /Íris Monteiro está sem "destino"/);
});

test("apoio que só aparece no começo precisa voltar ou ter destino", () => {
  const o = livroBom();
  o.personagens!.push({ nome: "Leona Dias", papel: "apoio", descricao: "x" });
  o.chapters[1].personagens!.push("Leona");
  assert.match(problemasDoEnredo(o).join(" "), /Leona Dias aparece só na primeira metade/);
  o.personagens![3].destino = "muda de cidade no capítulo 3";
  assert.doesNotMatch(problemasDoEnredo(o).join(" "), /Leona/);
});

test("ausente não precisa entrar em cena", () => {
  assert.doesNotMatch(problemasDoEnredo(livroBom()).join(" "), /Antônio/);
});

test("bloco da reta final: vazio antes, cobra destinos no último capítulo", () => {
  const o = livroBom();
  assert.equal(retaFinalBlock(o, 7), "");
  assert.match(retaFinalBlock(o, 8), /RETA FINAL do livro \(capítulo 9 de 10\)/);
  const ultimo = retaFinalBlock(o, 9);
  assert.match(ultimo, /A HISTÓRIA TERMINA AQUI/);
  assert.match(ultimo, /Clara Souza: fica com a oficina/);
  assert.match(ultimo, /Íris Monteiro: vira sócia/);
});
