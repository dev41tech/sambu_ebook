import Database from "better-sqlite3";
const id = "7e33c377-4423-4426-b696-7e014fa37957";
const inicio = Date.now();
for (;;) {
  const db = new Database("data/app.db", { readonly: true });
  const r = db.prepare("SELECT title, status, current_step, chapters_done, chapters_total, audio_status, audio_error, error_message FROM ebooks WHERE id = ?").get(id) as Record<string, unknown>;
  db.close();
  const min = Math.round((Date.now() - inicio) / 60000);
  console.log(`[${min}min] ${r.status} | ${r.current_step} | caps ${r.chapters_done}/${r.chapters_total} | audio ${r.audio_status}`);
  if (r.status === "error") { console.log(`ERRO: ${r.error_message}`); break; }
  // para quando o texto terminou E o audio saiu do estado inicial/andamento
  const textoPronto = r.status === "ready" || r.status === "review";
  const audioResolvido = r.audio_status === "ready" || r.audio_status === "error" || r.audio_status === "none";
  if (textoPronto && r.status === "ready" && audioResolvido && r.audio_status !== "generating") {
    console.log(`\nFINALIZADO: "${r.title}" | audio: ${r.audio_status}${r.audio_error ? " - " + r.audio_error : ""}`);
    break;
  }
  if (min > 45) { console.log("tempo limite de acompanhamento atingido"); break; }
  await new Promise((res) => setTimeout(res, 30000));
}
