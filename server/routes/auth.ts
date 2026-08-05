import { Router } from "express";
import crypto from "node:crypto";

export const authRouter = Router();

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const expectedUser = process.env.APP_USERNAME ?? "";
  const expectedPass = process.env.APP_PASSWORD ?? "";

  const ok =
    typeof username === "string" &&
    typeof password === "string" &&
    expectedUser.length > 0 &&
    expectedPass.length > 0 &&
    safeEqual(username, expectedUser) &&
    safeEqual(password, expectedPass);

  if (!ok) {
    res.status(401).json({ error: "Usuário ou senha incorretos." });
    return;
  }
  req.session.authenticated = true;
  res.json({ ok: true });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get("/me", (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});
