-- Migration 0005 — achados de continuidade por ebook.
--
-- Guarda o resultado da verificação determinística de nomes (server/lib/
-- continuidade.ts), que roda ao fim da geração. É JSON e não uma tabela porque
-- os achados são sempre lidos em bloco, junto do ebook, e reescritos inteiros a
-- cada nova verificação.
--
--   psql "$DATABASE_URL" -f db/migrations/0005_achados_continuidade.sql
--
-- Aditiva e idempotente. Ebooks antigos ficam com NULL: nunca verificados.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS continuity_json text;

COMMIT;
