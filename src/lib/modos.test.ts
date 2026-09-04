import test from "node:test";
import assert from "node:assert/strict";
import { modoDe, perfilDe, PERFIS, TODOS_OS_TONS } from "./modos";

// Casos tirados do acervo real. Categorias criadas à mão são a maioria do que o
// usuário produz, então elas pesam mais aqui do que os caminhos da taxonomia.
const CASOS: Array<[string, string]> = [
  // ficção — pelo grupo e pela categoria criada à mão
  ["Romance > Romance contemporâneo", "narrativo"],
  ["Suspense e mistério > Sobrenatural", "narrativo"],
  ["Minhas categorias > Romance esportivo", "narrativo"],
  ["Minhas categorias > Suspense rural brasileiro", "narrativo"],
  ["Minhas categorias > Ficção", "narrativo"],

  // saúde
  ["Saúde e bem-estar > Menopausa e perimenopausa", "saude"],
  ["Minhas categorias > Sono de qualidade depois dos 40", "saude"],
  ["Minhas categorias > emagrecimento", "saude"],
  ["Minhas categorias > Marmitas saudáveis para a semana toda", "saude"],
  ["Minhas categorias > Alcoolismo", "saude"],
  ["Minhas categorias > Ansiedade no dia a dia de quem trabalha muito", "saude"],

  // finanças e negócios
  ["Negócios e finanças > Gestão financeira", "financas"],
  ["Minhas categorias > DRE Gerencial para Tomada de Decisão", "financas"],
  ["Minhas categorias > Sair das dívidas do cartão de crédito", "financas"],
  ["Minhas categorias > Fluxo de Caixa sem Complicação", "financas"],
  ["Minhas categorias > vendas com IA", "financas"],

  // comportamento e relações
  ["Desenvolvimento pessoal > Autoestima e autoconhecimento", "comportamento"],
  ["Minhas categorias > Voltar a amar depois dos 40", "comportamento"],
  ["Minhas categorias > Divorcio", "comportamento"],
  ["Minhas categorias > Autoestima na Maturidade", "comportamento"],
  ["Minhas categorias > Educação sem gritos", "comportamento"],
  ["Espiritualidade > Fé e propósito", "comportamento"],
  ["Minhas categorias > Religião", "comportamento"],

  // técnico
  ["Tecnologia > Inteligência artificial", "tecnico"],
  ["Minhas categorias > IA", "tecnico"],

  // sem sinal nenhum cai no genérico
  ["Minhas categorias > Mais esperto que a idade", "pratico"],
  ["Educação e estudo > Métodos de estudo", "pratico"],
];

test("classifica o acervo real nos modos certos", () => {
  const erros: string[] = [];
  for (const [caminho, esperado] of CASOS) {
    const obtido = modoDe(caminho);
    if (obtido !== esperado) erros.push(`"${caminho}" -> ${obtido}, esperava ${esperado}`);
  }
  assert.equal(erros.length, 0, `\n  ${erros.join("\n  ")}`);
});

test("vendas com IA vai para finanças, nao para tecnico", () => {
  // "vendas com IA" casa com os dois padrões. A ordem da lista decide, e vendas
  // manda: o livro é sobre vender, a IA é a ferramenta.
  assert.equal(modoDe("Minhas categorias > vendas com IA"), "financas");
});

test("ficcao ganha de qualquer palavra-chave", () => {
  // Um romance ambientado num hospital não pode virar livro de saúde.
  assert.equal(modoDe("Romance > Romance contemporâneo"), "narrativo");
  assert.equal(modoDe("Minhas categorias > Romance sobre luto e saúde"), "narrativo");
});

test("caminho vazio nao quebra", () => {
  assert.equal(modoDe(""), "pratico");
  assert.equal(modoDe("   "), "pratico");
});

test("todo modo tem ao menos um tom, e o primeiro e o padrao", () => {
  for (const perfil of Object.values(PERFIS)) {
    assert.ok(perfil.tons.length > 0, `${perfil.id} sem tons`);
    assert.ok(perfil.resumo.length > 10, `${perfil.id} sem resumo`);
  }
});

test("Motivador nao e mais oferecido em ficcao nem em saude", () => {
  // 40 dos 57 ebooks do acervo saíram com tom "Motivador", inclusive os 14 de
  // ficção. É a origem do texto de autoajuda em livro que não é autoajuda.
  assert.ok(!PERFIS.narrativo.tons.includes("Motivador"));
  assert.ok(!PERFIS.saude.tons.includes("Motivador"));
  assert.ok(!PERFIS.financas.tons.includes("Motivador"));
});

test("TODOS_OS_TONS cobre todo tom oferecido, sem repetir", () => {
  const doPerfil = Object.values(PERFIS).flatMap((p) => p.tons);
  for (const t of doPerfil) assert.ok(TODOS_OS_TONS.includes(t), `${t} fora da lista`);
  assert.equal(TODOS_OS_TONS.length, new Set(TODOS_OS_TONS).size, "há tom repetido");
});

test("perfilDe devolve o perfil do modo", () => {
  assert.equal(perfilDe("Romance > Romance histórico").id, "narrativo");
  assert.equal(perfilDe("Saúde e bem-estar > Sono e descanso").rotulo, "Saúde e corpo");
});
