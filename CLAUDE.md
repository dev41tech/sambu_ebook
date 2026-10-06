# Sambu Ebooks

App pessoal do Marcos para gerar ebooks por IA (ficção e não ficção), revisar e exportar em PDF, DOCX e EPUB. Não é projeto do grupo empresarial e não é SaaS pago.

- Repositório: `dev41tech/sambu_ebook`. A `main` é publicada na VPS pelo EasyPanel (Dockerfile na raiz).
- Stack: Vite + React + Tailwind (`src/`), Express rodando com `tsx` (`server/`), Postgres, OpenAI para texto.

## Comandos

```bash
npm run dev                 # frontend (5173) + API; local use o preview "sambu-ebooks-local" (API na 3011)
npm test                    # tsx --test server/lib/*.test.ts src/lib/*.test.ts
npx tsc --noEmit -p .       # checagem de tipos (cobre src e server)
npm run build               # build do frontend (vite)
node scripts/conferir-colunas.mjs ebooks chapters          # leitura: colunas do banco
node scripts/aplicar-migration.mjs db/migrations/NNNN.sql  # só com autorização (ver regras)
```

Antes de qualquer commit: tipos limpos, `npm test` passando e, se mexeu no frontend, `npm run build`.

## Regras que não podem ser quebradas

1. **O banco local é o banco de produção.** `DATABASE_URL` aponta para o mesmo Postgres da VPS. Toda escrita feita daqui aparece no app publicado.
2. **Migration só com autorização explícita do Marcos, a cada vez.** Arquivo novo em `db/migrations/`, aplicado com `scripts/aplicar-migration.mjs` e conferido com `conferir-colunas.mjs`. Prefira soluções sem migration (ex.: a trava de geração usa `pg_try_advisory_lock`).
3. **Push na `main` é deploy.** Só faça push quando o Marcos pedir. Trabalhe em branch e faça merge `--no-ff`.
4. **Não acione narração/audiobook** (`/api/ebooks/:id/audiobook`, `tts.ts`) sem pedido: consome cota paga da ElevenLabs.
5. **Nunca digite usuário ou senha** em formulário, nem do próprio app. Para chamar a API sem login use o header `X-Automation-Key` (`AUTOMATION_API_KEY`, ver `server/lib/requireAuth.ts`).
6. **Nunca imprima objeto de API inteiro nem valores do `.env`.** Extraia só os campos necessários.
7. **Gerar livro custa dinheiro.** Cada geração de teste cria uma linha no banco de produção e gasta OpenAI. Gere só o necessário e diga ao Marcos o que foi criado.

## Armadilhas conhecidas

- **Heredoc do Bash no Windows corrompe barra invertida** (`\b` vira caractere de controle, `\\n` muda). Para código com regex ou escapes, use as ferramentas Write/Edit ou um script `.py` gravado com Write. Depois de um patch, confira com `grep -rlP '\x08' server src`.
- **Finais de linha:** `core.autocrlf=true`; os arquivos no disco podem estar em CRLF ou LF. Em scripts de patch, normalize para `\n`, aplique e devolva o final original.
- **Porta do backend é `SERVER_PORT`**, não `PORT` (o preview do Claude injeta `PORT=5173`).
- **Geração por script fora do servidor:** a rota `GET /api/ebooks/:id` chama `ensureGenerationRunning`. A trava entre processos (`runJob` em `generationJob.ts`) impede a geração dupla, mas não abra a página do livro durante um teste por script se a trava estiver desligada ou em versão antiga.
- **`RETOMAR_GERACOES_NO_BOOT=0`** no servidor local, para ele não retomar livros que a VPS está gerando.
- **Modelo de raciocínio (gpt-5.5):** os tokens de pensamento saem do mesmo teto do texto. `askOpenAI` mantém uma reserva de raciocínio que se calibra sozinha; não aumente tetos "no olho".

## Como um livro é gerado (`server/lib/generationJob.ts`)

1. **Pesquisa** opcional (Tavily).
2. **Sumário** (`generateOutline` em `ai.ts`):
   - ficção: elenco com destino, função e resultado por capítulo, `verdadeCentral`, `fios`; conferido por `historia.ts`;
   - promessas do pedido (`src/lib/promessas.ts`): romance, revelação em camadas, final inesperado. Na conta automática a história ganha capítulos para caber o que promete;
   - premissa escolhida entre 5 e sumário escolhido entre 3 por um editor (`avaliarSumario`), com uma revisão em cima do melhor;
   - não ficção: `tese` e `perguntasDoLeitor` (`naoFiccao.ts`).
