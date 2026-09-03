-- Migration 0009 — placar objetivo de qualidade por livro.
--
-- Motivo: eu relatei que uma mudança de prompt tinha piorado a abstração de um
-- livro. Medindo, era o contrário. Sem número, cada avaliação de "melhorou" ou
-- "piorou" depende de eu ler o livro de novo e confiar na própria impressão --
-- e a impressão já errou uma vez nesta mesma sessão.
--
-- `metrics_json` guarda o resultado de server/lib/metricas.ts: diálogo por mil
-- palavras, abstração por mil, repetição entre capítulos, personagens sem
-- função, exemplos repetidos. Recalculado a cada finalização, como o gate.
--
--   node scripts/aplicar-migration.mjs db/migrations/0009_metricas_qualidade.sql
--
-- Aditiva: livros antigos ficam com NULL até serem reexportados.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS metrics_json text;

COMMIT;
