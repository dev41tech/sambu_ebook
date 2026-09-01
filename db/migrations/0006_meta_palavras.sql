-- Migration 0006 — meta de palavras como alternativa ao número de páginas.
--
-- "Páginas" nunca foi uma entrada honesta: a paginação depende da diagramação
-- (fonte, margens, formato), e o pedido de 400 páginas de "Além das Quatro
-- Linhas" entregou 257. Palavras é a unidade que a geração de fato controla.
--
-- Aditiva: `extension_mode` nasce 'pages', que é como todos os ebooks atuais
-- foram criados, e nada muda para eles.
--
--   psql "$DATABASE_URL" -f db/migrations/0006_meta_palavras.sql

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS extension_mode text NOT NULL DEFAULT 'pages';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS word_goal integer NOT NULL DEFAULT 0;

-- Ebooks existentes ganham a meta equivalente ao que foi pedido em páginas, para
-- que os dois campos contem a mesma história desde o começo.
UPDATE ebooks SET word_goal = page_count * words_per_page WHERE word_goal = 0;

COMMIT;
