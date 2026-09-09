# Deploy — branch `feat/guardas-de-continuidade`

Quatro guardas em cima do que já existe. Nenhuma muda o desenho da geração: elas
fecham brechas por onde a continuidade ainda vazava.

---

## 1. Migrations — aplicar ANTES do deploy

**A lista completa de migrations do projeto vive em
[`DEPLOY-ENGENHARIA-EDITORIAL.md`](./DEPLOY-ENGENHARIA-EDITORIAL.md), seção 1.**
Não duplique a lista aqui: foi mantendo duas listas separadas que a 0008 e a 0009
passaram a existir sem constar de nenhuma delas.

Desta leva e da seguinte saíram duas migrations, ambas já na lista canônica:

| Migration | O que cria | Se não for aplicada |
|---|---|---|
| 0010 | Coluna `chapters.personagens_json` | **A geração quebra no primeiro capítulo**: o UPDATE do resumo cita uma coluna que não existe |
| 0011 | Coluna `ebooks.memoria_longa` | A memória longa falha ao gravar; o livro volta a enxergar só a janela dos 8 capítulos mais recentes |

Aditivas e idempotentes (`IF NOT EXISTS`), como as anteriores. Capítulo antigo
fica com `NULL`, o elenco volta a ser só o do sumário e nada quebra. Podem ser
aplicadas com o container atual no ar — a versão antiga do app ignora as colunas.

**Estado conferido em produção** (`vps.41tech.cloud:3308/ebook_forge`): a 0010 já
está aplicada — `chapters` tem `personagens_json`. Falta apenas a **0011**.

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

## Leva seguinte — memória longa e o portão realimentando a escrita

Migration **0011**. Esta leva fecha três das quatro limitações listadas mais
abaixo, e é por isso que ela vive neste documento e não num terceiro.

### A memória deixa de ser só de 8 capítulos

A janela de memória guarda os 8 capítulos mais recentes; tudo antes disso voltava
a entrar no prompt apenas como TÍTULO. Num livro de 75 capítulos, o 60 recebia os
resumos do 52 ao 59 e nada mais — um fio aberto no capítulo 3 e retomado no 70
não tinha garantia nenhuma.

A cada 8 capítulos, os resumos daquele bloco viram um parágrafo condensado
gravado em `ebooks.memoria_longa`, que viaja até o fim do livro ao lado da janela
dos recentes. São 9 chamadas curtas num livro de 75 capítulos, não 75.

### O portão passa a corrigir, não só avisar

A verificação de continuidade rodava uma vez, no fim, quando reescrever significa
pagar o livro de novo. Agora ela roda **a cada 10 capítulos durante a geração**, e
o capítulo reprovado é reescrito na hora, com o defeito nomeado no próprio
prompt. Cada capítulo é reescrito no máximo uma vez por execução — sem esse teto,
uma checagem que continuasse reprovando pagaria o mesmo capítulo em loop.

Para isso, `Achado` ganhou `capitulosAfetados: number[]`: a checagem precisa saber
QUAL capítulo reescrever, e ler isso do texto da evidência seria frágil.

### O portão conhece quem nasceu na prosa

`chapters.personagens_json` passou a alimentar a verificação de continuidade
(`elencoRegistrado`). Um personagem criado no capítulo 2 e registrado
corretamente não é mais acusado de `personagem-nao-autorizado` — falso positivo
que gastava atenção de revisão à toa. O mesmo vale para `elenco-ausente`, que só
dispara quando não há elenco nem no sumário nem no registro.

### A introdução passou para depois dos capítulos

Era a etapa 3, escrita quando nenhum capítulo existia: abria um livro que ainda
não tinha sido escrito. Agora roda junto da conclusão e recebe os mesmos resumos
reais, com instrução explícita de **não revelar o desfecho** — que é o risco novo
que a troca de ordem cria. O checklist da tela de progresso foi reordenado junto,
senão ficaria um "pendente" parado no topo enquanto tudo abaixo ficava verde.

### Reescrever um capítulo refaz o bloco de memória que o cobria

