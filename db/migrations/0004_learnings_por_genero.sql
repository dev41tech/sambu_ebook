-- Migration 0004 — isola os aprendizados por gênero.
--
-- Motivo: getRecentLearnings() fazia "ORDER BY created_at DESC LIMIT 12" sem
-- nenhum filtro. Os dois aprendizados salvos eram de ebooks técnicos ("use mais
-- exemplos numéricos e cite a fonte dos dados") e entravam no prompt de TODO
-- ebook novo, inclusive de um romance.
--
-- A coluna `category` já existia na tabela e não era usada para filtrar. Esta
-- migration acrescenta o grupo da taxonomia como segundo eixo de isolamento.
--
--   psql "$DATABASE_URL" -f db/migrations/0004_learnings_por_genero.sql
--
-- Aditiva e idempotente: linhas existentes ficam com grupo = '' e continuam
-- valendo dentro da própria categoria, como antes.

BEGIN;

ALTER TABLE learnings ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT '';

COMMIT;
