import { Router } from "express";
import { searchPhotos } from "../lib/pexels";

export const pexelsRouter = Router();

pexelsRouter.get("/search", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  const orientation = req.query.orientation === "landscape" ? "landscape" : "portrait";
  if (!query) {
    res.status(400).json({ error: "Informe um termo de busca." });
    return;
  }
  try {
    const photos = await searchPhotos(query, orientation);
    res.json(photos);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao buscar fotos." });
  }
});
