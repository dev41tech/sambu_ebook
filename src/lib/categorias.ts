// Taxonomia de classificacao dos ebooks - categoria principal e secundarias.
//
// Este campo substituiu o antigo "Tema / Nicho" de texto livre: alem de
// classificar o livro para busca na vitrine, o caminho escolhido alimenta o
// prompt da IA. Por isso a lista cobre tanto genero de ficcao quanto nicho de
// nao ficcao - o acervo atual e majoritariamente nao ficcao (emagrecimento,
// perimenopausa, DRE gerencial) e nao podia ficar sem lugar.
//
// O detalhe especifico da obra ("voltar a amar depois dos 40") vai no campo de
// instrucoes extras, que comporta 5000 caracteres.
//
// Usado pelo cliente (formularios) e pelo servidor (validacao).

export interface GrupoCategorias {
  grupo: string;
  itens: string[];
}

export const TAXONOMIA: GrupoCategorias[] = [
  {
    grupo: "Romance",
    itens: [
      "Romance contemporâneo",
      "Romance paranormal/sobrenatural",
      "Romance histórico",
      "Romance de época",
      "Segundas chances",
      "Comédia romântica",
      "Romance LGBTQIA+",
    ],
  },
  {
    grupo: "Ficção",
    itens: [
      "Ficção gótica",
      "Ficção literária",
      "Ficção histórica brasileira",
      "Ficção contemporânea",
      "Contos e crônicas",
    ],
  },
  {
    grupo: "Fantasia",
    itens: [
      "Fantasia sombria",
      "Alta fantasia",
      "Fantasia urbana",
      "Fantasia brasileira/folclórica",
    ],
  },
  {
    grupo: "Terror",
    itens: ["Sobrenatural", "Terror psicológico", "Terror folclórico"],
  },
  {
    grupo: "Suspense e mistério",
    itens: [
      "Sobrenatural",
      "Thriller psicológico",
      "Policial e investigação",
      "True crime",
    ],
  },
  {
    grupo: "Ficção científica",
    itens: ["Distopia", "Ficção científica especulativa", "Pós-apocalíptico"],
  },
  {
    grupo: "Saúde e bem-estar",
    itens: [
      "Emagrecimento",
      "Menopausa e perimenopausa",
      "Sono e descanso",
      "Alimentação e receitas",
      "Saúde mental e ansiedade",
      "Exercício e movimento",
      "Saúde da mulher",
    ],
  },
  {
    grupo: "Desenvolvimento pessoal",
    itens: [
      "Autoestima e autoconhecimento",
      "Produtividade e hábitos",
      "Recomeços e transições",
      "Propósito e carreira",
      "Maternidade e paternidade",
    ],
  },
  {
    grupo: "Relacionamentos",
    itens: [
      "Vida a dois",
      "Divórcio e recomeço",
      "Namoro e maturidade",
      "Família e educação dos filhos",
    ],
  },
  {
    grupo: "Negócios e finanças",
    itens: [
      "Finanças pessoais e dívidas",
      "Empreendedorismo",
      "Contabilidade e controladoria",
      "Vendas e marketing",
      "Gestão e liderança",
      "Inteligência artificial nos negócios",
    ],
  },
  {
    grupo: "Educação e estudo",
    itens: ["Métodos de estudo", "Educação infantil", "Formação profissional"],
  },
  {
    grupo: "Espiritualidade",
    itens: ["Filosofia de vida", "Espiritualidade e fé", "Meditação"],
  },
  {
    grupo: "Tecnologia",
    itens: [
      "Inteligência artificial",
      "Programação e dados",
      "Ferramentas digitais",
    ],
  },
  {
    grupo: "Biografias e memórias",
    itens: ["Memórias pessoais", "Biografias", "Histórias de superação"],
  },
];

export const SEPARADOR = " > ";

/** Todos os caminhos no formato "Grupo > Item". */
export const CATEGORIAS: string[] = TAXONOMIA.flatMap((g) =>
  g.itens.map((item) => `${g.grupo}${SEPARADOR}${item}`),
);

const VALIDAS = new Set(CATEGORIAS);

export function isCategoriaValida(valor: string): boolean {
  return VALIDAS.has(valor);
}

/** Grupo onde caem as categorias criadas a mao pelo usuario. */
export const GRUPO_PERSONALIZADO = "Minhas categorias";

/**
 * Chave de comparacao usada para decidir se uma categoria "ja esta na lista".
 * Sem tirar acento e caixa, "Ficcao Gotica" entraria como nova ao lado de
 * "Ficção gótica" e a lista encheria de duplicatas que parecem iguais na tela.
 */
export function normalizarCategoria(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Limpa o que o usuario digitou no campo de nova categoria. O ">" e removido
 * porque e o separador do caminho: deixa-lo passar produziria "Minhas
 * categorias > Romance > X", um caminho de tres niveis que nada sabe ler.
 */
export function limparNomeCategoria(bruto: string): string {
  return bruto.replace(/>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Grupos narrativos. Ficção precisa de elenco fixo entre capitulos; nao ficcao
 * nao tem personagens e o mesmo bloco so gastaria tokens.
 */
const GRUPOS_FICCAO = new Set([
  "Romance",
  "Ficção",
  "Fantasia",
  "Terror",
  "Suspense e mistério",
  "Ficção científica",
]);

/** Reconhece ficcao pelo grupo do caminho "Grupo > Item". */
export function ehFiccao(caminho: string): boolean {
  const grupo = (caminho || "").split(SEPARADOR)[0].trim();
  if (GRUPOS_FICCAO.has(grupo)) return true;
  // Categoria criada a mao ("Minhas categorias > Romance esportivo") nao tem
  // grupo da taxonomia -- caimos no nome do item.
  const item = (caminho || "").split(SEPARADOR).pop() ?? "";
  return /romance|ficç|ficc|fantasia|terror|suspense|conto|novela|thriller/i.test(item);
}
