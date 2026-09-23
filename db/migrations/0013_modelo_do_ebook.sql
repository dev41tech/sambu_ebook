-- Migration 0013 — com que modelo cada ebook foi escrito.
--
-- O modelo de texto é decidido por uma variável de ambiente e não era gravado em
-- lugar nenhum. Enquanto foi sempre o mesmo, não fez falta. Deixou de ser: o
-- acervo já mistura livros escritos em gpt-4o, em gpt-5.5 e agora em
-- gpt-5.4-mini, e não há como dizer qual é qual olhando o banco.
--
-- Isso inutiliza metade do `metrics_json` (migration 0009): o placar existe para
-- comparar mudanças de prompt e de modelo entre livros, e comparar sem saber
-- quem escreveu cada um não compara nada.
--
--   node scripts/aplicar-migration.mjs db/migrations/0013_modelo_do_ebook.sql
--
-- Aditiva: livro antigo fica com NULL, que é a resposta honesta — não sabemos,
-- e preencher com um palpite seria pior do que a ausência.
--
-- Guarda o modelo da ÚLTIMA geração. Um ebook regerado depois de trocar a
-- variável passa a valer pelo modelo novo, que é o que escreveu o texto que
-- está lá.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS modelo_texto text;

COMMIT;
