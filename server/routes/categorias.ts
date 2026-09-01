import { Router } from "express";
import crypto from "node:crypto";
import { all, one, run } from "../lib/db";
import {
  CATEGORIAS,
  GRUPO_PERSONALIZADO,
  SEPARADOR,
  limparNomeCategoria,
  normalizarCategoria,
} from "../../src/lib/categorias";

export const categoriasRouter = Router();

export interface CustomCategoryRow {
  id: string;
  grupo: string;
  item: string;
  caminho: string;
  normalizado: string;
}

/** Caminhos criados pelo usuario, em ordem alfabetica. */
export async function listarPersonalizadas(): Promise<CustomCategoryRow[]> {
  return all<CustomCategoryRow>(
    "SELECT id, grupo, item, caminho, normalizado FROM custom_categories ORDER BY item",
  );
}

// Usada pela validacao de /api/ebooks: uma categoria criada aqui precisa passar
// no mesmo portao que recusa categoria principal fora da lista.
export async function isCategoriaPersonalizada(caminho: string): Promise<boolean> {
  const row = await one<{ id: string }>(
    "SELECT id FROM custom_categories WHERE normalizado = $1",
    [normalizarCategoria(caminho)],
  );
  return !!row;
}

categoriasRouter.get("/", async (_req, res) => {
  const personalizadas = await listarPersonalizadas();
  res.json({ fixas: CATEGORIAS, personalizadas: personalizadas.map((c) => c.caminho) });
});

categoriasRouter.post("/", async (req, res) => {
  const item = limparNomeCategoria(String(req.body?.item ?? ""));
  if (!item) {
    res.status(400).json({ error: "Informe o nome da categoria." });
    return;
  }

  const caminho = `${GRUPO_PERSONALIZADO}${SEPARADOR}${item}`;
  const chave = normalizarCategoria(caminho);

  // "Acrescente so quando nao estiver na lista": se o nome ja existe na taxonomia
  // fixa, devolvemos o caminho dela em vez de criar uma copia num grupo diferente.
  const naTaxonomia = CATEGORIAS.find(
    (c) => normalizarCategoria(c.split(SEPARADOR).pop() ?? "") === normalizarCategoria(item),
  );
  if (naTaxonomia) {
    res.json({ caminho: naTaxonomia, criada: false, motivo: "ja existe na lista" });
    return;
  }

  const existente = await one<{ caminho: string }>(
    "SELECT caminho FROM custom_categories WHERE normalizado = $1",
    [chave],
  );
  if (existente) {
    res.json({ caminho: existente.caminho, criada: false, motivo: "ja existe na lista" });
    return;
  }

  // ON CONFLICT porque duas abas abertas podem enviar o mesmo nome ao mesmo
  // tempo: sem isto o UNIQUE derrubaria a segunda com erro 500.
  await run(
    `INSERT INTO custom_categories (id, grupo, item, caminho, normalizado)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (normalizado) DO NOTHING`,
    [crypto.randomUUID(), GRUPO_PERSONALIZADO, item, caminho, chave],
  );

  res.status(201).json({ caminho, criada: true });
});
