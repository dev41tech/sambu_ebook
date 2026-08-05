import type { RequestHandler } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.session?.authenticated) {
    next();
    return;
  }
  res.status(401).json({ error: "Não autenticado." });
};
