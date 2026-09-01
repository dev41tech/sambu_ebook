import { randomUUID } from "node:crypto";
import { all, run, type EbookCategory, type LearningRow } from "./db";

/** Grupo da taxonomia a partir do caminho "Grupo > Item". */
export function grupoDaCategoria(caminho: string): string {
  return (caminho || "").split(" > ")[0].trim();
}

export async function addLearning(
  content: string,
  ebookId: string | null,
  category: EbookCategory = "geral",
  grupo = ""
) {
  const text = content.trim();
  if (!text) return;
  await run("INSERT INTO learnings (id, ebook_id, category, content, grupo) VALUES ($1, $2, $3, $4, $5)", [
    randomUUID(),
    ebookId,
    category,
    text.slice(0, 1000),
    grupo,
  ]);
}

/**
 * Aprendizados que valem para ESTE livro. Antes esta consulta nao tinha filtro
 * nenhum: os 12 mais recentes entravam em todo ebook novo, e um conselho dado a
 * um livro tecnico ("use mais exemplos numericos, cite a fonte dos dados") foi
 * parar no prompt de um romance.
 *
 * O grupo vazio pega os aprendizados anteriores a esta separacao, que ainda nao
 * tem grupo gravado -- eles seguem valendo dentro da propria categoria.
 */
export async function getRecentLearnings(
  limit = 12,
  category: EbookCategory = "geral",
  grupo = ""
): Promise<LearningRow[]> {
  return all<LearningRow>(
    `SELECT * FROM learnings
      WHERE category = $1 AND (grupo = $2 OR grupo = '')
      ORDER BY created_at DESC LIMIT $3`,
    [category, grupo, limit]
  );
}

export async function listLearnings(): Promise<LearningRow[]> {
  return all<LearningRow>("SELECT * FROM learnings ORDER BY created_at DESC");
}

export async function deleteLearning(id: string) {
  await run("DELETE FROM learnings WHERE id = $1", [id]);
}
