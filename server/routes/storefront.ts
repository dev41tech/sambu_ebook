// Vitrine (portada do Sambu Online). Expõe aqui, em Express + SQLite, os mesmos
// contratos de API que o componente SambuApp já consumia no projeto Next.js —
// assim a tela portada funciona sem reescrever a camada de dados.
//
// O catálogo não é uma tabela nova: são os próprios ebooks já gerados/importados
// por este app (tabela `ebooks`), expostos no formato que a vitrine espera.
import { Router } from "express";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { all, one, run, type EbookRow, type ChapterRow } from "../lib/db";

export const storefrontRouter = Router();

// App de usuário único: a identidade do leitor vem do login do próprio app.
function readerEmail(): string {
  const user = process.env.APP_USERNAME || "leitor";
  return user.includes("@") ? user : `${user}@sambu.local`;
}

const GENRE_BY_CATEGORY: Record<string, string> = {
  tecnico: "Não ficção",
  comportamental: "Contemporâneo",
  geral: "Literatura",
};

// A classificação escolhida na criação ("Grupo > Subcategoria") é o que deve
// governar a busca. O grupo vira o gênero da vitrine e a subcategoria, junto das
// secundárias, entra como tag — é sobre as tags que a busca do catálogo procura.
function classificacao(row: EbookRow): { genre: string; tags: string[] } {
  const principal = (row.category_main || "").trim();
  const tags: string[] = [];

  let secundarias: string[] = [];
  try {
    const parsed = JSON.parse(row.categories_secondary || "[]");
    if (Array.isArray(parsed)) secundarias = parsed.map((c) => String(c));
  } catch {
    secundarias = [];
  }

  for (const caminho of [principal, ...secundarias]) {
    for (const parte of caminho.split(">")) {
      const t = parte.trim();
      if (t && !tags.includes(t)) tags.push(t);
    }
  }

  const grupo = principal.includes(">") ? principal.split(">")[0].trim() : principal;
  const genre = grupo || GENRE_BY_CATEGORY[row.category] || "Literatura";
  return { genre, tags };
}

const PALETTE = ["#3b174d", "#173d3a", "#4f233c", "#1d2a4d", "#4a2318"];
const ACCENTS = ["#ed008c", "#ffb51b", "#9400ff", "#3ad0c8", "#ff6b57"];

async function toCatalogBook(row: EbookRow, index: number) {
  // COUNT() do Postgres volta como bigint, que o driver entrega em string —
  // sem o Number() o Math.ceil abaixo receberia texto.
  const countRow = await one<{ n: string }>("SELECT COUNT(*) AS n FROM chapters WHERE ebook_id = $1", [row.id]);
  const chapterCount = Number(countRow?.n ?? 0);
  // Nem todo ebook tem capa gerada; sem isso a vitrine cai no gradiente próprio
  // do card em vez de pedir uma imagem que retornaria 404.
  const hasCover = !!row.cover_path && fs.existsSync(row.cover_path);
  const classe = classificacao(row);
  return {
    coverUrl: hasCover ? `/api/catalog/cover?id=${encodeURIComponent(row.id)}` : null,
    id: row.id,
    slug: row.id,
    title: row.title || "Sem título",
    subtitle: row.subtitle || "",
    author: row.author_name || "Sambu Ebooks",
    authorId: "imported",
    genre: classe.genre,
    tags: classe.tags,
    language: row.language || "pt-BR",
    format: row.audio_status === "ready" ? "Ebook + Áudio" : "Ebook",
    ageRating: "14",
    description: row.subtitle || row.theme || "Publicado pelo Sambu Ebooks.",
    priceCents: 0,
    subscribersOnly: false,
    freeChapters: Math.max(1, Math.ceil(chapterCount / 4)),
    color: PALETTE[index % PALETTE.length],
    accent: ACCENTS[index % ACCENTS.length],
    status: "published",
  };
}

// GET /api/catalog — só ebooks prontos entram na vitrine.
storefrontRouter.get("/catalog", async (_req, res) => {
  const rows = await all<EbookRow>("SELECT * FROM ebooks WHERE status = 'ready' ORDER BY created_at DESC");
  res.json({ books: await Promise.all(rows.map((row, i) => toCatalogBook(row, i))) });
});

