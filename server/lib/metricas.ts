import { modoDe, type Modo } from "../../src/lib/modos";

// Placar objetivo de um livro, medido em vez de opinado.
//
// O motivo direto: eu relatei que o modo narrativo tinha piorado a abstração de
// "Ilha do Desespero". Medindo, era o contrário -- "Ilha do Desespero" é ensaio
// corporativo, não ficção, e ensaio não usa metáfora; comparado com outro livro
// de ficção do motor antigo, o novo tinha MENOS abstração. Toda vez que eu
// julgar "melhorou" ou "piorou" sem medir, tenho a mesma chance de errar de novo.
//
// Estas métricas não bloqueiam nada -- isso é papel do qualityGate.ts. Elas dão
// um número para comparar antes/depois de uma mudança de prompt, sem reler o
// livro inteiro cada vez.

export interface Metricas {
  palavras: number;
  capitulos: number;
  /** Linhas de diálogo por mil palavras. Só relevante em ficção. */
  dialogoPorMil: number;
  /** Comparações e abstrações ("como se", "parecia", "silêncio", "eco"...) por mil palavras. */
  abstracaoPorMil: number;
  /** Sobreposição média de vocabulário entre capítulos consecutivos, 0 a 1. */
  repeticaoEntreCapitulos: number;
  /** Personagens do elenco que aparecem em menos de 2 capítulos. */
  personagensSemFuncao: string[];
  /** Só em não ficção: capítulos cujo resumo factual repete um exemplo já usado. */
  exemplosRepetidos: number;
}

const RE_DIALOGO = /(^|\n)\s*[—-]\s?[A-ZÀ-Ú"“]/g;

// As mesmas abstrações que o modo narrativo permitia sem limite. Medidas contra
// dois livros reais: "Sob o Sol do Mistério" (motor antigo) ficou em 8.9 por
// mil; abaixo disso é prosa concreta, acima é o excesso que o parecer editorial
// de "Ilha do Desespero" também criticou (ali por outro motivo: era ensaio).
const RE_ABSTRACAO =
  /\b(como um|como uma|tal como|assim como|parecia|como se|silêncio|eco|melodia|sombra|reflexo|essência|profundez\w*|ressonân\w*|tessitura)\w*/gi;

function contarOcorrencias(texto: string, re: RegExp): number {
  const m = texto.match(re);
  return m ? m.length : 0;
}

function normalizarPalavra(p: string): string {
  return p
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}]/gu, "");
}

const STOP_WORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "por", "para", "com", "sem", "que", "se", "e",
  "ou", "mas", "como", "quando", "onde", "porque", "mais", "muito", "ja", "nao",
  "sim", "ele", "ela", "eles", "elas", "eu", "tu", "voce", "seu", "sua", "seus",
  "suas", "este", "esta", "isso", "aquele", "aquela", "ao", "aos", "pelo", "pela",
  "entre", "sobre", "ate", "depois", "antes", "ainda", "so", "tambem",
]);

// Mesma lista de tratamentos que server/lib/continuidade.ts usa para não
// confundir "Delegada" ou "Dona" com o nome da pessoa.
const HONORIFICOS = new Set([
  "delegada", "delegado", "doutor", "doutora", "dona", "dom", "senhor", "senhora",
  "padre", "frei", "irma", "irmao", "seu", "sao", "santo", "santa",
  "professor", "professora", "sargento", "capitao", "tenente", "coronel",
]);

function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Primeiro nome de verdade num item do elenco, pulando tratamento. */
function primeiroNomeDoElenco(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).map(normalizarPalavra).filter(Boolean);
  return partes.find((p) => !HONORIFICOS.has(p)) ?? partes[0] ?? "";
}

/** Vocabulário significativo de um texto, como conjunto de palavras únicas. */
function vocabulario(texto: string): Set<string> {
  const palavras = (texto || "")
    .split(/\s+/)
    .map(normalizarPalavra)
    .filter((p) => p.length > 3 && !STOP_WORDS.has(p));
  return new Set(palavras);
}

/** Índice de Jaccard entre dois conjuntos: proporção de sobreposição, 0 a 1. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersecao = 0;
  for (const p of a) if (b.has(p)) intersecao++;
  const uniao = a.size + b.size - intersecao;
  return uniao === 0 ? 0 : intersecao / uniao;
}

export interface CapituloParaMetrica {
  idx: number;
  content: string;
}

export interface EntradaMetricas {
  caminhoCategoria: string;
  capitulos: CapituloParaMetrica[];
  /** Nomes do elenco declarado no sumário, se houver. */
  elenco?: string[];
}

