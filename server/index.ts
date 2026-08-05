import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import { authRouter } from "./routes/auth";
import { ebooksRouter } from "./routes/ebooks";
import { ideiasRouter } from "./routes/ideias";
import { requireAuth } from "./lib/requireAuth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

const app = express();
app.use(express.json({ limit: "2mb" }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    "[ebook-forge] SESSION_SECRET não definido no .env — usando um valor temporário só para esta execução."
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

if (process.env.NODE_ENV === "production") {
  const distDir = path.resolve(__dirname, "..", "dist");
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[ebook-forge] servidor rodando em http://localhost:${port}`);
});