3. **Aprovação do sumário** opcional (`outline_approval = required` → status `outline_review`).
4. **Capítulos**, um a um: escrita → humanização → expansão se curto → travessão → concretização → nomes curtos → **auditor** (`auditarCapitulo`), que reescreve uma vez se achar problema grave. Resumo de cada capítulo alimenta a memória dos seguintes.
5. **Verificação de continuidade** e, por fim, **leitura de editor e leitora** (`leituraEditorial`); na ficção, segunda chance para o último capítulo se a nota ficar abaixo de 8.
6. Status `review`: o usuário revisa e clica em finalizar para exportar.

Status do ebook: `draft`, `generating`, `outline_review`, `review`, `ready`, `error`.

## Guias editoriais (`server/guias/`)

As regras de cada gênero são texto, não código. Um arquivo por modo (`narrativo`, `saude`, `comportamento`, `financas`, `tecnico`, `pratico`) e, opcionalmente, um por gênero em `generos/<grupo-da-categoria>.md` (ex.: `romance.md`, `suspense-e-misterio.md`), que soma ao do modo.

Cada guia tem cinco seções, lidas por `server/lib/guias.ts`:

| Seção | Onde entra |
|---|---|
| `## Promessa` | sumário e editor do sumário |
| `## Estrutura` | sumário |
| `## Escrita` | prompt de sistema de cada capítulo |
| `## Auditoria` | auditor por capítulo (tipo `regra-do-genero`) |
| `## Leitora` | leitura final |

**Pedido de "melhorar o gênero X" = editar ou criar o `.md`**, não mexer em código. O modo sai da categoria (`src/lib/modos.ts`); o ícone "História" força o modo narrativo (`caminhoEfetivo` em `src/lib/categorias.ts`).

## Onde fica cada coisa

| Arquivo | Papel |
|---|---|
| `server/lib/ai.ts` | Todas as chamadas à OpenAI e os prompts (sumário, capítulo, auditor, leitura final) |
| `server/lib/generationJob.ts` | Orquestra a geração, fila, trava entre processos |
| `server/lib/historia.ts` | Regras puras de enredo: reta final, clímax, destinos, fios, promessas |
| `server/lib/editorial.ts` | Parte pura da camada editorial: vícios de IA, tiques, auditoria, leitura, premissas, nomes |
| `server/lib/naoFiccao.ts` | Tese e perguntas do leitor |
| `server/lib/guias.ts` + `server/guias/` | Guias editoriais |
| `server/lib/calibragem.ts` | Tamanho do capítulo por modelo (excesso medido) |
| `server/lib/continuidade.ts`, `fatosNumericos.ts`, `qualityGate.ts` | Verificações e portão de publicação |
| `server/lib/vozes.ts` | Aberturas e fechamentos de capítulo por modo |
| `server/routes/ebooks.ts` | API de ebooks (criar, regenerar, finalizar, exportar) |
| `src/pages/NewEbook.tsx` | Formulário de criação |
| `src/components/PainelQualidade.tsx` | Painel de qualidade: erros verificáveis separados da opinião do editor de IA |
| `src/lib/custo.ts` | Palavras por capítulo, contagem de capítulos, estimativa de custo |
| `docs/` | Notas de deploy e decisões (GPT-5.5, robustez, Postgres) |

## Convenções de código

- **Comentários em português explicando o porquê**, com o livro que motivou a regra ("em 'Depois da Última Chave' o capítulo 3 revelava…"). Mantenha esse padrão.
- **Lógica pura separada da IA e do banco** (`historia.ts`, `editorial.ts`, `naoFiccao.ts`, `guias.ts`) e **sempre com teste** ao lado (`*.test.ts`, `node:test`).
- **Toda etapa extra de IA é um ganho, não um requisito:** falhar no auditor, na leitura final ou numa correção nunca derruba um livro que já custou dinheiro. Use `try/catch` com `console.warn` e siga.
- **Resposta de IA em JSON passa por um normalizador** que descarta lixo e nunca gera `blocker` a partir de opinião.
- Achados do painel: categorias `editorial-*` são opinião de IA (nunca bloqueiam); só verificações determinísticas podem ser `blocker`.

## Medir antes de afirmar que melhorou

Nota da leitora de IA varia cerca de 1 ponto entre leituras: rode 3 vezes e use a média. Histórico de "Depois da Última Chave": 5 → 6 → 6,3 → 6,3. Ainda não foi medido o efeito da escolha de premissa e de sumário entre candidatos.

## Pendências conhecidas

- **Livro-razão de fatos** (datas, local, veículos, dinheiro, documentos já assinados): maior lacuna apontada pelo parecer de "Curvas de Setembro".
- Vício "não era X, era Y" na lista de vícios; tiques de 3 palavras e de uma palavra; campo "voz" por personagem.
- EPUB: folha de rosto em texto, autor correto nos metadados, CSS que respeite as preferências do leitor.
- "Aplicar parecer": importar um parecer editorial e reescrever os capítulos afetados em ordem.
- Guias de gênero que faltam: fantasia, terror, ficção científica e subgêneros de não ficção.
- Bancada de testes fixa (um pedido por modo) para medir cada mudança.