// GET /api/catalog/content?id= — capítulos no formato que o Reader espera.
storefrontRouter.get("/catalog/content", async (req, res) => {
  const id = String(req.query.id ?? "");
  if (!id) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const ebook = await one<EbookRow>("SELECT * FROM ebooks WHERE id = $1", [id]);
  if (!ebook) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await all<ChapterRow>("SELECT * FROM chapters WHERE ebook_id = $1 ORDER BY idx ASC", [id]);

  const sections: { title: string; content: string }[] = [];
  if (ebook.intro) sections.push({ title: "Introdução", content: ebook.intro });
  for (const row of rows) sections.push({ title: row.title, content: row.content });
  if (ebook.conclusion) sections.push({ title: "Conclusão", content: ebook.conclusion });
  if (ebook.about_author) sections.push({ title: "Sobre o autor", content: ebook.about_author });

  const chapters = sections.map((section, i) => {
    const body = section.content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const words = section.content.trim().split(/\s+/).filter(Boolean).length;
    return {
      id: `${id}-${i}`,
      number: i + 1,
      title: section.title,
      minutes: Math.max(1, Math.round(words / 200)),
      free: i < 2,
      body: body.length > 0 ? body : [section.content],
    };
  });

  res.json({ chapters });
});

// GET /api/catalog/cover?id= — reaproveita a capa já gerada pelo app.
storefrontRouter.get("/catalog/cover", async (req, res) => {
  const id = String(req.query.id ?? "");
  if (!id) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const row = await one<{ cover_path: string | null }>("SELECT cover_path FROM ebooks WHERE id = $1", [id]);
  if (!row?.cover_path || !fs.existsSync(row.cover_path)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.sendFile(row.cover_path);
});

// GET/POST /api/progress
storefrontRouter.get("/progress", async (_req, res) => {
  const rows = await all<{ book_id: string; progress: number }>(
    "SELECT book_id, progress FROM reading_progress WHERE user_email = $1",
    [readerEmail()]
  );
  res.json({ progress: Object.fromEntries(rows.map((r) => [r.book_id, r.progress])) });
});

storefrontRouter.post("/progress", async (req, res) => {
  const body = req.body ?? {};
  const bookId = String(body.bookId ?? "");
  const progress = Number(body.progress);
  if (!bookId || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  // datetime('now') e do SQLite; o to_char abaixo reproduz o mesmo formato usado
  // nos DEFAULT do schema, para as datas continuarem comparaveis como texto.
  await run(
    `INSERT INTO reading_progress (id, user_email, book_id, chapter, progress, updated_at)
     VALUES ($1, $2, $3, $4, $5, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT(user_email, book_id)
     DO UPDATE SET chapter = excluded.chapter, progress = excluded.progress, updated_at = excluded.updated_at`,
    [randomUUID(), readerEmail(), bookId, Number(body.chapter) || 0, progress]
  );
  res.json({ ok: true });
});

// GET/POST /api/favorites
storefrontRouter.get("/favorites", async (_req, res) => {
  const rows = await all<{ book_id: string }>("SELECT book_id FROM favorites WHERE user_email = $1", [
    readerEmail(),
  ]);
  res.json({ favorites: rows.map((r) => r.book_id) });
});

storefrontRouter.post("/favorites", async (req, res) => {
  const body = req.body ?? {};
  const bookId = String(body.bookId ?? "");
  if (!bookId || typeof body.favorite !== "boolean") {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  if (body.favorite) {
    await run(
      `INSERT INTO favorites (id, user_email, book_id) VALUES ($1, $2, $3)
       ON CONFLICT(user_email, book_id) DO NOTHING`,
      [randomUUID(), readerEmail(), bookId]
    );
  } else {
    await run("DELETE FROM favorites WHERE user_email = $1 AND book_id = $2", [readerEmail(), bookId]);
  }
  res.json({ ok: true, bookId, favorite: body.favorite });
});

// GET/POST /api/bookmarks
storefrontRouter.get("/bookmarks", async (req, res) => {
  const bookId = req.query.bookId ? String(req.query.bookId) : null;
  const rows = bookId
    ? await all("SELECT * FROM bookmarks WHERE user_email = $1 AND book_id = $2", [readerEmail(), bookId])
    : await all("SELECT * FROM bookmarks WHERE user_email = $1", [readerEmail()]);
  res.json({ bookmarks: rows });
});

storefrontRouter.post("/bookmarks", async (req, res) => {
  const body = req.body ?? {};
  const bookId = String(body.bookId ?? "");
  const chapter = Number(body.chapter);
  if (!bookId || !Number.isInteger(chapter)) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  if (body.active === false) {
    await run("DELETE FROM bookmarks WHERE user_email = $1 AND book_id = $2 AND chapter = $3", [
      readerEmail(),
      bookId,
      chapter,
    ]);
    res.json({ ok: true, active: false });
    return;
  }
  await run(
    `INSERT INTO bookmarks (id, user_email, book_id, chapter, chapter_id, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(user_email, book_id, chapter)
     DO UPDATE SET chapter_id = excluded.chapter_id, label = excluded.label`,
    [
      randomUUID(),
      readerEmail(),
      bookId,
      chapter,
      String(body.chapterId ?? ""),
      String(body.label ?? "").slice(0, 120),
    ]
  );
  res.json({ ok: true, active: true });
});

// GET/POST /api/subscription
const PLANS = new Set(["immersive_monthly", "immersive_annual", "family_monthly"]);

storefrontRouter.get("/subscription", async (_req, res) => {
  const row = (await one("SELECT * FROM subscriptions WHERE user_email = $1", [readerEmail()])) ?? null;
  res.json({ subscription: row });
});

storefrontRouter.post("/subscription", async (req, res) => {
  const plan = String(req.body?.plan ?? "");
  if (!PLANS.has(plan)) {
    res.status(400).json({ error: "invalid_plan" });
    return;
  }
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 7);
  await run(
    `INSERT INTO subscriptions (id, user_email, plan, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, 'trialing', $4, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT(user_email)
     DO UPDATE SET plan = excluded.plan, status = 'trialing',
                   current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    [randomUUID(), readerEmail(), plan, periodEnd.toISOString()]
  );
  res.json({ ok: true, plan, message: "Teste de 7 dias liberado" });
});

// GET/PATCH /api/profile
storefrontRouter.get("/profile", async (_req, res) => {
  const email = readerEmail();
  const row = await one<Record<string, unknown>>("SELECT * FROM profiles WHERE email = $1", [email]);
  res.json({
    profile: row ?? { email, displayName: email.split("@")[0], role: "reader" },
  });
});

storefrontRouter.patch("/profile", async (req, res) => {
  const body = req.body ?? {};
  const email = readerEmail();
  const displayName = String(body.displayName ?? "").trim().slice(0, 80) || email.split("@")[0];
  await run(
    `INSERT INTO profiles (email, full_name, display_name, phone, birth_date, locale, pronouns, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(email) DO UPDATE SET
       full_name = excluded.full_name, display_name = excluded.display_name,
       phone = excluded.phone, birth_date = excluded.birth_date,
       locale = excluded.locale, pronouns = excluded.pronouns, country = excluded.country`,
    [
      email,
      String(body.fullName ?? "").slice(0, 120),
      displayName,
      String(body.phone ?? "").slice(0, 40),
      String(body.birthDate ?? "").slice(0, 20),
      String(body.locale ?? "pt-BR").slice(0, 10),
      String(body.pronouns ?? "").slice(0, 40),
      String(body.country ?? "BR").slice(0, 4),
    ]
  );
  res.json({ ok: true });
});

// POST /api/analytics
storefrontRouter.post("/analytics", async (req, res) => {
  const body = req.body ?? {};
  const event = String(body.event ?? "");
  if (!event || event.length > 80) {
    res.status(400).json({ error: "invalid_event" });
    return;
  }
  await run(
    `INSERT INTO analytics_events (id, user_email, event, book_id, chapter_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      readerEmail(),
      event,
      body.bookId ? String(body.bookId) : null,
      body.chapterId ? String(body.chapterId) : null,
      body.metadata ? JSON.stringify(body.metadata) : null,
    ]
  );
  res.status(201).json({ ok: true });
});
