import { randomUUID } from "node:crypto";
import { all, run, type EbookCategory, type LearningRow } from "./db";

export async function addLearning(content: string, ebookId: string | null, category: EbookCategory = "geral") {
  const text = content.trim();
  if (!text) return;
  await run("INSERT INTO learnings (id, ebook_id, category, content) VALUES ($1, $2, $3, $4)", [
    randomUUID(),
    ebookId,
    category,
    text.slice(0, 1000),
  ]);
}

export async function getRecentLearnings(limit = 12): Promise<LearningRow[]> {
  return all<LearningRow>("SELECT * FROM learnings ORDER BY created_at DESC LIMIT $1", [limit]);
}

export async function listLearnings(): Promise<LearningRow[]> {
  return all<LearningRow>("SELECT * FROM learnings ORDER BY created_at DESC");
}

export async function deleteLearning(id: string) {
  await run("DELETE FROM learnings WHERE id = $1", [id]);
}
