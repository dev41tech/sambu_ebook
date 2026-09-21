-- Migration 0012 — número de capítulos escolhido pelo usuário.
--
-- Até aqui a quantidade de capítulos saía só da conta palavras / PALAVRAS_POR_CAPITULO
-- (server/lib/ai.ts:chapterCountFor), sem o usuário ver nem poder mudar antes de
-- gerar. `chapter_count` guarda a escolha feita na tela de criação; NULL mantém a
-- conta automática, que é como todos os ebooks atuais se comportam.
--
--   node scripts/aplicar-migration.mjs db/migrations/0012_numero_de_capitulos.sql
--
-- Aditiva: o código anterior não lê a coluna, então aplicar antes do deploy é seguro.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS chapter_count integer;

COMMIT;
