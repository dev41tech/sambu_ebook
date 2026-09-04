// `import type` de proposito: um import de valor carregaria ./db, que lanca sem
// DATABASE_URL, e tornaria esta funcao pura impossivel de testar sem banco.
import type { EbookRow } from "./db";
import { detectarRecusa } from "./sanitizar";
import { verificarContinuidade, type Achado, type Gravidade } from "./continuidade";
import { verificarFatosNumericos } from "./fatosNumericos";
import { ehFiccao } from "../../src/lib/categorias";
import type { Outline } from "./ai";

// Portão entre "escrito" e "publicável".
//
// Até aqui o sistema já sabia apontar problemas graves — o verificador de
// continuidade gravava `blocker` — e o botão de finalizar continuava
// funcionando do mesmo jeito. Achado sem consequência é relatório, não controle.
//
// Regra: `blocker` impede a exportação. `major` e abaixo passam, aparecendo como
// aviso. Quem decide o que é blocker são as verificações, não este módulo.

export interface ResultadoGate {
  liberado: boolean;
  achados: Achado[];
  bloqueadores: Achado[];
  contagem: Record<Gravidade, number>;
}

/**
 * Frases que denunciam vazamento de infraestrutura dentro do texto do livro.
 * Um leitor nunca deve encontrar o nome de uma variável de ambiente num
 * capítulo, e um PDF publicado com isso não tem volta.
 */
const VAZAMENTOS: Array<[RegExp, string]> = [
  [/\b[A-Z][A-Z0-9]*_(API_)?KEY\b/, "nome de variável de ambiente"],
  [/\b(sk|pk)-[A-Za-z0-9_-]{12,}/, "credencial"],
  [/\bat\s+\w+\s*\([^)]*:\d+:\d+\)/, "stack trace"],
  [/\bundefined\b\s*(is not|não é)/i, "erro de execução"],
  [/\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/, "erro de rede"],
  [/postgres(ql)?:\/\/\S+/i, "string de conexão"],
];

export interface EntradaGate {
  ebook: EbookRow;
  capitulos: Array<{ idx: number; title: string; content: string }>;
}

export function avaliarQualidade(e: EntradaGate): ResultadoGate {
  const { ebook, capitulos } = e;
  const achados: Achado[] = [];

  // 1. Livro sem capítulo, ou capítulo sem texto. Exportar isso gera um PDF com
  //    títulos e páginas em branco.
  if (capitulos.length === 0) {
    achados.push({
      categoria: "livro-vazio",
      gravidade: "blocker",
      local: "livro",
      evidencia: "Nenhum capítulo foi escrito.",
      sugestao: "Gerar o conteúdo antes de exportar.",
    });
  }
  for (const c of capitulos) {
    const recusa = detectarRecusa(c.content ?? "");
    if (recusa) {
      achados.push({
        categoria: "capitulo-sem-conteudo",
        gravidade: "blocker",
        local: `capítulo ${c.idx + 1}`,
        evidencia: `"${c.title}": ${recusa.motivo}. Início: ${JSON.stringify(recusa.amostra.slice(0, 60))}`,
        sugestao: "Regerar este capítulo.",
      });
    }
  }

  // 2. Índices duplicados ou faltando quebram a ordem no PDF e no EPUB.
  const idxs = capitulos.map((c) => c.idx).sort((a, b) => a - b);
  const duplicados = idxs.filter((v, i) => i > 0 && v === idxs[i - 1]);
  if (duplicados.length > 0) {
    achados.push({
      categoria: "capitulo-duplicado",
      gravidade: "blocker",
      local: "livro",
      evidencia: `Índices repetidos: ${[...new Set(duplicados)].join(", ")}.`,
      sugestao: "Corrigir a numeração dos capítulos.",
    });
  }

  // 3. Vazamento de infraestrutura no texto que vai para o leitor.
  const partes: Array<[string, string | null]> = [
    ["introdução", ebook.intro],
    ["conclusão", ebook.conclusion],
    ["sobre o autor", ebook.about_author],
    ...capitulos.map((c) => [`capítulo ${c.idx + 1}`, c.content] as [string, string | null]),
  ];
  for (const [local, texto] of partes) {
    if (!texto) continue;
    for (const [padrao, rotulo] of VAZAMENTOS) {
      const m = texto.match(padrao);
      if (m) {
        achados.push({
          categoria: "vazamento-de-sistema",
          gravidade: "blocker",
          local,
          evidencia: `${rotulo} no texto: ${JSON.stringify(m[0].slice(0, 60))}`,
          sugestao: "Remover o trecho antes de publicar.",
        });
        break; // um achado por trecho basta para bloquear
      }
    }
  }

  // 4. Continuidade de personagens, só em ficção.
  //
  // Roda mesmo sem sumario. A checagem de capitulos orfaos nao depende de elenco
  // declarado, e e justamente a unica que pega livros escritos antes de o elenco
  // existir -- pular tudo quando outline_json e nulo deixaria passar exatamente
  // os piores casos do acervo.
  const vazio: Outline = { title: "", subtitle: "", chapters: [] };
  let outline = vazio;
  if (ebook.outline_json) {
    try {
      outline = JSON.parse(ebook.outline_json) as Outline;
    } catch {
      achados.push({
        categoria: "sumario-invalido",
        gravidade: "warning",
        local: "sumário",
        evidencia: "outline_json não pôde ser lido.",
        sugestao: "Regerar o sumário.",
      });
    }
  }
  achados.push(
    ...verificarContinuidade({
      outline,
      intro: ebook.intro,
      conclusao: ebook.conclusion,
      capitulos,
      ficcao: ehFiccao(ebook.category_main || ebook.theme),
    }),
  );

  // 5. Fatos numéricos que o próprio sumário declarou fixos, contra o que o
  // texto realmente diz. Não depende de ficção: um livro de finanças que fixa
  // "o prazo é de vinte anos" também pode contradizer isso adiante. Reaproveita
  // os mesmos trechos rotulados do passo 3.
  achados.push(
    ...verificarFatosNumericos(
      outline.fatosFixos ?? [],
      partes
        .filter((p): p is [string, string] => p[1] != null)
        .map(([local, texto]) => ({ local, texto })),
    ),
  );

  const contagem: Record<Gravidade, number> = { info: 0, warning: 0, major: 0, blocker: 0 };
  for (const a of achados) contagem[a.gravidade] += 1;
  const bloqueadores = achados.filter((a) => a.gravidade === "blocker");

  return { liberado: bloqueadores.length === 0, achados, bloqueadores, contagem };
}
