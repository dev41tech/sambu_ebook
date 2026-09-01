-- Migration 0003 — categorias criadas pelo usuario.
--
-- Aplicar no Postgres de producao ANTES de subir a versao nova do app: sem esta
-- tabela a rota /api/categorias devolve erro e o campo de categoria fica vazio.
--
--   psql "$DATABASE_URL" -f db/migrations/0003_custom_categories.sql
--
-- Idempotente: rodar duas vezes nao quebra e nao apaga nada.

BEGIN;

CREATE TABLE IF NOT EXISTS custom_categories (
  id          text PRIMARY KEY,
  grupo       text NOT NULL,
  item        text NOT NULL,
  caminho     text NOT NULL,
  normalizado text NOT NULL UNIQUE,
  created_at  text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

COMMIT;
