import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEPARADOR } from "../../src/lib/categorias";
import { modoDe, type Modo } from "../../src/lib/modos";

// Guias editoriais (03/10/2026): o que antes eram regras escritas no código
// (vozes.ts) vira texto em server/guias/, um arquivo por modo e, opcionalmente,
// um por gênero (o grupo da categoria: "Romance", "Suspense e mistério"...).
//
// É o "caminho A" de levar uma skill para dentro do app: as skills do Claude
// Code só valem quando alguém conversa com o Claude; o Sambu gera sozinho, então
// o conhecimento editorial precisa estar onde a geração lê. Melhorar um gênero
// passa a ser editar um .md, sem mexer em código.
//
// Cada guia tem as mesmas seções, uma para cada etapa da geração:
//   ## Promessa   -> sumário e editor do sumário: o que o leitor espera do livro
//   ## Estrutura  -> sumário: o que cada parte do livro precisa fazer
//   ## Escrita    -> prompt de sistema de cada capítulo
//   ## Auditoria  -> auditor por capítulo: o que reprova um capítulo
//   ## Leitora    -> leitura final: as perguntas do leitor do público
// O guia do gênero SOMA ao do modo, seção por seção.

export const SECOES = ["promessa", "estrutura", "escrita", "auditoria", "leitora"] as const;
export type Secao = (typeof SECOES)[number];
export type Guia = Record<Secao, string>;

const VAZIO: Guia = { promessa: "", estrutura: "", escrita: "", auditoria: "", leitora: "" };

const semAcento = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Lê um guia em Markdown. Título (#) e seções desconhecidas são ignorados. */
export function parseGuia(md: string): Guia {
  const guia: Guia = { ...VAZIO };
  let atual: Secao | null = null;
  const linhas: Record<Secao, string[]> = { promessa: [], estrutura: [], escrita: [], auditoria: [], leitora: [] };
  for (const linha of md.replace(/\r\n/g, "\n").split("\n")) {
    const m = linha.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const nome = semAcento(m[1]);
      atual = (SECOES as readonly string[]).includes(nome) ? (nome as Secao) : null;
      continue;
    }
    if (/^#\s/.test(linha)) {
      atual = null;
      continue;
    }
    if (atual) linhas[atual].push(linha);
  }
  for (const s of SECOES) guia[s] = linhas[s].join("\n").trim();
  return guia;
}

/** Soma o guia do gênero ao do modo, seção por seção. */
export function juntarGuias(base: Guia, extra: Guia | null): Guia {
  if (!extra) return base;
  const r: Guia = { ...VAZIO };
  for (const s of SECOES) r[s] = [base[s], extra[s]].filter(Boolean).join("\n\n");
  return r;
}

/** Nome do arquivo do guia de gênero: o grupo da categoria, sem acento, com hífens. */
export function slugDoGenero(caminho: string): string {
  const grupo = (caminho || "").split(SEPARADOR)[0] ?? "";
  return semAcento(grupo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "guias");
const cache = new Map<string, Guia | null>();

function lerGuia(relativo: string): Guia | null {
  if (cache.has(relativo)) return cache.get(relativo)!;
  const arquivo = path.join(PASTA, relativo);
  const guia = existsSync(arquivo) ? parseGuia(readFileSync(arquivo, "utf8")) : null;
  cache.set(relativo, guia);
  return guia;
}

export function guiaDoModo(modo: Modo): Guia {
  const g = lerGuia(`${modo}.md`);
  // Sem o guia do modo o livro seria escrito sem regra nenhuma de gênero. Isso
  // só acontece se o arquivo sumir do deploy; o teste guias.test.ts impede que
  // saia do repositório incompleto.
  if (!g) console.error(`[guias] guia do modo "${modo}" não encontrado em ${PASTA}.`);
  return g ?? { ...VAZIO };
}

/** Guia completo de um livro: o do modo da categoria somado ao do gênero, se houver. */
export function guiaDe(caminho: string): Guia {
  const slug = slugDoGenero(caminho);
  return juntarGuias(guiaDoModo(modoDe(caminho)), slug ? lerGuia(path.join("generos", `${slug}.md`)) : null);
}
