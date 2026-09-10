# Adoção do gpt-5.5

Decisão de 10/09/2026: o motor de texto passa de `gpt-4o` para
**`gpt-5.5-2026-04-23`**.

Snapshot fixado, não o alias `gpt-5.5`, para que uma comparação futura compare
com o mesmo modelo.

---

## 1. O que precisa ser feito no deploy

**`OPENAI_MODEL=gpt-5.5-2026-04-23` no ambiente do EasyPanel.**

Sem isso a produção continua em gpt-4o **em silêncio** — o código cai num
fallback (`server/lib/ai.ts`) e não reclama. Foi assim que o app ficou preso ao
gpt-4o sem ninguém perceber: a variável existia no `.env`, vazia.

Nenhuma migration. Nenhuma outra variável nova.

## 2. Por que a troca

Cinco livros gerados com o mesmo briefing (romance contemporâneo, 12 capítulos).

| | gpt-4o | gpt-5.5 |
|---|---|---|
| abstração/mil (meta ≤ 10) | 8,1 – 13,1 | **3,5** |
| capítulos acima do limite | 3/12 a 10/12 | **0/12** |
| diálogo/mil | 6,3 – 11,9 | **33,4** |
| capítulos com fechamento fraco | 4/12 | **2/12** |
| nota editorial (leitura completa) | 4,0 e 5,5 | **7,5** |
| tempo | 8–12 min | **37 min** |

O que mudou na leitura, e não só no número: apareceu um **antagonista em cena**
— a primeira vez em cinco livros que o sumário usa o papel `antagonista`, que o
schema sempre permitiu e o gpt-4o nunca usou. As apostas viraram materiais (um
contrato vencendo, um bar que é a casa de alguém) em vez de emocionais. E o
clímax é encenado, não resumido — que era o defeito reincidente dos dois livros
lidos antes.

Três hipóteses de melhoria que estavam na fila para virar verificação foram
resolvidas pelo modelo sem mudança de prompt.

## 3. O que a troca quebrou

### A estimativa de custo está errada

`src/lib/custo.ts` tem a tarifa do gpt-4o de agosto/2026. Está errada **para
baixo** por dois motivos somados: a tarifa do gpt-5.5 não foi medida, e modelo
de raciocínio cobra também os tokens de pensamento, que não aparecem no texto —
foram de ~2.000 a ~2.600 por chamada nas medições.

Deixamos o número antigo com um aviso no código em vez de inventar tarifa: um
valor plausível e falso é pior do que um sabidamente desatualizado.
**Recalibrar exige uma fatura real.**

### O app não tinha teto de tamanho

O prompt pedia "NO MÍNIMO N palavras" e mais nada. Com o gpt-4o isso bastava,
porque ele entrega perto do mínimo — o controle de tamanho era acidental, não
projetado. O gpt-5.5 escreveu 2.875 palavras por capítulo para um pedido de 841:
**34.502 palavras para uma meta de 10.092**.

Corrigido: o pedido virou uma faixa, com 30% de folga. **Ainda não verificado
em geração real.**

### `PALAVRAS_POR_CAPITULO = 841` é uma medição do gpt-4o

Continua servindo como piso, e a conta de capítulos segue coerente. Mas o número
foi medido noutro modelo e merece ser refeito depois que o teto por capítulo for
testado.

## 4. Compatibilidade que precisou ser construída

O app não conseguia rodar modelo de raciocínio nenhum. Três barreiras, todas
resolvidas de forma auto-calibrante (ver `server/lib/ai.ts`):

1. **`max_tokens` é recusado** pelos modelos novos, que exigem
   `max_completion_tokens`. A primeira recusa ensina: a mensagem de 400 diz qual
   nome a API queria, o pedido é refeito e a escolha vale pelo resto do processo.
2. **Tokens de pensamento saem do mesmo teto do texto.** Há uma reserva absoluta
   que se calibra pelo `reasoning_tokens` reportado pela própria API. O estouro é
   **intermitente** — no mesmo prompt e no mesmo teto, o sumário estourou numa
   tentativa e passou na seguinte.
3. **`"Resposta vazia da IA"` escondia a causa.** A mensagem agora traz
   `finish_reason`, teto, saída e quanto foi de raciocínio.

Nada disso é específico do gpt-5.5: vale para qualquer modelo de raciocínio que
venha depois.

## 5. Pendências abertas por esta troca

- [ ] **Definir `OPENAI_MODEL` em produção** — sem isso nada muda lá.
- [ ] **Medir a tarifa real** e recalibrar `custo.ts`.
- [ ] **Verificar o teto por capítulo** numa geração nova (feito no código, não
      testado).
- [ ] **Verificar a correção dos nomes.** O bloco de elenco mandava "não
      encurtar", e o gpt-5.5 obedeceu literalmente: **146 "Teodoro Almeida"
      contra 41 "Teodoro"** num livro só, o que faz a introdução e a conclusão
      soarem como boletim de ocorrência. A instrução passou a pedir nome completo
      só na primeira menção. Não testado.
- [ ] Refazer `PALAVRAS_POR_CAPITULO` com medição do gpt-5.5.
- [ ] Dois falsos positivos novos na continuidade — "Sala" e "Arquivo",
      substantivos capitalizados que o `pareceLugar` não pega. Ruído de revisão,
      não bloqueio.
