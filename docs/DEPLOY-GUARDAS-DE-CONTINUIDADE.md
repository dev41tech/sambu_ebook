# Deploy — branch `feat/guardas-de-continuidade`

Quatro guardas em cima do que já existe. Nenhuma muda o desenho da geração: elas
fecham brechas por onde a continuidade ainda vazava.

---

## 1. Migration — aplicar ANTES do deploy

```bash
node scripts/aplicar-migration.mjs db/migrations/0010_elenco_por_capitulo.sql
```

| Migration | O que cria | Se não for aplicada |
|---|---|---|
| 0010 | Coluna `chapters.personagens_json` | **A geração quebra no primeiro capítulo**: o UPDATE do resumo cita uma coluna que não existe |

Aditiva e idempotente (`IF NOT EXISTS`), como as anteriores. Capítulo antigo fica
com `NULL`, o elenco volta a ser só o do sumário e nada quebra. Pode ser aplicada
com o container atual no ar — a versão antiga do app ignora a coluna.

Confirme antes de subir que `0008_memoria_entre_capitulos` e `0009_metricas_qualidade`
também já estão aplicadas no banco de destino.

## 2. Rollback

A migration não remove nada: rollback é voltar a imagem anterior. A coluna nova
fica no banco sem uso.

---

## O que muda

### Truncamento deixa de passar em silêncio

`askOpenAI` não olhava `finish_reason`. Uma resposta cortada no teto de tokens
seguia adiante como se estivesse completa: em JSON isso aparecia mais tarde como
`Unexpected end of JSON input`, sem dizer a causa — justamente o modo de falha
que o teto calculado do sumário existe para evitar, mas que ninguém via quando
acontecia. Em prosa, entregava um capítulo cortado no meio da frase.

Agora, em JSON a chamada falha ali, com a mensagem certa. Em prosa fica um aviso
no log e o livro segue: derrubar a geração no capítulo 60 por causa de um final
truncado é pior do que o final truncado.

### Elenco criado na prosa é registrado

O bloco de elenco dizia, em toda chamada de capítulo, que "personagens
secundários novos são permitidos". Como as chamadas não se conhecem, cada uma
inventava os seus — num livro de 75 capítulos, 75 elencos de apoio descartáveis.
O elenco do sumário resolvia o protagonista, não o resto.

A passada de resumo que já rodava depois de cada capítulo (`resumirCapitulo`)
passou a devolver também quem nasceu naquele capítulo, **na mesma chamada**:
extrair isso numa chamada própria custaria mais 75 requisições por livro, para
uma informação que quem acabou de ler o capítulo já tem na mão. A lista vai para
`chapters.personagens_json`, e os capítulos seguintes recebem o elenco do sumário
somado a quem foi registrado até ali (teto de 12 mais recentes — o do sumário
nunca é cortado).

O texto do bloco mudou junto: em vez de autorizar gente nova, ele pede para
reaproveitar quem existe e exige motivo para voltar quando alguém for criado.

### O sumário diz de quem é cada capítulo

`OutlineChapter` ganhou `personagens: string[]` — quem entra em cena naquele
capítulo. O sumário já dizia do que cada capítulo trata, e a função dele na
estrutura, mas nunca de quem ele é. A checagem de capítulos órfãos sabe acusar,
depois de pronto, que um terço dos capítulos não cita ninguém do elenco; nada no
prompt tinha pedido que citassem.

O teto de tokens do sumário de ficção subiu de 90 para 110 por capítulo para
acomodar a lista.

### A humanização não pode mais trocar nomes

`humanizeText` roda por capítulo, sem elenco e sem sumário. Ao "remover
generalizações vagas" ela podia trocar um nome próprio por uma descrição, ou por
outro nome, sem ter como saber que aquilo era uma referência de que o resto do
livro depende. Agora recebe os nomes do elenco efetivo e a ordem de não tocar
neles, nem na ordem dos acontecimentos.

---

## Verificação feita

`tsc` sem erros, `vite build` passando, 72 de 72 testes. Sete casos novos em
`server/lib/elenco.test.ts` cobrindo o acúmulo de elenco — inclusive o que
garante que o elenco do sumário nunca é empurrado para fora do prompt pelo teto
de registrados, que seria o defeito que tudo isso existe para corrigir.

Nenhum livro foi gerado de ponta a ponta neste branch.

## Limitações conhecidas

- **O registro depende de o modelo devolver a lista.** Se `personagensNovos` vier
  vazio quando não devia, o secundário daquele capítulo não entra no elenco e
  pode sumir como antes. Falha silenciosa: o resumo é salvo do mesmo jeito.
- **O teto de 12 registrados é um chute calibrado por custo**, não medido. Num
  livro com muitos secundários legítimos, o 13º mais antigo sai do prompt.
- **`chapters.personagens_json` não é usado pela verificação de continuidade.**
  Ela continua comparando o texto contra o elenco do sumário, então um
  personagem registrado corretamente ainda pode ser acusado de
  `personagem-nao-autorizado`.
- **A introdução continua sendo escrita antes dos capítulos**, com os títulos do
  sumário. A conclusão já recebe os resumos reais; a introdução não tem
  equivalente.