A reescrita da checagem intermediária deixava o bloco condensado descrevendo uma
versão do texto que não existe mais — e é essa versão velha que viajaria para
todos os capítulos seguintes, o oposto do que a memória longa existe para fazer.

Depois das reescritas de uma rodada, cada bloco afetado é condensado de novo,
uma vez só: duas reescritas dentro do mesmo bloco custam uma condensação, não
duas. `blocoQueCobre()` vive em `ai.ts`, pura e testada, porque a aritmética de
faixas é o tipo de coisa que erra em silêncio.

### Plano B quando o modelo não devolve a lista

Se `personagensNovos` vier vazio num livro de ficção, um detector determinístico
extrai do capítulo os nomes próprios que aparecem **5+ vezes** e não são
conhecidos, reaproveitando `extrairNomes` de `continuidade.ts`. O piso de 5 é o
mesmo que a verificação de continuidade usa para decidir que alguém é
"personagem de fato". Teto de 3 por capítulo: o detector é um palpite — não há
como um contador de nomes próprios distinguir uma pessoa de um lugar — e um
elenco inflado por falso positivo atrapalha mais do que a ausência de um
secundário, além de empurrar gente real para fora pelo teto de registrados.

**O plano B é instrumentado.** Quando ele entra E encontra alguém, sai um aviso
`[registro] <ebook> cap. N: modelo devolveu elenco vazio; plano B detectou ...`.
Só nesse caso: capítulo que de fato não apresenta ninguém novo é o caso comum, e
logar isso encheria o log de ruído. Este aviso é a única fonte de dado sobre com
que frequência o modelo erra o registro — a pergunta que estava em aberto aqui
embaixo e que agora se responde sozinha, a cada livro gerado.

### O registro sabe quem já existe

Duas correções vindas do primeiro livro gerado de ponta a ponta (ver abaixo).

O prompt de `resumirCapitulo` sempre mandou "não repita quem já existia antes",
mas **nunca dizia ao modelo quem existia** — e ele não tem como adivinhar. Agora
recebe a lista do elenco efetivo, com ordem explícita de não listar nem versão
curta do nome, nem lugares, empresas ou eventos.

E o filtro do lado de cá comparava o nome inteiro, então "Renata" nunca casava
com "Renata Campos". Passou a comparar **parte a parte** e a barrar também os
termos que vêm dos fatos fixos e das descrições — as duas regras já existiam na
verificação de continuidade, e agora são a mesma fonte para as duas: as funções
`nomesAutorizados()` e `termosDeFatosFixos()`, exportadas de `continuidade.ts`.
O normalizador de nomes também era duplicado em dois arquivos, com regras
diferentes; virou um só, `normalizarTermo()`.

Dizer ao modelo quem existe melhora a resposta, não a garante — por isso as duas
camadas. Quando o filtro descarta algo, sai um aviso `[registro] ... nome(s)
descartado(s) por já existirem no livro`.

### A geração é retomada no boot

`retomarGeracoesInterrompidas()` recoloca na fila, ao subir, todo ebook em
`generating`. Como o laço pula todo capítulo que já tem conteúdo, retomar custa
só o que faltava. Antes, um deploy no meio de um livro de trinta minutos deixava
o registro travado em `generating` para sempre — sem erro e sem botão de tentar
de novo.

### Custo

O registro de elenco não acrescenta chamadas. A memória longa acrescenta uma
chamada curta a cada 8 capítulos. As reescritas da checagem intermediária são o
único item variável: uma chamada de capítulo mais a humanização, por capítulo
reprovado, no máximo uma vez cada.

---

## Verificação feita

Na leva das guardas: `tsc` sem erros, `vite build` passando, 72 de 72 testes.
Sete casos novos em `server/lib/elenco.test.ts` cobrindo o acúmulo de elenco —
inclusive o que garante que o elenco do sumário nunca é empurrado para fora do
prompt pelo teto de registrados, que seria o defeito que tudo isso existe para
corrigir.

Na leva da memória longa: `tsc` sem erros, `vite build` passando, **80 de 80
testes**. Oito casos novos em `memoria.test.ts` (memória longa no prompt, bloco
vazio ignorado, comportamento inalterado sem memória longa, e as duas faixas de
`blocoQueCobre`) e em `continuidade.test.ts` (personagem registrado não é mais
acusado, `capitulosAfetados` aponta os capítulos certos, `elenco-ausente` não
dispara com elenco registrado).

