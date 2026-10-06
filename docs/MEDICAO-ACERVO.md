# Linha de base — personagens que somem e fios sem desfecho

Medição do acervo em **06/10/2026**, sobre 90 livros já gravados no banco (46 de
ficção). Leitura pura, sem chamada de IA: `npx tsx --env-file=.env scripts/medir-acervo.ts`.

Existe para responder, com número, o passo 0 do plano de geração em blocos —
*quanto* se perde em livro longo — antes de investir na mudança grande.

## O que o script mede

| Métrica | Como |
|---|---|
| **Personagem que some** | nome com **≥ 5 menções** no livro cuja última aparição fica **antes da reta final** (`inicioRetaFinal`, últimos 20%) |
| **Fio sem sinal de fechamento** | fio planejado no sumário cujas palavras-chave aparecem em menos da metade a partir do capítulo em que deveria fechar |
| **Achados de continuidade** | `verificarContinuidade()`, o mesmo que roda no fim da geração |

Limites: o fio é detectado por palavras, não por leitura — um fio respondido com
outras palavras conta como fechado, e o contrário também acontece. Trate a lista
de fios como **suspeitas**. A métrica de personagem é mais confiável: compara
menções reais no texto.

## Resultado — ficção, todo o acervo

| Faixa | Livros | Personagens que somem (média) | % dos livros com ao menos 1 |
|---|---|---|---|
| Curto (≤ 12 cap.) | 15 | **0,20** | 13% |
| Médio (13–24) | 7 | 1,29 | 57% |
| Longo (25–48) | 19 | 0,89 | 58% |
| Muito longo (> 48) | 5 | 1,20 | 60% |

**O contraste que o Marcos relatou é real e aparece cedo:** o salto acontece já
na faixa de 13 capítulos, não só nos livros gigantes.

## A camada editorial de 02/10 não resolveu isto

Só os livros gerados **depois** de `historia.ts`, auditor por capítulo e promessas:

| Faixa | Livros | Personagens que somem (média) | % com ao menos 1 |
|---|---|---|---|
| Curto (≤ 12) | 4 | 0,50 | 25% |
| Longo (≥ 25) | 10 | **0,90** | **60%** |

Mesmo patamar de antes. O que entrou em outubro melhora o enredo planejado; não
cobre quem nasce na prosa.

## A causa está medida: 94% dos casos nascem na prosa

Dos **35 casos** em todo o acervo, **33 são personagens criados durante a escrita**
(não estão no sumário) e **apenas 1** tinha destino planejado. Nos livros
pós-02/10 são 10 de 11 casos, com média de **17,5 menções** cada — não são figurantes.

Casos mais graves:

| Livro | Personagem | Menções | Última aparição |
|---|---|---|---|
| Sob o Mesmo Teto (92 cap.) | Helena Ferraz | 40 | cap. 18 |
| A Dívida do Farol (29 cap.) | Chico | 48 | cap. 22 |
| A Dívida do Farol | Neco | 30 | cap. 20 |
| Sob o Mesmo Teto | Vittoria | 32 | cap. 73 |
| Cartas para a Rua de Baixo (23 cap.) | 5 personagens | 5 a 10 | **todos até o cap. 15** |

"Cartas para a Rua de Baixo" é o sintoma mais claro do teto de elenco: cinco
pessoas desaparecem juntas, no mesmo ponto do livro.

Isso confirma, com dados, os itens **3.2** (`extras.slice(-MAX_REGISTRADOS)` corta
o personagem mais antigo quando nasce o 13º) e **3.3** (ninguém dá destino a quem
nasce na prosa) do plano. A perda por compressão (3.1) não é isolável por esta
medição.

## Fios

O campo `fios` existe desde 02/10; livros anteriores não têm nenhum, e por isso
não entram nesta conta. Nos 15 livros que têm: **101 fios planejados, 9 sem sinal
de fechamento (~9%)**, concentrados em poucos livros.

## O que mudou depois desta medição (06/10)

Passo 1 do plano de blocos, atacando o mecanismo medido:

1. **Ninguém mais sai do elenco do prompt.** `elencoEfetivo` encurtava a lista nos
   12 registrados mais recentes; agora encurta a **descrição** dos mais antigos e
   mantém todos.
2. **Lembrete de quem sumiu** no prompt de cada capítulo (`personagensSumidos` +
   `sumidosBlock`): quem tem ≥ 5 menções e não aparece há 8 capítulos (4 na reta
   final) volta ao prompt — para entrar em cena de novo ou ter a saída mostrada.
   Determinístico, sem chamada de IA.
3. **Resumo lê o capítulo inteiro** (`capituloParaResumir`), não os primeiros
   12.000 caracteres — o fim do capítulo é onde está a decisão e o gancho.
4. **A reescrita no meio da geração usa a correção do próprio achado**
   (`correcaoDaContinuidade`), não mais o texto fixo de "capítulo órfão".

**Replay nos livros reais** (sem gerar nada): em "Sob o Mesmo Teto" o lembrete
teria disparado 10 vezes, incluindo Helena Ferraz no capítulo 27 (sumiu no 18);
em "A Dívida do Farol", Tonhão (cap. 23), Neco (25), Artur Monteiro (26) e Chico
(27). Foi esse replay que mostrou a necessidade da janela menor na reta final:
com 8 fixos, Chico — o pior caso, 48 menções — nunca seria avisado.

Falta medir o efeito em livro novo, o que exige gerar (com custo).

## Como repetir

```bash
npx tsx --env-file=.env scripts/medir-acervo.ts --min 20 --json medicao.json
```

Rodar de novo depois de cada mudança da geração, sobre os **mesmos** livros, e
comparar. Para medir efeito em livro novo é preciso gerar — aí sim com custo.
