import test from "node:test";
import assert from "node:assert/strict";
import {
  medir,
  medirComResumos,
  abstracoesDe,
  formatoDeDialogo,
  LIMITE_ABSTRACAO_POR_MIL,
} from "./metricas";

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

// --- Duas medições que passaram a agir sobre a escrita ----------------------
//
// As duas nasceram de "Corações Urbanos": quatro dos doze capítulos escreveram
// diálogo em aspas, e o livro mediu 12.20 de abstração por mil contra a
// referência de 8.9.

test("formatoDeDialogo separa a fala em travessao da fala em aspas", () => {
  const travessao = [
    "— Espero não ter demorado muito — disse ele, puxando a cadeira.",
    "",
    "— Nem um pouco — respondeu Ana.",
  ].join("\n");
  const aspas = [
    '"Ei", cumprimentou ele, erguendo uma xícara de chá.',
    "",
    '"Consegui a pauta", respondeu Ana, acomodando-se.',
  ].join("\n");

  assert.deepEqual(formatoDeDialogo(travessao), { travessao: 2, aspas: 0, usaAspas: false });
  const f = formatoDeDialogo(aspas);
  assert.equal(f.aspas, 2);
  assert.equal(f.usaAspas, true);
});

test("fala com verbo de acao no lugar do verbo de elocucao nao e contada (limitacao aceita)", () => {
  // '"Tudo bem?" Ana sorriu' é diálogo, mas "sorriu" não é verbo de elocução e
  // o detector não o reconhece. A alternativa seria incluir sorriu/assentiu/riu
  // na lista, o que traria de volta o falso positivo que esta regra existe para
  // eliminar -- o e-mail do capítulo 2 de "Corações Urbanos".
  //
  // A perda é tolerável porque a decisão é POR CAPÍTULO: basta uma fala
  // reconhecida para o capítulo inteiro ser convertido. No livro real, os
  // quatro capítulos escritos em aspas foram todos detectados.
  const f = formatoDeDialogo('"Tudo bem com você?" Ana sorriu, acomodando-se.');
  assert.equal(f.aspas, 0);
  assert.equal(f.usaAspas, false);

  // Basta uma fala com verbo de elocução no mesmo capítulo para o defeito
  // aparecer -- que é o caso real do capítulo 7.
  const capitulo = [
    '"Elas contam uma bela história, não é?" Ana sorriu.',
    "",
    '"Eu precisava ouvir isso", ela disse, sem levantar os olhos.',
  ].join("\n");
  assert.equal(formatoDeDialogo(capitulo).usaAspas, true);
});

test("aspas que NAO sao fala nao contam como diálogo fora do padrão", () => {
  // Caso real do capítulo 2: o parágrafo entre aspas é o texto de um e-mail.
  // Converter isso para travessão transformaria uma citação em fala.
  const comCitacaoNoMeio = [
    "— Alguma novidade? — perguntou Ana.",
    "",
    'Ela abriu o e-mail. Havia uma linha só: "Verifiquei, Ellie ainda está em São Paulo."',
  ].join("\n");

  const f = formatoDeDialogo(comCitacaoNoMeio);
  assert.equal(f.travessao, 1);
  assert.equal(f.aspas, 0, "aspas no meio do parágrafo são citação, não fala");
  assert.equal(f.usaAspas, false);
});

test("formatoDeDialogo aguenta texto sem diálogo nenhum e texto vazio", () => {
  assert.deepEqual(formatoDeDialogo(""), { travessao: 0, aspas: 0, usaAspas: false });
  assert.deepEqual(formatoDeDialogo("A chuva batia na janela e a cidade seguia."), {
    travessao: 0,
    aspas: 0,
    usaAspas: false,
  });
});

test("abstracoesDe devolve a taxa e NOMEIA os termos que pesaram", () => {
  // Nomear é o ponto: "reduza a abstração" é a instrução vaga que este motor já
  // demonstrou ignorar; "você usou 'silêncio' 3 vezes" é verificável.
  const texto =
    "O silêncio pesava. Havia um silêncio novo entre eles, e o silêncio dizia " +
    "mais que a fala. Era como se a sombra da cidade os cobrisse, como um eco.";

  const a = abstracoesDe(texto);
  const mapa = new Map(a.termos.map((t) => [t.termo, t.vezes]));
  assert.equal(mapa.get("silêncio"), 3);
  assert.equal(mapa.get("sombra"), 1);
  assert.ok(a.porMil > 0);
  // vem ordenado do mais frequente para o menos
  assert.equal(a.termos[0].termo, "silêncio");
});

test("abstracoesDe nao divide por zero em texto vazio", () => {
  const a = abstracoesDe("");
  assert.equal(a.porMil, 0);
  assert.deepEqual(a.termos, []);
});

test("prosa concreta fica abaixo do limite; a de 'Coracoes Urbanos' ficaria acima", () => {
  const concreta =
    "Ana largou a bolsa na cadeira e abriu o laptop. Digitou três linhas, apagou duas. " +
    "Lucas chegou com a câmera no ombro e pousou o copo na mesa sem dizer nada.";
  assert.ok(abstracoesDe(concreta).porMil <= LIMITE_ABSTRACAO_POR_MIL);

  // Mesma densidade que o livro real mediu: sobra abstração em cada frase.
  const abstrata =
    "O silêncio parecia uma sombra, como se o eco da cidade guardasse a essência " +
    "de tudo. Era como um reflexo, tal como a melodia de um passado que parecia " +
    "insistir, como se o silêncio fosse a única resposta.";
  assert.ok(
    abstracoesDe(abstrata).porMil > LIMITE_ABSTRACAO_POR_MIL,
    "prosa saturada de comparação precisa disparar a reescrita",
  );
});
