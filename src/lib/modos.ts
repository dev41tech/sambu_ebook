import { SEPARADOR, ehFiccao } from "./categorias";

// Modos editoriais.
//
// O app tinha um motor só: o mesmo prompt de sistema, as mesmas aberturas de
// capítulo e as mesmas quatro opções de tom escreviam um romance, um livro sobre
// DRE gerencial e um sobre alcoolismo. O resultado é que soavam iguais — o
// parecer editorial de "Ilha do Desespero" descreveu um romance que "se aproxima
// de um livro de treinamento corporativo", e estava certo: o prompt mandava
// "explicar por que aquilo importa e quais erros são comuns", em toda chamada.
//
// Os temas variam muito; o tratamento editorial não. Medindo os 57 ebooks do
// acervo, quatro modos cobrem 90%: saúde e corpo (28%), comportamento e relações
// (25%), narrativo (25%) e finanças e negócios (12%).
//
// O modo é DERIVADO da categoria que o usuário já escolhe, nunca perguntado.
// Um campo a mais no formulário seria um campo que ninguém preenche.

export type Modo = "narrativo" | "saude" | "comportamento" | "financas" | "tecnico" | "pratico";

export interface PerfilModo {
  id: Modo;
  rotulo: string;
  /** Tons que fazem sentido neste modo. O primeiro é o padrão. */
  tons: string[];
  /** Uma linha explicando ao usuário o que muda. */
  resumo: string;
}

export const PERFIS: Record<Modo, PerfilModo> = {
  narrativo: {
    id: "narrativo",
    rotulo: "Narrativo",
    tons: ["Intimista", "Direto e seco", "Bem-humorado", "Sombrio"],
    resumo: "Cena, diálogo e consequência. O narrador não explica a lição.",
  },
  saude: {
    id: "saude",
    rotulo: "Saúde e corpo",
    tons: ["Acolhedor", "Informativo", "Direto e prático"],
    resumo: "Separa informação de orientação clínica e evita promessa de resultado.",
  },
  comportamento: {
    id: "comportamento",
    rotulo: "Comportamento e relações",
    tons: ["Acolhedor", "Reflexivo", "Direto e prático", "Motivador"],
    resumo: "Parte da experiência do leitor, sem diagnosticar nem prescrever.",
  },
  financas: {
    id: "financas",
    rotulo: "Finanças e negócios",
    tons: ["Direto e prático", "Técnico e direto", "Didático"],
    resumo: "Exige exemplo numérico fechado e data de referência.",
  },
  tecnico: {
    id: "tecnico",
    rotulo: "Técnico",
    tons: ["Técnico e direto", "Didático", "Direto e prático"],
    resumo: "Passo verificável, sem prometer o que a ferramenta não faz.",
  },
  pratico: {
    id: "pratico",
    rotulo: "Prático",
    tons: ["Direto e prático", "Didático", "Motivador"],
    resumo: "Promessa clara, exemplo concreto e aplicação ao fim de cada capítulo.",
  },
};

/** Grupos da taxonomia que caem direto num modo. */
const POR_GRUPO: Record<string, Modo> = {
  "Saúde e bem-estar": "saude",
  "Desenvolvimento pessoal": "comportamento",
  "Relacionamentos": "comportamento",
  "Espiritualidade": "comportamento",
  "Biografias e memórias": "comportamento",
  "Negócios e finanças": "financas",
  "Tecnologia": "tecnico",
  "Educação e estudo": "pratico",
};

/**
 * Categoria criada à mão ("Minhas categorias > Sono depois dos 40") não tem
 * grupo da taxonomia, então o modo sai do nome do item. Sem isto, todas as
 * categorias personalizadas — que são justamente as mais usadas — cairiam no
 * modo genérico.
 */
const POR_PALAVRA: Array<[RegExp, Modo]> = [
  [/saúde|saude|sono|emagrec|nutri|dieta|marmita|corpo|menopausa|hormon|exercí|exerci|dor\b|ansiedade|depress|alcool|vício|vicio|fumar/i, "saude"],
  [/finanç|financ|dívida|divida|dinheiro|invest|orçament|orcament|dre\b|caixa|contábil|contabil|tribut|imposto|negóci|negoci|venda|empreend/i, "financas"],
  [/tecnolog|inteligência artificial|inteligencia artificial|\bia\b|programa|software|dados|automação|automacao|planilha|excel/i, "tecnico"],
  [/autoestima|propósito|proposito|relacion|casament|divórcio|divorcio|amar|amor|luto|filho|matern|patern|educação|educacao|adolesc|juventude|maturidade|espiritual|religi|fé\b|autoconheci|hábito|habito/i, "comportamento"],
];

/** Modo editorial de um caminho de categoria. Nunca pergunta ao usuário. */
export function modoDe(caminho: string): Modo {
  if (ehFiccao(caminho)) return "narrativo";

  const grupo = (caminho || "").split(SEPARADOR)[0].trim();
  const direto = POR_GRUPO[grupo];
  if (direto) return direto;

  const item = (caminho || "").split(SEPARADOR).pop() ?? "";
  for (const [padrao, modo] of POR_PALAVRA) {
    if (padrao.test(item)) return modo;
  }
  return "pratico";
}

export function perfilDe(caminho: string): PerfilModo {
  return PERFIS[modoDe(caminho)];
}

/** Todos os tons válidos, de todos os modos — usado na validação do servidor. */
export const TODOS_OS_TONS: string[] = [
  ...new Set(Object.values(PERFIS).flatMap((p) => p.tons)),
];
