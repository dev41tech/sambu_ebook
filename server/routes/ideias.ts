import { Router } from "express";
import { NICHE_IDEAS } from "../lib/nicheIdeas";

export const ideiasRouter = Router();

ideiasRouter.get("/", (_req, res) => {
  res.json(NICHE_IDEAS);
});
