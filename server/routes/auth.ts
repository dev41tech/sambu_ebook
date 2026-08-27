import { Router } from "express";
import { autentica, trocaSenha, usuarioAtual } from "../lib/credentials";
import { requireAuth } from "../lib/requireAuth";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(401).json({ error: "Usuário ou senha incorretos." });
    return;
  }

  if (!(await autentica(username, password))) {
    res.status(401).json({ error: "Usuário ou senha incorretos." });
    return;
  }

  req.session.authenticated = true;
  res.json({ ok: true });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get("/me", async (req, res) => {
  const autenticado = !!req.session.authenticated;
  res.json({
    authenticated: autenticado,
    // O nome so vai para quem ja esta autenticado -- fora isso seria entregar
    // metade da credencial a qualquer visitante.
    username: autenticado ? await usuarioAtual() : undefined,
  });
});

// Troca de usuario e senha. Exige sessao ativa E a senha atual: sessao sozinha
// deixaria um navegador esquecido logado trocar a credencial.
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const senhaAtual = String(body.current_password ?? "");
  const novoUsuario = String(body.username ?? "");
  const novaSenha = String(body.new_password ?? "");

  const resultado = await trocaSenha(senhaAtual, novoUsuario, novaSenha);
  if (!resultado.ok) {
    res.status(400).json({ error: resultado.erro });
    return;
  }

  // A sessao continua valida: quem trocou a propria senha nao precisa entrar de
  // novo, e derrubar a sessao aqui so daria a impressao de que a troca falhou.
  res.json({ ok: true });
});
