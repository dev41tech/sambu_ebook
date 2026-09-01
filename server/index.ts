import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import { authRouter } from "./routes/auth";
import { ebooksRouter } from "./routes/ebooks";
import { ideiasRouter } from "./routes/ideias";
import { categoriasRouter } from "./routes/categorias";
import { pexelsRouter } from "./routes/pexels";
import { referenceRouter } from "./routes/reference";
import { renderRouter } from "./routes/render";
import { localCoversRouter } from "./routes/localCovers";
import { storefrontRouter } from "./routes/storefront";
import { requireAuth } from "./lib/requireAuth";
import { sql } from "./lib/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

const app = express();
app.use(express.json({ limit: "10mb" }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    "[sambu-ebooks] SESSION_SECRET não definido no .env — usando um valor temporário só para esta execução."
  );
}

app.use(
  session({
    store: new FileStore({ path: path.resolve(__dirname, "..", "data", "sessions"), logFn: () => {} }),
    secret: sessionSecret || "dev-secret-troque-no-env",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: "lax" },
  })
);

app.use("/api/auth", authRouter);
app.use("/api/ebooks", requireAuth, ebooksRouter);
app.use("/api/ideias", requireAuth, ideiasRouter);
app.use("/api/categorias", requireAuth, categoriasRouter);
app.use("/api/pexels", requireAuth, pexelsRouter);
app.use("/api/reference", requireAuth, referenceRouter);
app.use("/api/render", requireAuth, renderRouter);
app.use("/api/local-covers", requireAuth, localCoversRouter);
// Vitrine portada do Sambu Online — monta /api/catalog, /api/progress,
// /api/favorites, /api/bookmarks, /api/subscription, /api/profile, /api/analytics.
app.use("/api", requireAuth, storefrontRouter);

if (process.env.NODE_ENV === "production") {
  const distDir = path.resolve(__dirname, "..", "dist");
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const port = Number(process.env.SERVER_PORT) || 3001;

// Confere o banco ANTES de abrir a porta. Sem isto o servidor subia, anunciava
// que estava no ar e morria logo depois com um stack trace de rejeição não
// tratada — o postgres.js emite a falha de conexão por fora da promessa da
// query, então o .catch() de quem chamou não a segura. Para quem usa, o sintoma
// era um erro genérico no login, sem nenhuma pista da causa.
async function iniciar() {
  try {
    await sql`SELECT 1`;
  } catch (err) {
    const e = err as { code?: string };
    const dica =
      e.code === "28P01"
        ? "Usuário ou senha do banco incorretos. Se a senha tiver caractere especial, codifique (@ vira %40)."
        : e.code === "3D000"
          ? "O banco indicado na DATABASE_URL não existe."
          : e.code === "ECONNREFUSED"
            ? "Nada atende nesse host/porta. Da sua máquina, use o endereço externo."
            : "Verifique a DATABASE_URL no .env.";
    console.error(
      [
        "",
        `  Não consegui conectar no Postgres (${e.code ?? "erro"}).`,
        `  ${dica}`,
        "",
        "  O servidor não sobe sem banco — o login responderia erro genérico.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`[sambu-ebooks] servidor rodando em http://localhost:${port}`);
  });
}

iniciar();
