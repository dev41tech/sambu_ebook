import test from "node:test";
import assert from "node:assert/strict";
import { verificarFatosNumericos } from "./fatosNumericos";

test("regressao do caso real: 'quinze anos' no capitulo 1, 'vinte anos' (parafraseado) no climax", () => {
  // "Móveis de Memórias": capítulo 1 diz "Quase quinze anos"; capítulo 14, no
  // clímax, diz "vinte anos" -- e usa "ausência", não "desapareceu", a mesma
  // palavra do fato fixo. O detector precisa reconhecer a paráfrase.
  const fatosFixos = ["A irmã de Carolina, Clara, desapareceu há quinze anos."];
  const trechos = [
    { local: "capítulo 1", texto: "Quase quinze anos. Fora há todo esse tempo que ela deixou a cidade." },
    { local: "capítulo 14", texto: 'Carolina disse: "Eu já tive vinte anos para enfrentar a ausência da minha irmã."' },
  ];
  const achados = verificarFatosNumericos(fatosFixos, trechos);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].categoria, "fato-numerico-inconsistente");
  assert.equal(achados[0].gravidade, "blocker");
  assert.equal(achados[0].local, "capítulo 14");
});

test("livro consistente nao gera achado", () => {
  const fatosFixos = ["A irmã de Carolina, Clara, desapareceu há quinze anos."];
  const trechos = [
    { local: "capítulo 1", texto: "Quase quinze anos se passaram desde o desaparecimento." },
    { local: "capítulo 14", texto: "Ela já tinha quinze anos de dúvidas sobre a ausência da irmã." },
  ];
  assert.equal(verificarFatosNumericos(fatosFixos, trechos).length, 0);
});

test("idades de personagens nao disparam falso positivo", () => {
  // Bug real pego pelo proprio teste: usar o nome "Carolina" como palavra-chave
  // do fato fazia a idade dela (numero legitimo, sem relacao) acusar
  // contradicao so por estar perto do nome.
  const fatosFixos = ["A irmã de Carolina, Clara, desapareceu há quinze anos."];
  const trechos = [
    { local: "capítulo 1", texto: "Carolina tinha trinta e quatro anos. Eduardo tinha trinta e sete anos." },
  ];
  assert.equal(verificarFatosNumericos(fatosFixos, trechos).length, 0);
});

test("numero por extenso composto (vinte e dois vs vinte e cinco)", () => {
  const fatosFixos = ["O prazo era de vinte e dois anos."];
  const trechos = [{ local: "cap X", texto: "O prazo do contrato, ainda em vigor, era de vinte e cinco anos." }];
  const achados = verificarFatosNumericos(fatosFixos, trechos);
  assert.equal(achados.length, 1);
  assert.match(achados[0].evidencia, /vinte e cinco/);
});

test("digito e extenso sao equivalentes (15 == quinze)", () => {
  const fatosFixos = ["A empresa foi fundada há 15 anos."];
  const trechos = [{ local: "cap Y", texto: "A fundação da empresa, ocorrida há quinze anos, mudou tudo." }];
  assert.equal(verificarFatosNumericos(fatosFixos, trechos).length, 0);
});

test("fato sem numero nao gera checagem nenhuma", () => {
  const fatosFixos = ["Clara é a irmã desaparecida de Carolina."];
  const trechos = [{ local: "cap Z", texto: "Vinte anos depois, tudo mudou. Trinta anos antes, nada disso existia." }];
  assert.equal(verificarFatosNumericos(fatosFixos, trechos).length, 0);
});

test("lista de fatos fixos vazia nao quebra", () => {
  assert.deepEqual(verificarFatosNumericos([], [{ local: "cap A", texto: "vinte anos" }]), []);
});

test("lista de trechos vazia nao quebra", () => {
  assert.deepEqual(verificarFatosNumericos(["algo com dez anos"], []), []);
});

test("mesmo fato contra dois trechos diferentes gera um achado por local", () => {
  const fatosFixos = ["A guerra durou dez anos."];
  const trechos = [
    { local: "cap 1", texto: "A guerra, que durou doze anos, arrasou a região." },
    { local: "cap 2", texto: "Relembrando a guerra de doze anos, ele chorou." },
  ];
  const achados = verificarFatosNumericos(fatosFixos, trechos);
  assert.equal(achados.length, 2);
  assert.deepEqual(achados.map((a) => a.local).sort(), ["cap 1", "cap 2"]);
});
