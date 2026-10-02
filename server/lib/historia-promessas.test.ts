import { test } from "node:test";
import assert from "node:assert/strict";
import type { Outline, OutlineChapter } from "./ai";
import {
  capituloMinimoDaRevelacao,
  capitulosMinimosDaHistoria,
  instrucoesDasPromessas,
  problemasDasPromessas,
  promessasBlock,
  promessasDoPedido,
} from "./historia";
import {
  correcaoDoFinal,
  correcaoDoSumario,
  escolhaDaPremissa,
  normalizarAuditoria,
  normalizarPremissas,
  premissaBlock,
  normalizarAvaliacaoSumario,
  precisaReescreverFinal,
} from "./editorial";

const pedido = {
  theme: "Romance > Romance contemporâneo",
  secondaryCategories: ["Traição"],
  extraInstructions: "Crie um romance, com uma grande traição inesperada e com um final inesperado.",
};

test("promessas: Depois da Última Chave promete romance, revelação e virada", () => {
  assert.deepEqual(promessasDoPedido(pedido), { romance: true, revelacao: true, viradaFinal: true });
  // "crie um romance" na instrução não basta para virar gênero romance
  assert.equal(promessasDoPedido({ theme: "Ficção > Fantasia", extraInstructions: "Crie um romance sobre dragões." }).romance, false);
  assert.deepEqual(promessasDoPedido({ theme: "Ficção > Fantasia" }), { romance: false, revelacao: false, viradaFinal: false });
});

test("capítulos mínimos: cabem as promessas, limitados pela extensão", () => {
  const todas = promessasDoPedido(pedido);
  assert.equal(capitulosMinimosDaHistoria(todas, 7500), 8);
  assert.equal(capitulosMinimosDaHistoria(todas, 4200), 6, "4.200 palavras comportam 6 de 700");
  assert.equal(capitulosMinimosDaHistoria({ romance: false, revelacao: false, viradaFinal: false }, 7500), 5);
  assert.equal(capitulosMinimosDaHistoria(todas, 1000), 3);
});

test("revelação: nunca antes de 70% do livro", () => {
  assert.equal(capituloMinimoDaRevelacao(5), 4);
  assert.equal(capituloMinimoDaRevelacao(8), 6);
  assert.equal(capituloMinimoDaRevelacao(10), 8);
  assert.match(instrucoesDasPromessas(promessasDoPedido(pedido), 8), /capítulo 6 ou depois/);
});

const cap = (o: Partial<OutlineChapter> = {}): OutlineChapter => ({ title: "t", summary: "s", ...o });

function livro(over: Partial<Outline> = {}): Outline {
  const n = 8;
  return {
    title: "x",
    subtitle: "",
    personagens: [
      { nome: "Clara Monteiro", papel: "protagonista", descricao: "" },
      { nome: "Rafael Duarte", papel: "par romantico", descricao: "" },
    ],
    chapters: Array.from({ length: n }, (_, i) =>
      cap({ passoDoCasal: `passo ${i + 1}`, personagens: i < 6 ? ["Clara Monteiro", "Rafael Duarte"] : ["Clara Monteiro"] }),
    ),
    revelacaoNoCapitulo: 7,
    viradaFinal: {
      leitorAcredita: "Rafael traiu",
      verdade: "a avó armou tudo",
      noCapitulo: 8,
      pistas: [
        { pista: "a chave verde", capitulo: 2 },
        { pista: "o caderno", capitulo: 5 },
      ],
    },
    ...over,
  };
}

test("sumário que cumpre as promessas não tem problema", () => {
  assert.deepEqual(problemasDasPromessas(livro(), promessasDoPedido(pedido)), []);
});

test("sumário com revelação cedo, casal parado e virada sem pistas é acusado", () => {
  const o = livro({
    revelacaoNoCapitulo: 3,
    viradaFinal: { leitorAcredita: "a", verdade: "b", noCapitulo: 8, pistas: [{ pista: "só uma", capitulo: 2 }] },
  });
  o.chapters[1].passoDoCasal = "";
  o.chapters[2].passoDoCasal = "nada muda";
  for (const c of o.chapters) c.personagens = ["Clara Monteiro"];
  const p = problemasDasPromessas(o, promessasDoPedido(pedido)).join("\n");
  assert.match(p, /revelada no capítulo 3, cedo demais/);
  assert.match(p, /capítulos 2, 3 estão sem "passoDoCasal"/);
  assert.match(p, /Rafael Duarte \(par romântico\) está em cena em só 0 de 8/);
  assert.match(p, /pelo menos 2 pistas/);
});

