# Prompt — migrar o ebook-forge de SQLite para Postgres no EasyPanel

> Cole este arquivo inteiro como primeira mensagem da sessão.

---

Quero migrar este app (`ebook-forge`, repo `dev41tech/sambu_ebook`) do SQLite para um banco
Postgres no EasyPanel. O app roda em container no EasyPanel, em `sambu-ebooks.41tech.cloud`.

**Antes de escrever qualquer código, leia este briefing inteiro e confirme os números por conta
própria no repositório.** Ele foi levantado numa sessão anterior e pode ter envelhecido.

## Por que estou pedindo isso

Não é preferência por Postgres. É perda de dados.

O SQLite vive em `data/app.db`, dentro do container, e **não há volume montado no EasyPanel**.
Todo deploy cria um container novo e o sistema de arquivos volta ao estado da imagem — ebooks,
capas e base de conhecimento somem. Isso **já aconteceu** e a recuperação foi descartada: na VPS,
`docker service inspect app_sambu_ebook` devolve `null` em `ContainerSpec.Mounts`, `docker volume
ls` não lista nada, e o Swarm descarta a task anterior a cada deploy, então não sobrou container
de onde copiar.

O que torna isso traiçoeiro: `server/lib/db.ts` roda `CREATE TABLE IF NOT EXISTS` no boot. O app
**sempre sobe funcionando, sem erro nenhum**, com banco vazio. Só se percebe abrindo a tela e
vendo a lista zerada.

Um banco Postgres como serviço separado resolve de vez — ele não vive dentro do container do app.

## Estado atual, medido

- `better-sqlite3`, **SQL cru**, sem ORM e sem arquivos de migração.
- Schema criado inline em `db.exec()` no boot de `server/lib/db.ts`.
- **10 tabelas:** `ebooks`, `chapters`, `chapter_images`, `learnings`, `reading_progress`,
  `favorites`, `bookmarks`, `subscriptions`, `profiles`, `analytics_events`.
- **69 `db.prepare()`** e **117 call sites** de `.get()` / `.all()` / `.run()`, espalhados por
  **11 arquivos**: `server/lib/{db,docx,epub,generationJob,marketing,memory,pdf,tts}.ts` e
  `server/routes/{ebooks,render,storefront}.ts`.
- 1 `db.transaction()`.
- Sessões em `session-file-store`, gravando em `data/sessions` (`server/index.ts:32`).

## O trabalho real não é o schema — é síncrono virar assíncrono

Isto é o mais importante deste briefing.

`better-sqlite3` é **síncrono**: `db.prepare(sql).get(id)` devolve a linha direto. Todo driver
Postgres de Node é **assíncrono**. Então cada um dos 117 call sites vira `await`, e **toda função
que os contém vira `async`** — o que sobe em cascata por quem chama essas funções.

Traduzir as 10 tabelas para Postgres é a parte fácil. Propagar `async` por 11 arquivos, incluindo
o `generationJob.ts`, é onde mora o risco de regressão. Dimensione o trabalho por isso, não pelo
schema.

Além disso, `db.transaction()` do better-sqlite3 só aceita função síncrona. Aquele ponto precisa
ser reescrito com transação do driver.

## Como eu gostaria que fosse feito

1. **Driver: `postgres` (postgres.js), mantendo SQL cru.** Não converta para ORM. O app já tem
   SQL escrito e testado; trocar para drizzle no mesmo movimento multiplicaria a superfície de
   erro. Se um dia valer um ORM, que seja em passo separado.

2. **Um banco e um usuário próprios.** A instância Postgres do EasyPanel é compartilhada com o
   n8n — usar o superusuário `postgres` no app significa que, se o app for comprometido, os dados
   do n8n vão junto. No `psql`, como superusuário:

   ```sql
   CREATE USER forge WITH PASSWORD 'senha-forte-so-com-letras-numeros-hifen';
   CREATE DATABASE ebook_forge OWNER forge;
   \c ebook_forge
   GRANT ALL ON SCHEMA public TO forge;
   ```

   O `GRANT` não é opcional: do Postgres 15 em diante o schema `public` vem restrito e o
   `CREATE TABLE` falha sem ele.

3. **Schema em arquivo versionado**, não mais inline no boot. Um `.sql` no repositório, aplicado
   uma vez. O `CREATE TABLE IF NOT EXISTS` no boot é justamente o que escondeu a perda de dados.

