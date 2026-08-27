import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(name, scriptPath, args) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code) => {
    console.log(`[${name}] encerrou com código ${code}`);
    process.exit(code ?? 0);
  });
  return child;
}

// O servidor da API lanca no import se faltar DATABASE_URL, e morre antes de
// abrir a porta. Sem este aviso o sintoma que chega ao usuario e um "Erro 500"
// no login, que nao diz nada sobre a causa.
const temEnv = fs.existsSync(path.join(root, ".env"));
const temUrl =
  process.env.DATABASE_URL ||
  (temEnv && /^DATABASE_URL=.+/m.test(fs.readFileSync(path.join(root, ".env"), "utf-8")));

if (!temUrl) {
  console.error(
    [
      "",
      "  DATABASE_URL nao esta definida.",
      "",
      "  Desde a migracao para Postgres, o servidor da API nao sobe sem banco —",
      "  e o login responde 500 porque o proxy nao encontra ninguem na porta 3001.",
      "",
      "  Acrescente ao .env, com a string EXTERNA do Postgres:",
      "    DATABASE_URL=postgres://usuario:senha@vps.41tech.cloud:3308/ebooks",
      "",
      "  Senha com caractere especial precisa ser codificada: @ vira %40.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");

const server = run("server", tsxCli, ["watch", "--clear-screen=false", "server/index.ts"]);
const client = run("client", viteCli, []);

function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