### Primeiro livro gerado de ponta a ponta

"Corações Urbanos" — romance contemporâneo, 12 capítulos, 12 minutos. Doze é o
mínimo que exercita as duas coisas novas uma vez cada: a memória longa fecha
bloco no capítulo 8 e a checagem intermediária dispara no 10.

O que passou:

| | |
|---|---|
| Introdução depois dos capítulos | Confirmado no traço (`intro` com 12/12 escritos) e no texto, que cita um fato fixo do sumário |
| Presença por capítulo | 12 de 12 com elenco declarado; a protagonista em todos |
| Continuidade | **zero achados** |
| `resumo_fatos` | 12 de 12 preenchidos |
| Entrega | **9.808 de 10.092 palavras — 97%** |
| `personagensSemFuncao` | nenhum |

Placar de referência para comparar mudanças futuras:
`palavras 9808 · diálogo/mil 6.30 · abstração/mil 12.20 · repetição entre capítulos 0.125`.

**A abstração está alta.** O comentário em `metricas.ts` registra 8.9 como a
marca do motor antigo e diz que acima disso é excesso; este livro deu 12.20. Não
tem relação com estas levas — nenhuma delas toca a prosa — mas é um número que
só apareceu porque foi medido.

O que o livro reprovou: o registro de elenco gravou **11 nomes errados** em 12
capítulos — Ellie quatro vezes, Lucas, Lucas Almeida e Carlos Silveira (todos já
no elenco), e, via plano B, "Renata, Ana" (as duas protagonistas) e "Tóquio"
(uma cidade). São as duas correções descritas acima. Rodando o filtro corrigido
contra o registro real daquele livro, **os 11 são eliminados**: 9 pelo
casamento parte a parte e pelos termos dos fatos, e os 2 restantes pelo piso de
5 menções ("Elias" aparece 3x, "Tóquio" 4x).

**A checagem intermediária nunca disparou** — não havia capítulo órfão. Esse
caminho continua sem teste em livro real.

**A memória longa não persistiu**, como previsto: a migration 0011 ainda não
estava aplicada e o `UPDATE` falhou no capítulo 8, dentro do `try/catch`. O
mecanismo rodou em memória e alimentou os capítulos seguintes; só não salvou.

## Limitações conhecidas

- **O teto de 12 registrados é um chute calibrado por custo**, não medido. Num
  livro com muitos secundários legítimos, o 13º mais antigo sai do prompt.
- **A checagem intermediária pode reescrever um capítulo legítimo.** Um capítulo
  deliberadamente sem os protagonistas — um prólogo de outro ponto de vista —
  entra como órfão e é reescrito. O teto de uma reescrita por capítulo limita o
  estrago, mas o critério é de frequência de nome, não de intenção.
- **O sumário ainda sai de uma chamada só.** Planejar em duas passadas (partes,
  depois capítulos de cada parte) vale medir antes de fazer: não se sabe a partir
  de quantos capítulos compensa.
- **A humanização nunca foi comparada.** Ela reescreve cada capítulo depois de
  pronto — num livro de 75 capítulos são ~77 chamadas extras, quase dobrando o
  custo de texto. Ninguém gerou o mesmo livro com e sem.
- **O plano B não distingue pessoa de lugar.** É um contador de nomes próprios.
  O piso de 5 menções e os filtros reduzem o falso positivo — no livro real
  eliminariam todos —, mas o mecanismo continua sendo um palpite.
- **O piso de 5 menções descarta secundário legítimo pouco citado.** "Elias", do
  capítulo 11 daquele livro, é provavelmente uma pessoa de verdade e não seria
  registrado. Preferimos perder um secundário marginal a admitir uma cidade no
  elenco.
- **A frequência da falha do registro foi medida uma vez**, e foi alta: o modelo
  errou em 11 de 12 capítulos antes da correção. Falta refazer a medição depois
  dela — o aviso `[registro] ...` continua no log para isso.
