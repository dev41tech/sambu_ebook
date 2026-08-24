import crypto from "node:crypto";
import type { RequestHandler } from "express";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated) {
    next();
    return;
  }
  const expectedKey = process.env.AUTOMATION_API_KEY ?? "";
  const providedKey = req.header("X-Automation-Key") ?? "";
  if (expectedKey.length > 0 && providedKey.length > 0 && safeEqual(providedKey, expectedKey)) {
    next();
    return;
  }
  res.status(401).json({ error: "Não autenticado." });
};
