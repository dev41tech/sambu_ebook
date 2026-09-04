-- Schema Postgres do ebook-forge, portado do db.exec() inline de server/lib/db.ts.
--
-- Aplicar UMA VEZ, contra o banco ebook_forge, com o usuario forge:
--   psql "$DATABASE_URL_EXTERNA" -v ON_ERROR_STOP=1 -f db/schema.sql
--
-- Diferente do SQLite, este arquivo NAO roda no boot do app. Era o
-- "CREATE TABLE IF NOT EXISTS" no boot que deixava o app subir com banco vazio
-- sem reclamar, e foi assim que a perda de dados passou despercebida.

BEGIN;

-- created_at replica o formato do datetime('now') do SQLite --
-- "2026-08-26 20:19:22", UTC, com espaco. Mantido como text de proposito:
-- os ORDER BY created_at continuam corretos (ordem lexicografica = cronologica
-- neste formato) e o JSON devolvido ao front nao muda de forma.
CREATE TABLE ebooks (
  id                    text PRIMARY KEY,
  title                 text    NOT NULL DEFAULT '',
  subtitle              text    NOT NULL DEFAULT '',
  theme                 text    NOT NULL,
  audience              text    NOT NULL,
  tone                  text    NOT NULL,
  language              text    NOT NULL,
  template              text    NOT NULL,
  page_count            integer NOT NULL,
  words_per_page        integer NOT NULL DEFAULT 250,
  -- Como a extensao foi pedida: 'pages' (page_count x words_per_page) ou 'words'
  -- (word_goal direto). Paginas nunca foi entrada honesta -- a paginacao depende
  -- da diagramacao -- mas segue disponivel porque e como se pensa um livro.
  extension_mode        text    NOT NULL DEFAULT 'pages',
  word_goal             integer NOT NULL DEFAULT 0,
  author_name           text    NOT NULL DEFAULT '',
  author_bio            text    NOT NULL DEFAULT '',
  include_copyright     boolean NOT NULL DEFAULT false,
  include_about         boolean NOT NULL DEFAULT false,
  title_mode            text    NOT NULL DEFAULT 'ai',
  status                text    NOT NULL DEFAULT 'draft',
  error_message         text,
  outline_json          text,
  -- Portao de aprovacao do sumario: 'auto' escreve direto (historico),
  -- 'required' para em outline_review, 'approved' libera a escrita.
  outline_approval      text    NOT NULL DEFAULT 'auto',
  outline_approved_at   text,
  intro                 text,
  conclusion            text,
  about_author          text,
  chapters_total        integer NOT NULL DEFAULT 0,
  chapters_done         integer NOT NULL DEFAULT 0,
  current_step          text,
  -- capa
  generate_cover        boolean NOT NULL DEFAULT false,
  cover_style           text    NOT NULL DEFAULT '',
  cover_path            text,
  cover_suggestion      text    NOT NULL DEFAULT '',
  cover_alt_text        text    NOT NULL DEFAULT '',
  cover_source          text    NOT NULL DEFAULT 'ai',
  cover_stock_url       text    NOT NULL DEFAULT '',
  cover_credit          text    NOT NULL DEFAULT '',
  cover_local_file      text    NOT NULL DEFAULT '',
  -- imagens de capitulo
  generate_images       boolean NOT NULL DEFAULT false,
  image_count           integer NOT NULL DEFAULT 0,
  images_done           integer NOT NULL DEFAULT 0,
  image_suggestion      text    NOT NULL DEFAULT '',
  image_source          text    NOT NULL DEFAULT 'ai',
  -- exports (caminhos de arquivo -- continuam fora do banco)
  pdf_path              text,
  docx_path             text,
  epub_path             text,
  -- audiobook
  audio_path            text,
  audio_status          text    NOT NULL DEFAULT 'none',
  audio_error           text,
  audio_requested       boolean NOT NULL DEFAULT false,
  audio_voice           text    NOT NULL DEFAULT '',
  -- classificacao e contexto de geracao
  category              text    NOT NULL DEFAULT 'geral',
  category_main         text    NOT NULL DEFAULT '',
  categories_secondary  text    NOT NULL DEFAULT '[]',
  reference_material    text    NOT NULL DEFAULT '',
  extra_instructions    text    NOT NULL DEFAULT '',
  web_research          text    NOT NULL DEFAULT '',
  marketing_json        text,
  -- Achados da verificacao de continuidade (nomes de personagens). NULL = nunca
  -- verificado; '[]' = verificado e sem achados.
  continuity_json       text,
  -- Placar objetivo (server/lib/metricas.ts): dialogo/mil, abstracao/mil,
  -- repeticao entre capitulos, personagens sem funcao. Recalculado a cada
  -- finalizacao, para comparar mudanca de prompt sem reler o livro.
  metrics_json          text,
  version               text    NOT NULL DEFAULT 'v1.0',
  created_at            text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE chapters (
  id         text PRIMARY KEY,
  ebook_id   text    NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
  idx        integer NOT NULL,
  title      text    NOT NULL,
  summary    text    NOT NULL DEFAULT '',
  content    text    NOT NULL DEFAULT '',
  -- O que de fato aconteceu neste capitulo, gerado logo apos escreve-lo. Alimenta
  -- os capitulos seguintes: antes so os TITULOS anteriores passavam adiante, e o
  -- modelo repetia ideias e contradizia o que ele mesmo tinha escrito.
  resumo_fatos text,
  -- Quem NASCEU na prosa deste capitulo, serializado. O elenco do sumario resolve
  -- o protagonista; este resolve o resto -- sem ele cada capitulo inventava os
  -- proprios secundarios e nenhum sabia dos anteriores.
  personagens_json text,
  audio_path text
);

CREATE INDEX idx_chapters_ebook ON chapters(ebook_id);

CREATE TABLE chapter_images (
  id         text PRIMARY KEY,
  ebook_id   text NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
  chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  path       text NOT NULL,
  alt_text   text NOT NULL DEFAULT '',
  credit     text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX idx_chapter_images_chapter ON chapter_images(chapter_id);

CREATE TABLE learnings (
  id         text PRIMARY KEY,
  ebook_id   text REFERENCES ebooks(id) ON DELETE SET NULL,
  category   text NOT NULL DEFAULT 'geral',
  -- Grupo da taxonomia ("Romance", "Negocios e financas"). Segundo eixo de
  -- isolamento: sem ele, conselho dado a um livro tecnico entrava em romance.
  grupo      text NOT NULL DEFAULT '',
  content    text NOT NULL,
  created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- Tabelas da vitrine (portadas do Sambu Online). O catalogo continua sendo
-- `ebooks`; estas guardam so o que e do leitor.
CREATE TABLE reading_progress (
  id         text PRIMARY KEY,
  user_email text    NOT NULL,
  book_id    text    NOT NULL,
  chapter    integer NOT NULL DEFAULT 0,
  progress   integer NOT NULL DEFAULT 0,
  updated_at text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE UNIQUE INDEX idx_progress_owner_book ON reading_progress(user_email, book_id);

CREATE TABLE favorites (
  id         text PRIMARY KEY,
  user_email text NOT NULL,
  book_id    text NOT NULL,
  created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE UNIQUE INDEX idx_favorites_owner_book ON favorites(user_email, book_id);

CREATE TABLE bookmarks (
  id         text PRIMARY KEY,
  user_email text    NOT NULL,
  book_id    text    NOT NULL,
  chapter    integer NOT NULL DEFAULT 0,
  chapter_id text,
  label      text,
  created_at text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE UNIQUE INDEX idx_bookmarks_owner_book_chapter ON bookmarks(user_email, book_id, chapter);

CREATE TABLE subscriptions (
  id                   text PRIMARY KEY,
  user_email           text    NOT NULL UNIQUE,
  plan                 text    NOT NULL,
  status               text    NOT NULL DEFAULT 'trialing',
  current_period_end   text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at           text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at           text    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE profiles (
  email        text PRIMARY KEY,
  full_name    text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  birth_date   text NOT NULL DEFAULT '',
  locale       text NOT NULL DEFAULT 'pt-BR',
  pronouns     text NOT NULL DEFAULT '',
  country      text NOT NULL DEFAULT 'BR',
  role         text NOT NULL DEFAULT 'reader',
  created_at   text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE analytics_events (
  id         text PRIMARY KEY,
  user_email text,
  event      text NOT NULL,
  book_id    text,
  chapter_id text,
  metadata   text,
  created_at text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- Credenciais de acesso ao app. Ficam no banco, e nao num arquivo em data/,
-- porque data/ vive dentro do container sem volume montado: uma senha trocada
-- ali se perderia no primeiro redeploy. A linha e unica (CHECK id = 1), o app
-- e de usuario unico. Enquanto a tabela estiver vazia valem APP_USERNAME e
-- APP_PASSWORD do .env, que sao o estado inicial.
CREATE TABLE app_credentials (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  username      text NOT NULL,
  password_hash text NOT NULL,
  updated_at    text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- Categorias criadas a mao pelo usuario, alem da TAXONOMIA fixa de
-- src/lib/categorias.ts. Precisam de tabela porque o servidor recusa categoria
-- principal fora da lista (400 "Categoria principal invalida"): guardar so no
-- navegador faria o formulario aceitar e a criacao falhar.
-- O caminho e sempre "Grupo > Item"; nome_normalizado existe para o UNIQUE
-- ignorar caixa e acento na hora de decidir se a categoria "ja esta na lista".
CREATE TABLE custom_categories (
  id          text PRIMARY KEY,
  grupo       text NOT NULL,
  item        text NOT NULL,
  caminho     text NOT NULL,
  normalizado text NOT NULL UNIQUE,
  created_at  text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

COMMIT;
