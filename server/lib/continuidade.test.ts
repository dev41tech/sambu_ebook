import test from "node:test";
import assert from "node:assert/strict";
import { extrairNomes, verificarContinuidade } from "./continuidade";

test("nome terminado em letra acentuada nao e truncado (bug real: 'Você' virava 'Voc')", () => {
  // \b em JS usa a definicao ASCII de "caractere de palavra" -- nao reconhece
  // acento. "Você" perdia o "ê" final e virava "Voc"; "José" virava "Jos". Se
  // um personagem se chamasse Jose de verdade, o nome comparado contra o
  // elenco nunca seria o nome inteiro, e ele batia como "nao autorizado"
  // contra o proprio elenco que o declara.
  assert.deepEqual([...extrairNomes("Ana olhou para José e sorriu, e José sorriu de volta.").keys()], ["José"]);
});

test("nome acentuado no meio da frase e contado corretamente, nao truncado", () => {
  const m = extrairNomes("Renê chegou cedo. Ninguém esperava Renê tão cedo assim.");
  assert.equal(m.get("Renê"), 2);
  assert.equal(m.get("Ren"), undefined); // versao truncada nao deve existir
});

test("palavra de um fato fixo (cidade, negocio, evento) nao vira 'personagem nao autorizado'", () => {
  // Efeito colateral real do proprio mecanismo de fatos fixos funcionando:
  // pedir para repetir "Colinas do Mar" e "Padaria da Praia" sem variar fez
  // essas palavras aparecerem dezenas de vezes cada, e cada uma isolada virou
  // um falso "personagem nao autorizado" -- 7 avisos falsos de uma vez em
  // "Amor na Esquina" regenerado.
  const outline = {
    title: "T",
    subtitle: "S",
    chapters: Array.from({ length: 6 }, (_, i) => ({ title: `Cap ${i + 1}`, summary: "" })),
    personagens: [
      { nome: "Ana Clara", papel: "protagonista", descricao: "x" },
      { nome: "Caio", papel: "par romantico", descricao: "y" },
    ],
    fatosFixos: [
      "A cidade se chama Colinas do Mar.",
      "A padaria se chama Padaria da Praia.",
      "O evento conjunto se chama Sabores da Esquina.",
    ],
  };
  const frase = (palavra: string) =>
    `Em Colinas do Mar, perto da Padaria da Praia, Ana Clara pensava no Sabores da Esquina enquanto ${palavra}. `;
  const capitulos = Array.from({ length: 6 }, (_, i) => ({
    idx: i,
    title: `Cap ${i + 1}`,
    content: frase("conversava com Caio").repeat(3),
  }));
  const achados = verificarContinuidade({ outline, intro: null, conclusao: null, capitulos, ficcao: true });
  const nomesFalsos = achados
    .filter((a) => a.categoria === "personagem-nao-autorizado")
    .map((a) => a.evidencia);
  assert.deepEqual(nomesFalsos, [], `nao deveria sinalizar palavras de fatos fixos: ${JSON.stringify(nomesFalsos)}`);
});

test("'Você' nao e mais tratado como personagem (era pronome sem estar na lista de exclusao)", () => {
  const capitulos = Array.from({ length: 6 }, (_, i) => ({
    idx: i,
    title: `Cap ${i + 1}`,
    content: "— Você já sabia disso? — perguntou Ana. — Acho que você sempre soube — respondeu Caio, olhando para você mesmo sem saber o que dizer. ".repeat(3),
  }));
  const outline = {
    title: "T", subtitle: "S",
    chapters: capitulos.map((c) => ({ title: c.title, summary: "" })),
    personagens: [
      { nome: "Ana", papel: "protagonista", descricao: "x" },
      { nome: "Caio", papel: "par romantico", descricao: "y" },
    ],
  };
  const achados = verificarContinuidade({ outline, intro: null, conclusao: null, capitulos, ficcao: true });
  assert.ok(
    !achados.some((a) => a.categoria === "personagem-nao-autorizado" && /Voc/.test(a.evidencia)),
    JSON.stringify(achados),
  );
});

test("lugar citado so na descricao do elenco tambem e excluido (caso real: 'Sao Paulo')", () => {
  // "recem-chegado de Sao Paulo" so existe na descricao do personagem, nao
  // num fato fixo -- e "Paulo" sozinho ainda assim nao pode virar personagem.
  const outline = {
    title: "T", subtitle: "S",
    chapters: Array.from({ length: 6 }, (_, i) => ({ title: `Cap ${i + 1}`, summary: "" })),
    personagens: [
      { nome: "Ana", papel: "protagonista", descricao: "x" },
      { nome: "Caio", papel: "par romantico", descricao: "32 anos, recém-chegado de São Paulo" },
    ],
  };
  const capitulos = Array.from({ length: 6 }, (_, i) => ({
    idx: i,
    title: `Cap ${i + 1}`,
    content: "Caio falava sobre Paulo, o amigo que ficou em São Paulo, quase todo santo dia. Sentia falta de Paulo. ".repeat(3),
  }));
  const achados = verificarContinuidade({ outline, intro: null, conclusao: null, capitulos, ficcao: true });
  assert.ok(
    !achados.some((a) => a.categoria === "personagem-nao-autorizado" && /Paulo/.test(a.evidencia)),
    JSON.stringify(achados),
  );
});
