import { test } from "node:test";
import assert from "node:assert/strict";
import {
  achadosDaLeitura,
  achadosEditoriaisSalvos,
  correcaoDaAuditoria,
  normalizarAuditoria,
  tiquesRepetidos,
  viciosBlock,
  viciosDeIA,
} from "./editorial";

test("vícios de IA: conta as muletas e ignora o uso normal das palavras", () => {
  const texto =
    "Helena respirou fundo. Soltou um riso curto, sem humor. Engoliu em seco e passou a mão pela nuca. " +
    "Ela respirou e seguiu. O silêncio que se seguiu foi longo. Rita soltou uma risada curta, sem humor.";
  const v = viciosDeIA(texto);
  const rotulos = Object.fromEntries(v.termos.map((t) => [t.termo, t.vezes]));
  assert.equal(rotulos["riso/risada sem humor"], 2);
  assert.equal(rotulos["respirou fundo"], 1);
  assert.equal(rotulos["engoliu em seco"], 1);
  assert.equal(rotulos["passou a mão na nuca/pelos cabelos"], 1);
  assert.equal(rotulos["o silêncio que se seguiu / se instalou"], 1);
  assert.ok(v.porMil > 100);
  assert.equal(viciosDeIA("Ela respirou e abriu a janela da cozinha.").termos.length, 0);
  assert.match(viciosBlock(), /EVITE estas muletas/);
});

test("tiques: frase repetida em 3 capítulos aparece; nome do elenco e 2 capítulos não", () => {
  const caps = [
    { idx: 0, content: "Miguel passou a mão pela nuca devagar. A chuva caía na janela do ateliê." },
    { idx: 1, content: "Sem resposta, Miguel passou a mão pela nuca outra vez. Helena olhou para Miguel calada." },
    { idx: 2, content: "Ele passou a mão pela nuca e desviou. Helena olhou para Miguel calada." },
    { idx: 3, content: "Clara serviu a sopa quente e esperou. Helena olhou para Miguel calada." },
  ];
  const t = tiquesRepetidos(caps, ["Helena Duarte", "Miguel Azevedo"]);
  assert.ok(t.some((x) => x.frase.includes("mão pela nuca") && x.capitulos.length === 3), JSON.stringify(t));
  assert.ok(!t.some((x) => x.frase.includes("olhou")), "frase com nome do elenco não é tique");
  assert.equal(tiquesRepetidos(caps.slice(0, 2)).length, 0, "2 capítulos não bastam");
});

test("auditoria: grave reprova, leve aprova, lixo aprova (não trava o livro)", () => {
  const r = normalizarAuditoria({
    problemas: [
      { tipo: "fio-nao-fechado", gravidade: "grave", evidencia: "a foto não é explicada", correcao: "Revele quem escondeu a foto e por quê." },
      { tipo: "cena-repetida", gravidade: "leve", evidencia: "confronto parecido com o cap. 2", correcao: "Varie a cena." },
      { tipo: "gosto-pessoal", gravidade: "grave", evidencia: "x", correcao: "y" },
      { tipo: "final-aberto", gravidade: "grave", evidencia: "x", correcao: "" },
    ],
  });
  assert.equal(r.aprovado, false);
  assert.equal(r.problemas.length, 2, "tipo desconhecido e problema sem correção são descartados");
  const c = correcaoDaAuditoria(r);
  assert.match(c, /Revele quem escondeu a foto/);
  assert.doesNotMatch(c, /Varie a cena/, "leve não entra na reescrita");
  assert.equal(normalizarAuditoria({ problemas: [{ tipo: "cena-repetida", gravidade: "leve", correcao: "x" }] }).aprovado, true);
  assert.deepEqual(normalizarAuditoria("lixo"), { aprovado: true, problemas: [] });
  assert.equal(correcaoDaAuditoria({ aprovado: true, problemas: [] }), "");
});

test("leitura editorial vira achados; final que não satisfaz é major, nunca blocker", () => {
  const a = achadosDaLeitura({
    editor: [
      { aspecto: "repetição de cenas", gravidade: "grave", evidencia: "o mesmo confronto nos caps. 2 a 5", sugestao: "Fundir as cenas.", capitulos: [2, 3, 4, 5] },
      { aspecto: "sem evidência", gravidade: "grave", evidencia: "", sugestao: "x" },
    ],
    leitora: { nota: 5, perdeuInteresseEm: ["capítulo 3"], naoEntendeu: ["quem mandou a foto"], finalSatisfaz: false, comentario: "Termina no meio." },
  });
  assert.equal(a.length, 2);
  assert.equal(a[0].categoria, "editorial-repeticao");
  assert.equal(a[0].gravidade, "major");
  assert.deepEqual(a[0].capitulosAfetados, [1, 2, 3, 4]);
  assert.equal(a[1].categoria, "editorial-leitora");
  assert.equal(a[1].gravidade, "major");
  assert.match(a[1].evidencia, /nota 5\/10 .*não entendeu: quem mandou a foto.*o final NÃO satisfez/);
  assert.ok(a.every((x) => x.gravidade !== "blocker"));
  assert.deepEqual(achadosDaLeitura(null), []);
});

test("painel preserva só os achados editoriais gravados, rebaixando blocker", () => {
  const json = JSON.stringify([
    { categoria: "personagem-abandonado", gravidade: "warning", local: "x", evidencia: "x", sugestao: "x" },
    { categoria: "editorial-leitora", gravidade: "blocker", local: "x", evidencia: "x", sugestao: "x" },
  ]);
  const s = achadosEditoriaisSalvos(json);
  assert.equal(s.length, 1);
  assert.equal(s[0].gravidade, "major");
  assert.deepEqual(achadosEditoriaisSalvos("não é json"), []);
  assert.deepEqual(achadosEditoriaisSalvos(null), []);
});
