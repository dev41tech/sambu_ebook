# Rodar o projeto em outra máquina

O que o `git clone` traz e o que ele **não** traz.

## 1. Requisitos

- Node.js 22.13 ou superior
- Acesso ao Postgres do EasyPanel (a porta externa 3308 precisa estar liberada)

## 2. Clonar e instalar

```bash
git clone https://github.com/dev41tech/sambu_ebook.git ebook-forge
cd ebook-forge
npm install
```

> No Windows, `npm ci` costuma falhar com `EBUSY` em `node_modules/workerd`
> (antivírus segurando arquivos). Use `npm install`.

## 3. O `.env` — a única parte que não vem do git

O arquivo é ignorado de propósito. Copie o `.env.example` e preencha:

```bash
cp .env.example .env
```

Mínimo para o app subir e logar:

```text
DATABASE_URL=postgres://forge:SENHA@vps.41tech.cloud:3308/ebook_forge
APP_USERNAME=...
APP_PASSWORD=...
SESSION_SECRET=<qualquer texto aleatório longo>
OPENAI_API_KEY=...
```

Atenção a dois pontos:

- **Da sua máquina, use `vps.41tech.cloud:3308`.** O host interno com `:5432` só
  resolve de dentro do container.
- **Senha com caractere especial precisa ser codificada:** `@`→`%40`, `:`→`%3A`,
  `/`→`%2F`, `#`→`%23`, `%`→`%25`, `&`→`%26`. Um `@` cru quebra a URL e o erro
  que aparece é `28P01`, que parece senha errada.

Os demais (`ELEVENLABS_*`, `PEXELS_API_KEY`, `TAVILY_API_KEY`, `CHROME_PATH`) só
são necessários para audiobook, banco de imagens, pesquisa na web e exportação em
PDF.

## 4. Subir

```bash
npm run dev
```

O script confere a `DATABASE_URL` antes de subir e explica o que falta, se faltar.
Frontend em `localhost:5173`, API em `3001`, vitrine em `/loja.html`.

**Os dados vêm junto.** Desde a migração para Postgres, os ebooks vivem no banco
remoto — a nova máquina enxerga os mesmos 35 ebooks sem copiar nada.

## 5. O que NÃO vem, e é a parte que engana

`data/` está fora do git — é **1 GB** de arquivos gerados:

| Pasta | Tamanho | O que é |
|---|---|---|
| `data/exports` | 571 MB | PDFs, EPUBs, DOCX e áudios |
| `data/lote` | 281 MB | arquivos de geração em lote |
| `data/images` | 140 MB | capas e imagens de capítulo |

O banco é compartilhado, mas essas pastas não. O que isso causa depende do tipo
de arquivo, e a diferença é grande:

| | Numa máquina que não gerou o arquivo |
|---|---|
| **PDF, EPUB, DOCX** | **Baixam normalmente.** O servidor refaz o arquivo na hora, a partir do texto que está no banco (≈3 s, inclusive o PDF) |
| **Capas e imagens de capítulo** | **Não aparecem.** São arquivos de imagem, não têm como ser reconstruídos a partir do texto |
| **Audiobook** | **Não baixa.** Refazer custaria cota paga da ElevenLabs, então o servidor se recusa e avisa |

A reconstrução acontece sozinha, no próprio download (`server/routes/ebooks.ts`,
`enviarExport`), e só para livro que já tinha sido exportado alguma vez. Livro que
nunca foi exportado continua respondendo "ainda não está pronto", que é a
verdade. O caminho novo gravado no banco é **só o nome do arquivo** — caminho
absoluto de registro antigo continua sendo aceito na leitura.

Consequência prática: **os exports não são mais motivo para copiar `data/`.** Se
quiser as capas dos livros antigos, aí sim é preciso copiar `data/images` (140 MB)
— ou regerar a capa pela tela, que é mais rápido do que mover 1 GB.

## 6. Sambu Online, se for mexer nele também

```bash
git clone https://github.com/dev41tech/ebooks.git sambu-online
cd sambu-online
npm install
```

O `.env` dele precisa de outras variáveis, e o banco é **`ebooks`**, não
`ebook_forge`:

```text
DATABASE_URL=postgres://sambu:SENHA@vps.41tech.cloud:3308/ebooks
SUPABASE_URL=https://twmqlsvqdkhrtukyamdp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API>
SUPABASE_STORAGE_BUCKET=sambu
ADMIN_EMAILS=<seu e-mail>
```

Para rodar:

```bash
BUILD_TARGET=node npx vite --port 5174
```

Ali os arquivos ficam no Supabase Storage, não em disco — então esse projeto não
tem o problema do item 5.

## 7. Contexto do que já foi feito

O histórico das sessões de trabalho está no Obsidian, em
`Memory-System/Projects/Sambu Ebooks/Sessions/` e
`Memory-System/Projects/Sambu Online/Sessions/`. Vale ler antes de continuar:
há decisões e armadilhas registradas que não estão no código.