test("bloco da escrita: freia a revelação, planta a pista e entrega a virada", () => {
  const o = livro();
  const c2 = promessasBlock(o, 1);
  assert.match(c2, /O CASAL NESTE CAPÍTULO: passo 2/);
  assert.match(c2, /só é revelada por inteiro no capítulo 7/);
  assert.match(c2, /PLANTE[\s\S]*a chave verde/);
  assert.match(promessasBlock(o, 6), /ESTE É O CAPÍTULO DA REVELAÇÃO/);
  const ultimo = promessasBlock(o, 7);
  assert.match(ultimo, /A VIRADA FINAL ACONTECE AQUI[\s\S]*Rafael traiu[\s\S]*a avó armou tudo[\s\S]*a chave verde; o caderno/);
  assert.equal(promessasBlock({ title: "x", subtitle: "", chapters: [cap()] }, 0), "");
});

test("editor do sumário: normaliza nota e critérios; lixo não revisa", () => {
  const av = normalizarAvaliacaoSumario({
    nota: "6",
    problemas: [
      { criterio: "Revelação", correcao: "Mover a revelação para o cap. 7." },
      { criterio: "inventado", correcao: "Algo." },
      { criterio: "final", correcao: "" },
    ],
  });
  assert.equal(av.nota, 6);
  assert.deepEqual(av.problemas.map((p) => p.criterio), ["revelacao", "outro"]);
  assert.match(correcaoDoSumario(av, ["Falta viradaFinal"]), /nota 6\/10[\s\S]*\(revelacao\) Mover[\s\S]*- Falta viradaFinal/);
  assert.deepEqual(normalizarAvaliacaoSumario("lixo"), { nota: null, problemas: [] });
});

test("segunda chance do final: só abaixo de 8 ou final que não satisfez", () => {
  const leitura = {
    editor: [
      { aspecto: "final", sugestao: "Criar uma virada que reconfigure a chave.", capitulos: [5] },
      { aspecto: "repeticao", sugestao: "Fundir as idas ao cartório.", capitulos: [2, 3] },
      { aspecto: "clareza", sugestao: "Explicar a quinta chuva.", capitulos: [5] },
    ],
    leitora: { nota: 6, finalSatisfaz: false, naoEntendeu: ["por que a quinta chuva"], comentario: "Correto, não inesperado." },
  };
  assert.equal(precisaReescreverFinal(leitura), true);
  const c = correcaoDoFinal(leitura, 5);
  assert.match(c, /Criar uma virada/);
  assert.match(c, /Explicar a quinta chuva/);
  assert.match(c, /Deixe claro, em cena: por que a quinta chuva/);
  assert.doesNotMatch(c, /cartório/, "problema do meio do livro não entra na reescrita do fim");
  assert.equal(precisaReescreverFinal({ leitora: { nota: 8, finalSatisfaz: true } }), false);
  assert.equal(precisaReescreverFinal({ leitora: { nota: 9, finalSatisfaz: false } }), true);
  assert.equal(precisaReescreverFinal("lixo"), false);
});

test("premissas: descarta as sem virada ou sem pistas; escolha cai na maior nota se vier inválida", () => {
  const boa = { premissa: "p", traicao: "t", leitorAcredita: "a", verdade: "v", pistas: ["x", "y", "z"], porQueSurpreende: "s" };
  const lista = normalizarPremissas({ premissas: [boa, { ...boa, verdade: "" }, { ...boa, pistas: ["só uma"] }, { ...boa, premissa: "p2" }] });
  assert.deepEqual(lista.map((p) => p.premissa), ["p", "p2"]);
  assert.deepEqual(normalizarPremissas("lixo"), []);

  assert.equal(escolhaDaPremissa({ escolhida: 2, notas: [6, 8], motivo: "m" }, 2).indice, 1);
  assert.equal(escolhaDaPremissa({ escolhida: 2, notas: [6, 8] }, 2).nota, 8);
  assert.equal(escolhaDaPremissa({ escolhida: 9, notas: [6, 8, 7] }, 3).indice, 1, "fora da faixa: maior nota");
  assert.equal(escolhaDaPremissa("lixo", 3).indice, 0);

  const bloco = premissaBlock(lista[0]);
  assert.match(bloco, /PREMISSA ESCOLHIDA[\s\S]*A traição: t[\s\S]*A verdade \(virada final\): v[\s\S]*x; y; z/);
});

test("auditor aceita os tipos novos das promessas", () => {
  const r = normalizarAuditoria({ problemas: [{ tipo: "revelacao-antecipada", gravidade: "grave", correcao: "Segure a verdade." }] });
  assert.equal(r.aprovado, false);
});
