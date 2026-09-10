import { Router } from "express";
import { autentica, trocaSenha, usuarioAtual } from "../lib/credentials";
import { requireAuth } from "../lib/requireAuth";
import { rota } from "../lib/rota";
import { esperaRestante, registrarFalha, registrarSucesso } from "../lib/limiteDeTentativas";

/**
 * Chave de contagem das tentativas. O `trust proxy` nao esta ligado, entao
 * `req.ip` e o endereco de quem abriu a conexao -- atras de proxy reverso isso
 * e o proprio proxy, e o limite passa a valer para todo mundo junto. Para um
 * app de um usuario so, errar para o lado restritivo e o certo.
 */
function origem(ip: string | undefined): string {
  return ip ?? "desconhecida";
}

export const authRouter = Router();

authRouter.post("/login", rota(async (req, res) => {
  const chave = origem(req.ip);

  // A checagem vem ANTES de olhar a senha: bloqueado nao paga o custo do
  // scrypt, que e justamente o que tornava o flood de login caro para o
  // servidor e barato para quem tentava.
  const espera = esperaRestante(chave);
  if (espera > 0) {
    res.setHeader("Retry-After", String(Math.ceil(espera / 1000)));
    res.status(429).json({
      error: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60000)} minuto(s).`,
    });
    return;
  }

  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    registrarFalha(chave);
    res.status(401).json({ error: "Usuário ou senha incorretos." });
    return;
  }

  if (!(await autentica(username, password))) {
    registrarFalha(chave);
    res.status(401).json({ error: "Usuário ou senha incorretos." });
    return;
  }

  registrarSucesso(chave);
  req.session.authenticated = true;
  res.json({ ok: true });
}));

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get("/me", rota(async (req, res) => {
  const autenticado = !!req.session.authenticated;
  res.json({
    authenticated: autenticado,
    // O nome so vai para quem ja esta autenticado -- fora isso seria entregar
    // metade da credencial a qualquer visitante.
    username: autenticado ? await usuarioAtual() : undefined,
  });
}));

// Troca de usuario e senha. Exige sessao ativa E a senha atual: sessao sozinha
// deixaria um navegador esquecido logado trocar a credencial.
authRouter.post("/change-password", requireAuth, rota(async (req, res) => {
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
}));
