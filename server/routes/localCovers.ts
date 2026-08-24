import { Router } from "express";
import multer from "multer";
import { listLocalCovers, resolveLocalCoverPath, saveUploadedCover } from "../lib/localCovers";

export const localCoversRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

localCoversRouter.get("/", (_req, res) => {
  res.json(listLocalCovers());
});

localCoversRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Envie uma imagem .jpg, .jpeg, .png ou .webp." });
    return;
  }
  try {
    const saved = saveUploadedCover(req.file.buffer, req.file.originalname);
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Falha ao salvar a imagem." });
  }
});

localCoversRouter.get("/:filename/preview", (req, res) => {
  try {
    const filePath = resolveLocalCoverPath(req.params.filename);
    res.set("Cache-Control", "no-store");
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Arquivo não encontrado." });
  }
});
