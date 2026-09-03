-- Migration 0008 — memória factual entre capítulos.
--
-- Entre um capítulo e o seguinte passava APENAS a lista de títulos anteriores. O
-- modelo não sabia o que tinha acontecido, só como os capítulos se chamavam.
--
-- Foi isso que produziu, em "Ilha do Desespero": a jangada entra no mar no fim
-- do capítulo 4 e o capítulo 5 começa na ilha, como se nada tivesse ocorrido; e
-- os capítulos 2, 3 e 5 repetindo a mesma ideia porque nenhum sabia o que os
-- outros já tinham dito.
--
-- `resumo_fatos` guarda, por capítulo, o que de fato aconteceu ali. É gerado uma
-- vez, logo depois do capítulo, e alimenta os capítulos seguintes.
--
--   node scripts/aplicar-migration.mjs db/migrations/0008_memoria_entre_capitulos.sql
--
-- Aditiva: capítulos antigos ficam com NULL e seguem funcionando.

BEGIN;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS resumo_fatos text;

COMMIT;