export function medir(e: EntradaMetricas): Metricas {
  const modo: Modo = modoDe(e.caminhoCategoria);
  const textoCompleto = e.capitulos.map((c) => c.content || "").join(" ");
  const palavras = textoCompleto.trim().length === 0 ? 0 : textoCompleto.trim().split(/\s+/).length;
  const mil = palavras > 0 ? palavras / 1000 : 1;

  const dialogoPorMil = modo === "narrativo" ? contarOcorrencias(textoCompleto, RE_DIALOGO) / mil : 0;
  const abstracaoPorMil = contarOcorrencias(textoCompleto, RE_ABSTRACAO) / mil;

  // Repetição: sobreposição de vocabulário entre cada par de capítulos
  // consecutivos, com a média de todos os pares. Alto = os capítulos usam as
  // mesmas palavras para dizer a mesma coisa, sintoma de "capítulos repetitivos"
  // apontado no parecer de "Ilha do Desespero".
  const vocabs = e.capitulos.map((c) => vocabulario(c.content || ""));
  let somaSobreposicao = 0;
  let pares = 0;
  for (let i = 1; i < vocabs.length; i++) {
    somaSobreposicao += jaccard(vocabs[i - 1], vocabs[i]);
    pares++;
  }
  const repeticaoEntreCapitulos = pares > 0 ? somaSobreposicao / pares : 0;

  // Personagens do elenco que quase não aparecem: são os "Juliana, Cecília e
  // Carlos" do parecer -- ferramentas do enredo, não gente com função na trama.
  //
  // Não usa vocabulario(): aquele filtro descarta palavra com 3 letras ou menos,
  // o que apagaria "Ana" da própria contagem -- o nome ficaria sempre "sem
  // função" mesmo aparecendo 300 vezes. E pula honoríficos ("Delegada Mariana
  // Silva") ao escolher o primeiro nome de verdade, pelo mesmo motivo que
  // continuidade.ts pula: sem isso o nome extraído vira o título, não a pessoa.
  const personagensSemFuncao: string[] = [];
  if (e.elenco && e.elenco.length > 0) {
    for (const nome of e.elenco) {
      const primeiro = primeiroNomeDoElenco(nome);
      if (!primeiro) continue;
      const re = new RegExp(`\\b${primeiro}\\b`, "i");
      const aparicoes = e.capitulos.filter((c) => re.test(normalizarTexto(c.content || ""))).length;
      if (aparicoes < 2) personagensSemFuncao.push(nome);
    }
  }

  return {
    palavras,
    capitulos: e.capitulos.length,
    dialogoPorMil: Math.round(dialogoPorMil * 10) / 10,
    abstracaoPorMil: Math.round(abstracaoPorMil * 10) / 10,
    repeticaoEntreCapitulos: Math.round(repeticaoEntreCapitulos * 1000) / 1000,
    personagensSemFuncao,
    exemplosRepetidos: 0, // depende do resumo_fatos por capítulo; calculado à parte, ver metricasComResumos()
  };
}

export interface CapituloComResumo extends CapituloParaMetrica {
  resumoFatos: string | null;
}

/**
 * Igual a medir(), mas também estima repetição de exemplo em não ficção usando
 * os resumos factuais (server/lib/ai.ts: resumirCapitulo). Separado de medir()
 * porque só existe resumo em livros gerados depois da migration 0008 -- livros
 * antigos não têm o dado e caem no cálculo simples.
 */
export function medirComResumos(
  caminhoCategoria: string,
  capitulos: CapituloComResumo[],
  elenco?: string[],
): Metricas {
  const base = medir({ caminhoCategoria, capitulos, elenco });
  if (modoDe(caminhoCategoria) === "narrativo") return base;

  const resumos = capitulos.map((c) => vocabulario(c.resumoFatos || ""));
  let repetidos = 0;
  for (let i = 1; i < resumos.length; i++) {
    if (resumos[i].size > 0 && jaccard(resumos[i - 1], resumos[i]) > 0.35) repetidos++;
  }
  return { ...base, exemplosRepetidos: repetidos };
}
