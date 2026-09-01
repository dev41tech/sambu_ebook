import test from "node:test";
import assert from "node:assert/strict";
import { avaliarQualidade } from "./qualityGate";
import type { EbookRow } from "./db";

// Fixtures pequenas e sintéticas de propósito: um ebook real no repositório de
// testes seria grande, privado e mudaria a cada geração.

const ELENCO = [
  { nome: "Ana Ribeiro", papel: "protagonista", descricao: "fisioterapeuta, 32 anos" },
  { nome: "Lucas Andrade", papel: "par romantico", descricao: "capitão do time, 34 anos" },
];

function capitulo(idx: number, texto: string) {
  return { idx, title: `Capítulo ${idx + 1}`, content: texto };
}

/** Texto longo o bastante para não cair no piso de tamanho do detector. */
function corpo(frase: string, vezes = 20) {
  return frase.repeat(vezes);
}

function ebookFake(over: Partial<EbookRow> = {}): EbookRow {
  return {
    id: "teste",
    theme: "Romance > Romance contemporâneo",
    category_main: "Romance > Romance contemporâneo",
    intro: corpo("Ana voltou para a cidade e encontrou Lucas. "),
    conclusion: corpo("Ana e Lucas seguiram juntos. "),
    about_author: null,
    outline_json: JSON.stringify({
      title: "Livro de Teste",
      subtitle: "Subtítulo",
      chapters: [{ title: "Capítulo 1", summary: "" }],
      personagens: ELENCO,
    }),
    ...over,
  } as unknown as EbookRow;
}

const CAPITULOS_OK = [
  capitulo(0, corpo("Ana olhou para Lucas e sorriu. ")),
  capitulo(1, corpo("Lucas respondeu a Ana com calma. ")),
];

test("livro coerente passa no gate", () => {
  const r = avaliarQualidade({ ebook: ebookFake(), capitulos: CAPITULOS_OK });
  assert.equal(r.liberado, true, `achados inesperados: ${JSON.stringify(r.achados)}`);
  assert.equal(r.bloqueadores.length, 0);
});

test("recusa do modelo salva como capitulo bloqueia a publicacao", () => {
  // O caso real: capítulos 4 e 10 de "Vingança Perigosa".
  const r = avaliarQualidade({
    ebook: ebookFake(),
    capitulos: [CAPITULOS_OK[0], capitulo(1, "Desculpe, não posso ajudar com esse pedido.")],
  });
  assert.equal(r.liberado, false);
  assert.equal(r.bloqueadores[0].categoria, "capitulo-sem-conteudo");
});

test("nome de variavel de ambiente no texto bloqueia", () => {
  const r = avaliarQualidade({
    ebook: ebookFake(),
    capitulos: [capitulo(0, corpo("Ana falou com Lucas. ") + " ELEVENLABS_API_KEY não configurada.")],
  });
  assert.equal(r.liberado, false);
  assert.equal(r.bloqueadores[0].categoria, "vazamento-de-sistema");
});

test("stack trace no texto bloqueia", () => {
  const r = avaliarQualidade({
    ebook: ebookFake(),
    capitulos: [capitulo(0, corpo("Ana falou com Lucas. ") + " at runJob (generationJob.ts:120:15)")],
  });
  assert.equal(r.liberado, false);
});

test("capitulo duplicado bloqueia", () => {
  const r = avaliarQualidade({
    ebook: ebookFake(),
    capitulos: [capitulo(0, corpo("Ana e Lucas. ")), capitulo(0, corpo("Ana e Lucas de novo. "))],
  });
  assert.equal(r.liberado, false);
  assert.ok(r.bloqueadores.some((b) => b.categoria === "capitulo-duplicado"));
});

test("livro sem capitulo nenhum bloqueia", () => {
  const r = avaliarQualidade({ ebook: ebookFake(), capitulos: [] });
  assert.equal(r.liberado, false);
  assert.ok(r.bloqueadores.some((b) => b.categoria === "livro-vazio"));
});

test("conclusao com personagem inexistente gera blocker", () => {
  // Regressão do defeito real: a conclusão de "Além das Quatro Linhas" fala de
  // Camila, que não existe no livro.
  const r = avaliarQualidade({
    // Prosa realista de proposito: o detector exige que o nome apareca ao menos
    // uma vez no meio de uma frase. Foi esse criterio que tirou "Era", "Foi" e
    // "Parece" da lista de personagens, e ele so vale se o texto for de verdade.
    ebook: ebookFake({
      conclusion:
        "A trajetória de Camila terminou ali. No fim, coube a Camila decidir, e foi por Camila que todos esperaram.",
    }),
    capitulos: CAPITULOS_OK,
  });
  assert.equal(r.liberado, false);
  assert.ok(r.achados.some((a) => a.categoria === "personagem-fantasma"));
});

