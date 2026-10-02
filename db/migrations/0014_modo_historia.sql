-- Migration 0014 — ícone "História": o autor diz que o livro é uma história.
--
-- O modo narrativo (elenco fixo, função de cada capítulo, clímax e desfecho) era
-- ligado SÓ pelo nome da categoria (src/lib/categorias.ts, ehFiccao). Categoria
-- criada à mão que não contém "romance/ficção/fantasia/terror/suspense/conto/
-- novela/thriller" escapava: "O Sal que Mora em Nós" ("Minhas categorias > Drama
-- Familiar") foi escrito como livro de não ficção.
--
--   node scripts/aplicar-migration.mjs db/migrations/0014_modo_historia.sql
--
-- Aditiva. NULL = automático (vale a categoria, como sempre foi); true = é
-- história; false = não é, mesmo que a categoria pareça ficção. Livro antigo
-- fica NULL e continua exatamente como estava. Autorizada pelo Marcos em
-- 02/10/2026.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS historia boolean;

COMMIT;
