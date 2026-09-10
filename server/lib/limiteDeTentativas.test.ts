import test from "node:test";
import assert from "node:assert/strict";
import {
  esperaRestante,
  registrarFalha,
  registrarSucesso,
  zerarTudo,
  PARA_TESTE,
} from "./limiteDeTentativas";

const { MAX_FALHAS, JANELA_MS, BLOQUEIO_MS } = PARA_TESTE;
const T0 = 1_700_000_000_000;

test("origem nova pode tentar", () => {
  zerarTudo();
  assert.equal(esperaRestante("1.2.3.4", T0), 0);
});

test("bloqueia ao chegar no teto de falhas", () => {
  zerarTudo();
  for (let i = 0; i < MAX_FALHAS - 1; i++) {
    assert.equal(registrarFalha("1.2.3.4", T0 + i), false, `falha ${i + 1} não devia bloquear`);
  }
  assert.equal(registrarFalha("1.2.3.4", T0 + MAX_FALHAS), true, "a última devia bloquear");
  assert.ok(esperaRestante("1.2.3.4", T0 + MAX_FALHAS) > 0);
});

test("o bloqueio expira", () => {
  zerarTudo();
  // O bloqueio conta a partir da ULTIMA falha, não da primeira.
  let ultimaFalha = T0;
  for (let i = 0; i < MAX_FALHAS; i++) {
    ultimaFalha = T0 + i;
    registrarFalha("1.2.3.4", ultimaFalha);
  }
  assert.ok(esperaRestante("1.2.3.4", ultimaFalha + BLOQUEIO_MS - 1000) > 0);
  assert.equal(esperaRestante("1.2.3.4", ultimaFalha + BLOQUEIO_MS + 1), 0);
});

test("depois do bloqueio expirar, uma falha sozinha nao bloqueia de novo", () => {
  // Sem zerar a contagem junto com o bloqueio, a primeira tentativa depois da
  // espera cairia direto em bloqueado outra vez, e a origem nunca sairia disso.
  zerarTudo();
  let ultimaFalha = T0;
  for (let i = 0; i < MAX_FALHAS; i++) {
    ultimaFalha = T0 + i;
    registrarFalha("1.2.3.4", ultimaFalha);
  }
  const depois = ultimaFalha + BLOQUEIO_MS + 1;
  assert.equal(esperaRestante("1.2.3.4", depois), 0);
  assert.equal(registrarFalha("1.2.3.4", depois), false);
  assert.equal(esperaRestante("1.2.3.4", depois), 0);
});

test("falhas espalhadas alem da janela nao acumulam", () => {
  zerarTudo();
  for (let i = 0; i < MAX_FALHAS * 3; i++) {
    // uma falha por janela: nunca deve bloquear
    assert.equal(registrarFalha("1.2.3.4", T0 + i * (JANELA_MS + 1)), false);
  }
  assert.equal(esperaRestante("1.2.3.4", T0 + MAX_FALHAS * 3 * (JANELA_MS + 1)), 0);
});

test("login que deu certo limpa o historico", () => {
  zerarTudo();
  for (let i = 0; i < MAX_FALHAS - 1; i++) registrarFalha("1.2.3.4", T0 + i);
  registrarSucesso("1.2.3.4");
  // A contagem voltou do zero: ainda faltam MAX_FALHAS para bloquear.
  for (let i = 0; i < MAX_FALHAS - 1; i++) {
    assert.equal(registrarFalha("1.2.3.4", T0 + 100 + i), false);
  }
});

test("origens diferentes sao contadas em separado", () => {
  zerarTudo();
  for (let i = 0; i < MAX_FALHAS; i++) registrarFalha("1.2.3.4", T0 + i);
  assert.ok(esperaRestante("1.2.3.4", T0 + MAX_FALHAS) > 0);
  assert.equal(esperaRestante("5.6.7.8", T0 + MAX_FALHAS), 0, "bloquear um IP não pode bloquear os outros");
});
