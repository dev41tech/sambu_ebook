-- Migration 0011 — memória longa do livro, por bloco de capítulos.
--
-- A 0010 resolveu o elenco que nasce na prosa. Esta resolve o outro lado da
-- mesma janela: a memória entre capítulos guarda os 8 mais recentes, e tudo
-- antes disso voltava a entrar no prompt apenas como TÍTULO. Num livro de 75
-- capítulos, o 60 recebia os resumos do 52 ao 59 e nada mais — um fio aberto no
-- capítulo 3 e retomado no 70 não tinha garantia nenhuma.
--
-- `memoria_longa` guarda, por bloco de 8 capítulos, um parágrafo condensado que
-- viaja até o fim do livro ao lado da janela dos recentes. É gerado uma vez por
-- bloco (9 chamadas curtas num livro de 75 capítulos, não 75).
--
-- Formato: [{ "ate": <idx do último capítulo coberto>, "resumo": "..." }]
--
--   node scripts/aplicar-migration.mjs db/migrations/0011_memoria_longa.sql
--
-- Aditiva: livros antigos ficam com NULL e seguem com o comportamento atual —
-- só a janela dos 8 mais recentes.

BEGIN;

ALTER TABLE ebooks ADD COLUMN IF NOT EXISTS memoria_longa text;

COMMIT;
