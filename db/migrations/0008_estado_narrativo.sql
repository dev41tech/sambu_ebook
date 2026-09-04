-- Migration 0008 — estado narrativo acumulado entre capítulos.
--
-- Motivo concreto: cada capítulo era escrito conhecendo apenas os TÍTULOS dos
-- anteriores, nunca o texto. Um personagem secundário criado na prosa do
-- capítulo 12 não existia em lugar nenhum quando o capítulo 13 era escrito —
-- aparecia uma vez e sumia. Num livro de 75 capítulos isso são 75 chamadas
-- independentes, cada uma inventando o próprio elenco de apoio.
--
-- `state_json` guarda, por capítulo, o que ele deixou para trás:
--   { "resumo": "...", "personagensNovos": [...], "fiosAbertos": [...] }
--
-- O capítulo seguinte recebe os resumos mais recentes, os fios abertos e o
-- elenco acumulado. Ver server/lib/ai.ts (EstadoCapitulo, separarEstado).
--
-- Por que uma coluna nova e não `chapters.summary`: aquela guarda o resumo
-- PLANEJADO pelo sumário, gravado antes da escrita, e é o que a etapa de imagens
-- usa como descrição do capítulo (generateChapterImage). Sobrescrevê-la mudaria
-- as imagens geradas.
--
-- Aditiva e idempotente: nasce vazia, e capítulo sem estado apenas não entra no
-- histórico repassado — todo ebook existente continua funcionando como antes.
--
--   node scripts/aplicar-migration.mjs db/migrations/0008_estado_narrativo.sql

BEGIN;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS state_json text NOT NULL DEFAULT '';

COMMIT;
