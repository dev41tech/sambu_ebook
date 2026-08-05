import { randomUUID } from "node:crypto";
import { db, type EbookCategory, type LearningRow } from "./db";

export function addLearning(content: string, ebookId: string | null, category: EbookCategory = "geral") {
  const text = content.trim();
  if (!text) return;
  db.prepare("INSERT INTO learnings (id, ebook_id, category, content) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    ebookId,
    category,
    text.slice(0, 1000)
  );
}

export function getRecentLearnings(limit = 12): LearningRow[] {
  return db.prepare("SELECT * FROM learnings ORDER BY created_at DESC LIMIT ?").all(limit) as LearningRow[];
}

export function listLearnings(): LearningRow[] {
  return db.prepare("SELECT * FROM learnings ORDER BY created_at DESC").all() as LearningRow[];
}

export function deleteLearning(id: string) {
  db.prepare("DELETE FROM learnings WHERE id = ?").run(id);
}