4. **Conversão de tipos.** As colunas booleanas estão como `INTEGER` (`include_copyright`,
   `include_about`) — vire `boolean`. Os `_json` guardados como `TEXT` (`outline_json`) — avalie
   `jsonb`. `datetime('now')` não existe no Postgres; use `now()` ou mantenha `text` com ISO
   string, mas escolha conscientemente e seja consistente.

5. **`?` vira `$1`.** Os placeholders do SQLite não são os do Postgres. Com postgres.js, prefira
   template literal (`` sql`select ... where id = ${id}` ``), que parametriza sozinho.

## Armadilhas — já custaram tempo no app irmão

O outro Sambu (`dev41tech/ebooks`) fez exatamente esta migração. O que atrasou lá:

- **`DATABASE_URL` interna vs. externa.** São duas strings, não intercambiáveis. No app em
  runtime, o host **interno** do serviço, porta **5432**. Da sua máquina, para rodar o schema, o
  host **externo** e a porta mapeada. Usar a externa no app faz o tráfego sair para a internet e
  voltar para o container vizinho.

- **`@` na senha quebra a URL.** O `@` separa credencial de host. Precisa virar `%40` — e nas
  **duas** strings. Corrigir só uma dá a impressão de que o schema não foi aplicado. Mais simples:
  gere a senha só com letras, números, `-` e `_`.

- **Erro do Postgres tem código, e ele diz qual é o problema:** `28P01` senha errada, `3D000`
  banco não existe, `ECONNREFUSED` porta fechada. Use isso em vez de tentar às cegas.

- **Se usar `drizzle-kit`, saiba que ele falha em silêncio absoluto** com credencial errada:
  imprime `Using 'postgres' driver...` e sai sem mensagem. Confirme as tabelas direto no banco.

- **Build no EasyPanel:** se a origem estiver como "GitHub" (baixa archive), o tarball vem
  embrulhado numa pasta e o Docker não acha o `Dockerfile` — use a origem **"Git"** (clone).

## O que a migração do banco NÃO resolve

Trocar SQLite por Postgres tira o **banco** de dentro do container. **Os arquivos continuam lá** e
continuam sumindo a cada deploy:

- `data/` — `pdf_path`, `docx_path`, `audio_path` dos ebooks gerados
- `covers/` e `knowledge/`
- `data/sessions/` — o `session-file-store`; todo deploy desloga todo mundo

Os caminhos são fixos em código (`path.resolve(__dirname, "..", "..", "data")`), sem variável de
ambiente para realocar.

Duas saídas, e vale me perguntar qual eu prefiro antes de escolher:

- **Volumes no EasyPanel** em `/app/data`, `/app/covers` e `/app/knowledge` — rápido, resolve hoje,
  mas amarra o app a um único container e o backup fica por minha conta.
- **Storage externo** (Supabase Storage), como o app irmão fez — mais trabalho, mas o container
  vira descartável de verdade. Lá isso virou um adaptador `getObject`/`putObject`/`deleteObject`
  falando REST via `fetch`, sem SDK.

As sessões podem ir para o Postgres com `connect-pg-simple`, aproveitando o banco novo.

## Ordem sugerida

1. Criar banco e usuário no Postgres do EasyPanel.
2. Escrever o schema `.sql` a partir do `db.exec()` atual, convertendo os tipos.
3. Aplicar o schema pela URL externa e conferir as 10 tabelas no banco.
4. Trocar `server/lib/db.ts` para postgres.js e propagar `async` pelos 11 arquivos.
5. Configurar `DATABASE_URL` (interna) no EasyPanel e subir.
6. Só então tratar arquivos e sessões.

**Não faça tudo de uma vez sem eu revisar.** Comece pelos passos 1–3, que são reversíveis e não
tocam no código, e me mostre o schema convertido antes de encostar nos 117 call sites.

## Como verificar

Não confie em "compilou". O app sobe com banco vazio sem reclamar — foi assim que a perda passou
despercebida. Confirme as tabelas conectando no banco, e teste o fluxo completo: criar ebook,
gerar, finalizar (`POST /api/ebooks/:id/finalize`) e reabrir a lista depois de um redeploy.

Há um bug conhecido de Chromium no `/finalize` (corrigido no commit `a6641e0`, pode ainda não ter
sido redeployado) — se ele aparecer, é anterior a esta migração, não regressão dela.
