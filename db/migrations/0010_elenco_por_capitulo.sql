-- Migration 0010 — elenco criado na prosa, registrado por capítulo.
--
-- O elenco do sumário resolve o protagonista, não o resto. O bloco de elenco
-- dizia, em toda chamada de capítulo, que "personagens secundários novos são
-- permitidos" — e como as chamadas não se conhecem, cada uma inventava os seus.
-- Num livro de 75 capítulos são 75 elencos de apoio descartáveis: é o
-- personagem que aparece uma vez e some.
--
-- `personagens_json` guarda quem NASCEU na prosa de cada capítulo. A passada de
-- resumo que já rodava (resumo_fatos) passou a devolver essa lista na mesma
-- chamada, sem custo novo, e os capítulos seguintes recebem o elenco do sumário
-- somado a quem foi registrado até ali.
--
--   node scripts/aplicar-migration.mjs db/migrations/0010_elenco_por_capitulo.sql
--
-- Aditiva: capítulos antigos ficam com NULL, o elenco volta a ser só o do
-- sumário e nada quebra.

BEGIN;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS personagens_json text;

COMMIT;

-- NOTA sobre `chapters.state_json`, se ela existir neste banco: é uma coluna
-- órfã, criada por uma tentativa anterior de memória entre capítulos que não foi
-- adiante. Nenhum código lê ou escreve nela. Removê-la é seguro, mas fica como
-- decisão à parte, fora desta migration, porque DROP COLUMN não tem volta:
--
--   ALTER TABLE chapters DROP COLUMN IF EXISTS state_json;
