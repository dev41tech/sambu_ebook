import test from "node:test";
import assert from "node:assert/strict";
import {
  extrairNomes,
  verificarContinuidade,
  nomesAutorizados,
  termosDeFatosFixos,
  normalizarTermo,
  pareceLugar,
} from "./continuidade";

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

test("personagem criado na prosa e registrado nao e acusado de 'nao autorizado'", () => {
  // A verificacao comparava o texto so contra o elenco do SUMARIO. Um secundario
  // que nasceu no capitulo 2 e foi registrado corretamente ainda era acusado --
  // falso positivo que gasta atencao de revisao a toa.
  const outline = {
    title: "T",
    subtitle: "S",
    chapters: Array.from({ length: 6 }, (_, i) => ({ title: `Cap ${i + 1}`, summary: "" })),
    personagens: [
      { nome: "Ana", papel: "protagonista", descricao: "x" },
      { nome: "Caio", papel: "par romantico", descricao: "y" },
    ],
  };
  const capitulos = Array.from({ length: 6 }, (_, i) => ({
    idx: i,
    title: `Cap ${i + 1}`,
    // Tereza aparece o bastante para passar do piso de 5 mencoes.
    content: "Ana chamou Tereza. Depois Caio viu Tereza sair, e Tereza voltou com Ana e Tereza riu, e Tereza ficou.",
  }));

  const semRegistro = verificarContinuidade({ outline, intro: null, conclusao: null, capitulos, ficcao: true });
  assert.ok(
    semRegistro.some((a) => a.categoria === "personagem-nao-autorizado" && a.evidencia.includes("Tereza")),
    "sem o registro, Tereza deve continuar sendo acusada",
  );

  const comRegistro = verificarContinuidade({
    outline,
    intro: null,
    conclusao: null,
    capitulos,
    ficcao: true,
    elencoRegistrado: [{ nome: "Tereza" }],
  });
  assert.equal(
    comRegistro.filter((a) => a.categoria === "personagem-nao-autorizado").length,
    0,
    "registrada, Tereza nao pode mais ser acusada",
  );
});

test("capitulos orfaos dizem QUAIS capitulos, nao so quantos", () => {
  // A checagem no meio da geracao precisa saber qual capitulo reescrever, sem
  // tentar extrair isso do texto da evidencia.
  const outline = {
    title: "T",
    subtitle: "S",
    chapters: Array.from({ length: 10 }, (_, i) => ({ title: `Cap ${i + 1}`, summary: "" })),
    personagens: [
      { nome: "Ana", papel: "protagonista", descricao: "x" },
      { nome: "Caio", papel: "par romantico", descricao: "y" },
    ],
  };
  const comCasal = "Ana olhou para Caio. Caio respondeu a Ana com calma, e Ana sorriu para Caio.";
  const semNinguem = "A chuva caía sobre o telhado e o rio subia devagar, sem pressa nenhuma.";
  const capitulos = Array.from({ length: 10 }, (_, i) => ({
    idx: i,
    title: `Cap ${i + 1}`,
    content: i >= 7 ? semNinguem : comCasal,
  }));

  const achados = verificarContinuidade({ outline, intro: null, conclusao: null, capitulos, ficcao: true });
  const orfaos = achados.find((a) => a.categoria === "capitulos-orfaos");
  assert.ok(orfaos, "deve acusar capitulos orfaos");
  assert.deepEqual(orfaos.capitulosAfetados, [7, 8, 9]);
});

test("livro sem elenco no sumario, mas com elenco registrado, nao e 'elenco-ausente'", () => {
  const outline = {
    title: "T",
    subtitle: "S",
    chapters: [{ title: "Cap 1", summary: "" }],
  };
  const capitulos = [{ idx: 0, title: "Cap 1", content: "Ana falou com Ana e Ana saiu." }];
  const achados = verificarContinuidade({
    outline,
    intro: null,
    conclusao: null,
    capitulos,
    ficcao: true,
    elencoRegistrado: [{ nome: "Ana" }],
  });
  assert.equal(achados.filter((a) => a.categoria === "elenco-ausente").length, 0);
});

// --- Regressoes de "Coracoes Urbanos", o primeiro livro gerado de ponta a ponta.
//
// O registro de elenco daquele livro saiu assim: Ellie em quatro capitulos,
// Lucas, Lucas Almeida e Carlos Silveira -- todos ja no elenco do sumario -- e,
// via plano B, "Renata, Ana" (as duas protagonistas) e "Toquio" (uma cidade).

