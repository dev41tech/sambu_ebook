# Deploy — branch `feat/engenharia-editorial`

Instruções para colocar este branch em produção. Leia a seção de migrations
antes de subir a imagem: sem elas o app sobe e falha.

---

## 1. Migrations — aplicar ANTES do deploy, nesta ordem

```bash
node scripts/aplicar-migration.mjs db/migrations/0003_custom_categories.sql
node scripts/aplicar-migration.mjs db/migrations/0004_learnings_por_genero.sql
node scripts/aplicar-migration.mjs db/migrations/0005_achados_continuidade.sql
node scripts/aplicar-migration.mjs db/migrations/0006_meta_palavras.sql
```

O script lê `DATABASE_URL` do ambiente. Com `psql` disponível, o equivalente é
`psql "$DATABASE_URL" -f <arquivo>`.

Todas são **aditivas e idempotentes**: criam tabela ou coluna com
`IF NOT EXISTS`, não apagam nem reescrevem registro nenhum. Rodar duas vezes não
quebra.

| Migration | O que cria | Se não for aplicada |
|---|---|---|
| 0003 | Tabela `custom_categories` | `/api/categorias` falha; o campo de categoria sobe vazio nos formulários |
| 0004 | Coluna `learnings.grupo` | A consulta de aprendizados quebra e derruba toda geração |
| 0005 | Coluna `ebooks.continuity_json` | A verificação de continuidade falha ao gravar (é capturada, mas nunca registra nada) |
| 0006 | Colunas `ebooks.extension_mode` e `ebooks.word_goal` | A criação de ebook quebra: o INSERT cita colunas que não existem |

A 0006 também preenche `word_goal` dos ebooks existentes com
`page_count * words_per_page`, para que os dois modos contem a mesma história
desde o começo.

## 2. Variáveis de ambiente

Nenhuma variável nova. `DATABASE_URL` continua obrigatória e **precisa estar
definida no EasyPanel antes do deploy** — o app não sobe sem banco, por decisão
deliberada registrada em `server/lib/db.ts`.

## 3. Rollback

As migrations não removem nada, então o rollback é só voltar a imagem anterior.
As colunas e a tabela novas ficam no banco sem uso e não atrapalham a versão
antiga. Não é preciso reverter SQL.

---

## O que muda nesta versão

### Extensão do ebook

O limite passou de 1000 para **400 páginas** na validação, e o teto de capítulos
de 12 para 100. O teto vivia duplicado em dois arquivos com um comentário
pedindo que fossem mantidos iguais à mão — não foram, e a estimativa prometia um
livro que a geração não entregava.

Entrou também a **meta de palavras** como alternativa a páginas. Páginas nunca
foi entrada honesta: quem decide a paginação é a diagramação, e um pedido de 400
páginas entregou 257. Os dois modos convivem; `extension_mode` diz qual foi
usado.

### Categorias

As secundárias viraram **texto livre** separado por vírgula (antes eram 60 chips
da taxonomia). A principal ganhou uma **caixa de inserção manual**: o que se
digita é gravado em `custom_categories` e aparece no select num grupo próprio,
"Minhas categorias".

A persistência em banco não é opcional — o servidor recusa categoria principal
fora da lista com HTTP 400. Guardar só no navegador faria o formulário aceitar e
a criação falhar depois.

### Caixa de instruções de criação

Na área de diagramação, o briefing original do ebook aberto para edição, com um
botão que reescreve o livro. Usa uma rota nova, `POST /api/ebooks/:id/regenerate`,
e **não** o `/retry` existente: aquele retoma de onde parou, pulando o sumário e
os capítulos já escritos, e devolveria o mesmo livro com um briefing novo.

Confirmação em duas etapas, porque a operação apaga capítulos e custa dinheiro.

### Engenharia editorial

Cinco defeitos, todos reproduzidos no código antes da correção:

**Recusa do modelo salva como capítulo.** A OpenAI devolve "Desculpe, não posso
ajudar com esse pedido." em HTTP 200, e o código só testava `if (!text)`. Os
capítulos 3 e 9 de "Vingança Perigosa" guardam essa frase até hoje, com 43 e 47
caracteres. `server/lib/sanitizar.ts` barra recusas antes de virarem conteúdo.

**Nome de variável de ambiente na tela.** `ELEVENLABS_API_KEY ou
ELEVENLABS_VOICE_ID não configurados no .env.` ia cru para `audio_error` e era
renderizado na área editorial. Agora vira uma frase acionável e a mensagem real
fica no log do servidor.

**Aprendizados contaminando entre gêneros.** `getRecentLearnings` era
`ORDER BY created_at DESC LIMIT 12`, sem filtro nenhum, apesar de a tabela já ter
`category` e `ebook_id`. Os dois conselhos salvos eram de livro técnico — "use
mais exemplos numéricos, cite a fonte dos dados" — e entraram no prompt de um
romance.

**Cada etapa inventando os próprios nomes.** Introdução, capítulos e conclusão
eram três chamadas independentes. Em "Além das Quatro Linhas" a introdução
apresentou Luísa e Guilherme enquanto os 84 capítulos falavam de Ana e Lucas. O
sumário passa a fixar de 3 a 8 personagens com papel, repassados às três etapas.
Só em ficção.

**Corrida na fila de geração.** A checagem "já está na fila?" e a inclusão na
fila estavam separadas por uma ida ao banco. A tela de "gerando" faz polling na
rota de detalhe, que chama essa função — duas chamadas simultâneas passavam as
duas pelo `if` antes de qualquer uma reservar, e dois jobs escreviam os mesmos
capítulos. "Sob o Sol do Mistério" terminou com 47 capítulos gerados para um
livro de 40, com a OpenAI cobrando os 7. Defeito anterior a este trabalho.

Entrou ainda uma **verificação determinística de continuidade**
(`server/lib/continuidade.ts`), sem custo de IA, rodando ao fim de toda geração.
Compara os nomes de cada parte do livro contra o elenco e grava os achados.

---

## Verificação feita

Dois ebooks gerados de ponta a ponta neste branch:

| Ebook | Resultado |
|---|---|
| "Amor em Jogo" (3 capítulos) | Elenco fixado, 0 achados |
| "Sob o Sol do Mistério" (40 capítulos, 12 min, US$ 1,27) | Elenco manteve-se nos 40 capítulos; 1 warning legítimo |

`tsc` sem erros, `vite build` passando.

## Limitações conhecidas

- **A entrega fica entre 50% e 64% do pedido.** O modelo escreve cerca de 500
  palavras quando se pede 1.000. Não foi resolvido nesta versão.
- **O job de geração vive em memória** e morre em qualquer restart do servidor.
  Com livros de 12 a 33 minutos, um deploy no meio perde o que já foi pago.
- **Os tons de voz não servem a ficção** — "Motivador", "Técnico e direto",
  "Descontraído" e "Formal" foram pensados para não ficção.
- **`page_count` grava o default do formulário** quando o modo é palavras.
- **Capítulos já gravados com recusa não são limpos** por esta mudança; ela só
  impede novos casos.
