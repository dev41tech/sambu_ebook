import { Router } from "express";
import multer from "multer";
import { extractTextFromUrl, extractTextFromPdf } from "../lib/reference";

export const referenceRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

referenceRouter.post("/url", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) {
    res.status(400).json({ error: "Informe um link." });
    return;
  }
  try {
    const result = await extractTextFromUrl(url);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao extrair o conteúdo do link." });
  }
});

referenceRouter.post("/pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Envie um arquivo PDF." });
    return;
  }
  try {
    const result = await extractTextFromPdf(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao extrair o conteúdo do PDF." });
  }
});
