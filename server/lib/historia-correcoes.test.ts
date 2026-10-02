// Testes das 4 correções de 02/10/2026, depois de "Depois da Última Chave".
import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarEstrutura, problemasDoEnredo, tramaBlock } from "./historia";
import { juntarContinuacao } from "./ai";
import { excessoDe, faixaPedida, registrarEntrega, zerarCalibragem } from "./calibragem";
import type { Outline, OutlineChapter } from "./ai";

const cap = (funcao: OutlineChapter["funcao"]): OutlineChapter => ({ title: "t", summary: "s", funcao, personagens: [] });

// A estrutura exata do livro analisado: 5 capítulos, sem clímax.
function semClimax(): Outline {
  return {
    title: "Depois da Última Chave",
    subtitle: "",
    chapters: [cap("apresentacao"), cap("complicacao"), cap("virada"), cap("crise"), cap("desfecho")],
  };
}

// ---------- correção 2: uma só verdade, todo fio fecha ----------

test("sumário sem verdade central ou sem fios é recusado", () => {
  const p = problemasDoEnredo(semClimax()).join(" ");
  assert.match(p, /Falta "verdadeCentral"/);
  assert.match(p, /Falta "fios"/);
});

test("fio sem resposta ou com capítulo fora do livro é recusado", () => {
  const o = semClimax();
  o.verdadeCentral = "Sofia roubou o dossiê sozinha; Miguel soube depois e se calou.";
  o.fios = [
    { fio: "a foto escondida", resposta: "", fechaNoCapitulo: 3 },
    { fio: "o envelope anônimo", resposta: "foi a Rita", fechaNoCapitulo: 9 },
  ];
  const p = problemasDoEnredo(o).join(" ");
  assert.match(p, /"a foto escondida" está sem "resposta"/);
  assert.match(p, /"o envelope anônimo" precisa de "fechaNoCapitulo" entre 1 e 5/);
});

test("bloco da trama: verdade em todo capítulo, fios só onde fecham, pendentes no último", () => {
  const o = semClimax();
  o.verdadeCentral = "Sofia roubou o dossiê sozinha; Miguel soube depois e se calou.";
  o.fios = [
    { fio: "a foto escondida", resposta: "Sofia guardou como seguro contra Miguel", fechaNoCapitulo: 3 },
    { fio: "o envelope anônimo", resposta: "foi a Rita, para alertar Clara", fechaNoCapitulo: 5 },
  ];
  const c1 = tramaBlock(o, 0);
  assert.match(c1, /VERDADE DA TRAMA .*Sofia roubou o dossiê sozinha/);
  assert.doesNotMatch(c1, /FIOS QUE FECHAM/);
  assert.match(tramaBlock(o, 2), /FIOS QUE FECHAM NESTE CAPÍTULO[\s\S]*a foto escondida → Sofia guardou/);
  const ultimo = tramaBlock(o, 4);
  assert.match(ultimo, /o envelope anônimo → foi a Rita/);
  assert.match(ultimo, /abertos antes:[\s\S]*a foto escondida/);
});

test("livro de não ficção (sem verdade nem fios) não recebe bloco da trama", () => {
  assert.equal(tramaBlock({ title: "x", subtitle: "", chapters: [cap(undefined)] }, 0), "");
});

// ---------- correção 3: clímax obrigatório ----------

test("sem clímax: o penúltimo capítulo vira clímax (o caso de 'Depois da Última Chave')", () => {
  const o = semClimax();
  const ajustes = ajustarEstrutura(o);
  assert.deepEqual(o.chapters.map((c) => c.funcao), ["apresentacao", "complicacao", "virada", "climax", "desfecho"]);
  assert.deepEqual(ajustes, ["cap. 4: crise -> climax"]);
  assert.doesNotMatch(problemasDoEnredo(o).join(" "), /climax|clímax|desfecho/i);
});

test("clímax cedo demais, dois clímax e desfecho no meio são corrigidos", () => {
  const o: Outline = {
    title: "x",
    subtitle: "",
    chapters: [cap("apresentacao"), cap("climax"), cap("desfecho"), cap("climax"), cap("crise"), cap("crise"), cap("crise"), cap("crise"), cap("climax"), cap("virada")],
  };
  ajustarEstrutura(o);
  const f = o.chapters.map((c) => c.funcao);
  assert.equal(f[9], "desfecho");
  assert.equal(f.filter((x) => x === "climax").length, 1);
  assert.equal(f[8], "climax"); // já estava na reta final: é mantido
  assert.equal(f[2], "crise");
});

test("estrutura já correta não é tocada", () => {
  const o = semClimax();
  o.chapters[3].funcao = "climax";
  assert.deepEqual(ajustarEstrutura(o), []);
});

// ---------- correção 1: continuar em vez de cortar ----------

test("continuação cola no meio da frase e abre parágrafo depois de frase completa", () => {
  assert.equal(juntarContinuacao("Helena virou-se para", "ela e disse."), "Helena virou-se para ela e disse.");
  assert.equal(juntarContinuacao("— E eu?\n\nHelena virou-se para ela.", "— Você sai daqui sem nada."), "— E eu?\n\nHelena virou-se para ela.\n\n— Você sai daqui sem nada.");
  assert.equal(juntarContinuacao("texto completo.", "   "), "texto completo.");
});

// ---------- correção 4: calibragem de tamanho ----------

test("pede menos ao modelo que escreve demais, e aprende com o que ele entrega", () => {
  zerarCalibragem();
  const modelo = "gpt-5.4-mini-2026-03-17";
  assert.equal(excessoDe(modelo), 1.7);
  const f1 = faixaPedida(modelo, 1500);
  assert.equal(f1.piso, Math.round(1500 / 1.7));
  // entregou 2.400 para um piso de 882 (2,72x, limitado a 2,5): o excesso sobe
  const novo = registrarEntrega(modelo, f1.piso, 2400);
  assert.ok(novo > 1.7 && novo <= 2.5, String(novo));
  // modelo antigo (gpt-4o) não é corrigido
  assert.equal(faixaPedida("gpt-4o", 1500).piso, 1500);
  // capítulo que veio curto demais (recusa/erro) não ensina nada
  zerarCalibragem();
  assert.equal(registrarEntrega(modelo, 1000, 100), 1.7);
});
