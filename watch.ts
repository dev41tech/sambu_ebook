import Database from "better-sqlite3";
const db = new Database("data/app.db", { readonly: true });
const id = "7e33c377-4423-4426-b696-7e014fa37957";
const r = db.prepare("SELECT title, status, current_step, chapters_done, chapters_total, audio_status, audio_error, error_message FROM ebooks WHERE id = ?").get(id) as Record<string, unknown>;
console.log(`titulo: ${r.title || "(gerando)"}`);
console.log(`status: ${r.status} | passo: ${r.current_step} | capitulos: ${r.chapters_done}/${r.chapters_total}`);
console.log(`audio : ${r.audio_status}${r.audio_error ? " - " + r.audio_error : ""}`);
if (r.error_message) console.log(`ERRO  : ${r.error_message}`);
