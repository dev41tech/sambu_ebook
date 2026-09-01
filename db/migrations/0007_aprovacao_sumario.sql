-- Migration 0007 — aprovação humana do sumário antes da escrita.
--
-- Motivo concreto: "Além das Quatro Linhas" custou US$ 1,33 e 33 minutos para
-- produzir um livro em que 36 dos 84 capítulos tinham um casal diferente do
-- protagonista. Se o sumário e o elenco passassem pelos olhos do autor antes da
-- escrita, o problema apareceria por centavos.
--
-- `outline_approval` controla o portão:
--   'auto'     — comportamento historico: escreve direto, sem parar (padrão)
--   'required' — para em status 'outline_review' e espera aprovação
--   'approved' — aprovado, a escrita segue
--
-- Nasce 'auto' para que todo ebook existente e todo fluxo automatizado (n8n)
-- continuem funcionando exatamente como antes.
--
--   node scripts/aplicar-migration.mjs db/migrations/0007_aprovacao_sumario.sql

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS outline_approval text NOT NULL DEFAULT 'auto';
ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS outline_approved_at text;

COMMIT;