test("introducao centrada em quem nao e protagonista gera major, sem bloquear", () => {
  // O defeito de "Além das Quatro Linhas": Guilherme existe no livro, mas como
  // secundário -- a introdução o tratava como par central.
  const capitulos = [
    capitulo(0, corpo("Ana olhou para Lucas. ") + corpo("Guilherme observava. ", 6)),
    capitulo(1, corpo("Lucas respondeu a Ana. ")),
  ];
  const r = avaliarQualidade({
    ebook: ebookFake({
      intro:
        "Era Guilherme quem chegava cedo. Sempre foi Guilherme, e ninguém entendia Guilherme como ela.",
    }),
    capitulos,
  });
  assert.ok(r.achados.some((a) => a.categoria === "protagonista-divergente"));
  assert.equal(r.contagem.major >= 1, true);
});

test("nao ficcao nao passa pela checagem de personagens", () => {
  const r = avaliarQualidade({
    ebook: ebookFake({
      theme: "Negócios e finanças > Gestão financeira",
      category_main: "Negócios e finanças > Gestão financeira",
      intro: corpo("O fluxo de caixa exige disciplina. "),
      conclusion: corpo("Aplique o que leu. "),
    }),
    capitulos: [capitulo(0, corpo("Margem de contribuição é o que sobra. "))],
  });
  assert.equal(r.liberado, true, JSON.stringify(r.achados));
});

test("LIMITACAO CONHECIDA: nome que so aparece abrindo frase passa despercebido", () => {
  // O detector exige uma ocorrencia no meio de frase para separar nome proprio
  // de verbo capitalizado ("Era", "Foi", "Parece"). O preco e este: um texto
  // curto em que o nome sempre abre a frase nao dispara achado. Em prosa real
  // isso praticamente nao acontece -- na conclusao de "Alem das Quatro Linhas",
  // Camila aparecia em "A trajetoria de Camila e Lucas" --, mas o limite existe
  // e fica registrado aqui em vez de virar surpresa.
  const r = avaliarQualidade({
    ebook: ebookFake({ conclusion: "Camila entendeu tudo. Camila partiu. Camila venceu." }),
    capitulos: CAPITULOS_OK,
  });
  assert.equal(
    r.achados.some((a) => a.categoria === "personagem-fantasma"),
    false,
    "se este teste falhar, a heuristica melhorou -- atualize o teste",
  );
});

test("livro que troca de casal na metade dos capitulos e bloqueado", () => {
  // Regressao do pior caso real do acervo. "Alem das Quatro Linhas" tem Ana
  // (333 mencoes) e Lucas (284), e ainda assim 36 dos 84 capitulos nao citam
  // nenhum dos dois: cada um inventou o proprio casal. Como o livro nao tem
  // elenco declarado -- foi escrito antes disso existir --, todas as outras
  // checagens de protagonista o ignoravam e ele passava limpo no gate.
  // Frases variadas de proposito: repetir "Ana olhou para Lucas." deixaria Ana
  // sempre no inicio da frase, e o detector so aceita nome que apareca ao menos
  // uma vez no meio -- o mesmo criterio que exclui "Era" e "Foi".
  const bons = Array.from({ length: 10 }, (_, i) =>
    capitulo(i, corpo("Naquela tarde, Ana olhou para Lucas. O silêncio entre Ana e Lucas dizia tudo. ")),
  );
  const trocados = Array.from({ length: 8 }, (_, i) =>
    capitulo(
      10 + i,
      corpo("Naquela tarde, Cecília olhou para Felipe. O silêncio entre Cecília e Felipe dizia tudo. "),
    ),
  );
  const r = avaliarQualidade({
    ebook: ebookFake({ outline_json: null }),
    capitulos: [...bons, ...trocados],
  });
  assert.equal(r.liberado, false);
  const achado = r.bloqueadores.find((a) => a.categoria === "capitulos-orfaos");
  assert.ok(achado, `esperava capitulos-orfaos, veio ${JSON.stringify(r.achados)}`);
  assert.match(achado.evidencia, /8 de 18/);
});

test("subtrama pequena vira aviso, nao bloqueio", () => {
  // Dois capitulos de 18 sem o casal (11%) e narrativa normal -- abaixo do piso
  // de 15%, nao deve gerar achado nenhum.
  const bons = Array.from({ length: 16 }, (_, i) =>
    capitulo(i, corpo("Naquela tarde, Ana olhou para Lucas. O silêncio entre Ana e Lucas dizia tudo. ")),
  );
  const outros = Array.from({ length: 2 }, (_, i) =>
    capitulo(
      16 + i,
      corpo("Naquela tarde, Cecília olhou para Felipe. O silêncio entre Cecília e Felipe dizia tudo. "),
    ),
  );
  const r = avaliarQualidade({
    ebook: ebookFake({ outline_json: null }),
    capitulos: [...bons, ...outros],
  });
  assert.equal(r.liberado, true, JSON.stringify(r.achados));
});