test("nomesAutorizados casa parte do nome, nao so o nome inteiro", () => {
  // Comparar a string cheia nunca casava "Renata" com "Renata Campos", e foi
  // por isso que o plano B registrou as duas protagonistas como gente nova.
  const a = nomesAutorizados([
    { nome: "Ana Costa" },
    { nome: "Renata Campos" },
    { nome: "Ellie" },
  ]);

  assert.ok(a.has(normalizarTermo("Renata")), "o primeiro nome sozinho conta");
  assert.ok(a.has(normalizarTermo("Campos")), "o sobrenome sozinho conta");
  assert.ok(a.has(normalizarTermo("Ana")));
  assert.ok(a.has(normalizarTermo("Ellie")), "nome de uma palavra so continua valendo");
  assert.ok(!a.has(normalizarTermo("Elias")), "nome parecido nao pode casar");
});

test("nomesAutorizados pula tratamentos e ignora nome vazio", () => {
  const a = nomesAutorizados([{ nome: "Delegada Mariana Silva" }, { nome: "   " }]);
  assert.ok(a.has(normalizarTermo("Mariana")));
  assert.ok(a.has(normalizarTermo("Silva")));
  assert.ok(!a.has(""), "string vazia nao pode entrar no conjunto");
});

test("termosDeFatosFixos pega o que vem dos fatos e das descricoes", () => {
  // É o filtro que impede uma cidade de virar personagem.
  const t = termosDeFatosFixos({
    title: "T",
    subtitle: "S",
    chapters: [],
    personagens: [{ nome: "Ana", papel: "protagonista", descricao: "recém-chegada de Salvador" }],
    fatosFixos: ["Ana e Lucas se conhecem quando ela cobre um evento em São Paulo"],
  });

  assert.ok(t.has(normalizarTermo("Paulo")));
  assert.ok(t.has(normalizarTermo("Salvador")), "a descrição do personagem também é fonte");
});

test("nomesAutorizados e termosDeFatosFixos juntos barram o que o livro real registrou errado", () => {
  const outline = {
    title: "Corações Urbanos",
    subtitle: "S",
    chapters: [],
    personagens: [
      { nome: "Ana Costa", papel: "protagonista", descricao: "jornalista" },
      { nome: "Lucas Almeida", papel: "par romantico", descricao: "fotógrafo" },
      { nome: "Renata Campos", papel: "apoio", descricao: "divide o apartamento" },
      { nome: "Carlos Silveira", papel: "apoio", descricao: "editor-chefe" },
      { nome: "Ellie", papel: "ausente", descricao: "ex de Lucas" },
    ],
    fatosFixos: ["Ana e Lucas se conhecem quando ela cobre um evento em São Paulo"],
  };
  const autorizados = nomesAutorizados(outline.personagens);
  const reservados = termosDeFatosFixos(outline);
  const jaConhecido = (nome: string) =>
    nome
      .split(/\s+/)
      .map(normalizarTermo)
      .filter(Boolean)
      .some((p) => autorizados.has(p) || reservados.has(p));

  // Tudo isto foi registrado como "novo" no livro real e nao deveria ter sido.
  for (const nome of ["Lucas", "Ellie", "Lucas Almeida", "Renata", "Ana", "Carlos Silveira", "São Paulo"]) {
    assert.ok(jaConhecido(nome), `"${nome}" ja existe no livro e nao pode entrar como novo`);
  }

  // "Elias" apareceu no capitulo 11 e é, de fato, alguem que nasceu na prosa.
  assert.ok(!jaConhecido("Elias"), "quem é realmente novo tem de passar");
});

test("bairro citado muitas vezes nao vira 'personagem nao autorizado'", () => {
  // Caso real de "Encontros Urbanos": "Liberdade" — o bairro — apareceu 10x e
  // foi acusado de personagem não autorizado, com gravidade warning. O filtro
  // de termos de fatos fixos não pegava, porque o bairro não estava declarado
  // em fato fixo nenhum.
  const corpo = [
    "Lucas desceu na Liberdade antes do amanhecer.",
    "O mercado da Liberdade ainda estava fechado.",
    "Marina disse que ia até a Liberdade depois do expediente.",
    "Na Liberdade, as lanternas continuavam acesas.",
    "Ele voltou para a Liberdade no fim da tarde.",
  ].join(" ");

  assert.equal(pareceLugar(corpo, "Liberdade"), true);
});

test("pessoa citada nua na maior parte das vezes nao vira lugar", () => {
  // "da Marina" acontece com gente também — o critério é predominância, não
  // presença. Sem isso a correção do bairro apagaria metade do elenco.
  const corpo = [
    "Marina abriu o caderno e anotou o endereço.",
    "Lucas esperou Marina na calçada.",
    "O carro da Marina estava na esquina.",
    "Marina riu e guardou o lápis.",
    "Depois Marina saiu sem se despedir.",
  ].join(" ");

  assert.equal(pareceLugar(corpo, "Marina"), false);
});

test("pareceLugar nao julga nome citado poucas vezes", () => {
  // Duas menções não são amostra. Um secundário legítimo que aparece uma vez
  // "na casa da Clarice" não pode ser reclassificado como endereço.
  const corpo = "Ela parou na Clarice. Depois seguiu para a Clarice de novo.";
  assert.equal(pareceLugar(corpo, "Clarice"), false);
});
