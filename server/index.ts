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
import { retomarGeracoesInterrompidas } from "./lib/generationJob";
import { mensagemDeErroParaUsuario } from "./lib/sanitizar";

// Rede de seguranca do processo, antes de qualquer rota existir.
//
// Uma promise rejeitada sem dono encerra o processo no Node >= 15. Num app que
// fala com um Postgres remoto e escreve livros de trinta minutos, isso significa
// perder trabalho por causa de uma oscilacao de rede. O `rota()` das rotas ja
// entrega a rejeicao ao Express; isto aqui e o que sobra: bug em codigo
// assincrono fora de rota, callback de biblioteca, timer.
process.on("unhandledRejection", (motivo) => {
  const bruta = motivo instanceof Error ? (motivo.stack ?? motivo.message) : String(motivo);
  console.error("[processo] promise rejeitada sem tratamento (o servidor continua):", bruta);
});

// Excecao sincrona nao capturada e outra historia: dai em diante o estado do
// processo nao e confiavel, e seguir rodando pode gravar dado errado no banco.
// Sai com codigo 1 para o supervisor reiniciar -- o que hoje custa pouco,
// porque retomarGeracoesInterrompidas() recoloca na fila o livro que estava
// sendo escrito.
process.on("uncaughtException", (err) => {
  console.error("[processo] excecao nao capturada, encerrando para reiniciar limpo:", err);
  process.exit(1);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

const app = express();
// Nao anunciar o servidor. Nao impede nada sozinho, mas nao ha motivo para
// entregar a informacao de graca.
app.disable("x-powered-by");
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

  // Ultimo elo da corrente de erro: tudo que o `rota()` capturou nas rotas
  // chega aqui. Sem este handler o Express responde com a stack em HTML, que
  // ja vazou nome de variavel de ambiente para a tela uma vez -- por isso a
  // resposta passa pelo mesmo sanitizador das mensagens de geracao.
  //
  // Os quatro parametros nao sao decoracao: e a assinatura que faz o Express
  // reconhecer isto como error handler em vez de middleware comum.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Erro que ja se declara do cliente -- JSON malformado pelo body-parser,
    // payload acima do limite -- nao e falha do servidor. Responder 500 nesses
    // casos esconde um pedido errado atras de um alarme falso, e enche o log.
    const declarado = (err as { status?: number; statusCode?: number } | null)?.status
      ?? (err as { statusCode?: number } | null)?.statusCode;
    const status = typeof declarado === "number" && declarado >= 400 && declarado < 600 ? declarado : 500;

    const bruta = err instanceof Error ? (err.stack ?? err.message) : String(err);
    if (status >= 500) {
      console.error("[erro] rota falhou:", bruta);
    } else {
      console.warn(`[erro] pedido recusado (${status}):`, err instanceof Error ? err.message : String(err));
    }

    // Resposta ja comecou a ser enviada: mexer agora corrompe o corpo. Só resta
    // deixar o Express derrubar a conexao.
    if (res.headersSent) return;

    res.status(status).json({
      error:
        status >= 500
          ? mensagemDeErroParaUsuario(err instanceof Error ? err.message : String(err))
          : "Requisição inválida.",
    });
  });

  // Livros que estavam sendo escritos quando o processo anterior caiu. Precisa
  // vir depois da checagem de banco acima -- antes dela nao ha de onde ler.
  try {
    await retomarGeracoesInterrompidas();
  } catch (err) {
    // Nao impede o servidor de subir: um livro parado e pior do que o app fora
    // do ar, mas as duas coisas juntas seriam bem piores.
    console.error("[sambu-ebooks] falha ao retomar geracoes interrompidas:", err);
  }

  app.listen(port, () => {
    console.log(`[sambu-ebooks] servidor rodando em http://localhost:${port}`);
  });
}

iniciar();
