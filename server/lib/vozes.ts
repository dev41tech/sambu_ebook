import type { Modo } from "../../src/lib/modos";

// Aberturas e fechamentos de capítulo de cada modo editorial.
//
// As REGRAS de cada modo, que moravam aqui, passaram em 03/10/2026 para os
// guias editoriais (server/guias/<modo>.md, seção "Escrita"), lidos por
// guias.ts: editar o que um gênero pede deixou de exigir mudar código.
//
// Antes havia um conjunto só, escrito para livro prático, aplicado a tudo. Duas
// das instruções que iam em TODA chamada de capítulo:
//
//   "Profundidade — não diga apenas o que o leitor deve fazer. Explique por que
//    aquilo importa, o que costuma impedir a aplicação na prática..."
//
//   Feche com "uma reflexão que conecta o aprendizado à vida real do leitor".
//
// Num romance, isso produz exatamente o que o parecer editorial de "Ilha do
// Desespero" encontrou: narrativa interrompida para explicar a própria moral.
// O texto abaixo é o que cada modo recebe no lugar disso.

export interface Voz {
  /** Como abrir um capítulo. Sorteado por índice, como antes. */
  aberturas: string[];
  /** Como fechar um capítulo. */
  fechamentos: string[];
}

const NARRATIVO: Voz = {
  aberturas: [
    "uma ação já em curso, sem preparação — o leitor entende o contexto pelo que acontece",
    "uma fala, no meio de uma conversa que já começou",
    "um detalhe físico concreto que revela o estado de quem observa",
    "a consequência imediata do que ficou pendente no capítulo anterior",
    "uma mudança de lugar ou de tempo, dita em uma frase seca",
    "um gesto pequeno que contradiz o que a pessoa diz em seguida",
  ],
  fechamentos: [
    "uma decisão tomada, com a consequência já visível",
    "uma informação nova que muda o sentido do que veio antes",
    "uma pergunta que a situação deixa em aberto — nunca uma pergunta do narrador ao leitor",
    "um gesto ou uma frase curta que fecha a cena sem explicá-la",
    "uma perda ou um custo concreto pago por alguém",
  ],
};

const SAUDE: Voz = {
  aberturas: [
    "uma situação cotidiana concreta em que o problema aparece",
    "uma dúvida que a pessoa costuma ter vergonha de fazer em consulta",
    "uma crença comum sobre o tema, e o que de fato se sabe sobre ela",
    "o que o corpo está fazendo por trás do sintoma, em linguagem simples",
    "uma tentativa que quase todo mundo faz e por que costuma falhar",
  ],
  fechamentos: [
    "o que dá para observar em si mesmo a partir de agora",
    "o limite entre o que se resolve sozinho e o que pede avaliação profissional",
    "uma expectativa realista de tempo e de variação entre pessoas",
    "o erro mais comum de quem tenta aplicar isso por conta própria",
  ],
};

const COMPORTAMENTO: Voz = {
  aberturas: [
    "uma cena curta e reconhecível da vida do leitor",
    "uma frase que as pessoas dizem sobre o tema, e o que costuma estar por trás dela",
    "a diferença entre duas situações que parecem iguais",
    "um conselho popular sobre o assunto e por que ele falha na prática",
    "o custo silencioso de continuar como está",
  ],
  fechamentos: [
    "uma observação que o leitor pode fazer sobre a própria semana",
    "o que muda e o que não muda quando se enxerga isso",
    "uma distinção que ficou mais clara ao longo do capítulo",
    "o desfecho do exemplo aberto no início",
  ],
};

const FINANCAS: Voz = {
  aberturas: [
    "um número real da rotina de quem lida com o assunto",
    "uma decisão concreta que depende do que o capítulo vai explicar",
    "um erro de conta que custa caro e passa despercebido",
    "duas alternativas que parecem equivalentes e não são",
    "a pergunta que o leitor precisa saber responder ao fim do capítulo",
  ],
  fechamentos: [
    "o cálculo fechado, com os valores usados no exemplo",
    "o que fazer com esse número na prática",
    "o limite do método — quando ele não se aplica",
    "o que conferir antes de decidir, e onde conferir",
  ],
};

const TECNICO: Voz = {
  aberturas: [
    "o problema concreto que a técnica do capítulo resolve",
    "o que acontece quando se faz do jeito errado",
    "uma comparação entre duas abordagens, com o critério de escolha",
    "o mínimo que precisa estar pronto antes de começar",
  ],
  fechamentos: [
    "como verificar se o resultado saiu certo",
    "o erro mais comum nesta etapa e como sair dele",
    "o que fica em aberto e depende do caso de cada um",
  ],
};

const PRATICO: Voz = {
  aberturas: [
    "uma situação concreta ligada ao tema do capítulo",
    "uma pergunta que o leitor provavelmente já se fez sobre o assunto",
    "um erro comum que as pessoas cometem nesse contexto",
    "uma contradição ou mal-entendido frequente sobre o tema",
    "um exemplo hipotético, deixando claro que é hipotético",
  ],
  fechamentos: [
    "uma aplicação prática direta do que foi discutido, sem virar lista",
    "o obstáculo mais comum na hora de aplicar",
    "uma pergunta útil para o leitor levar consigo",
    "o fechamento do exemplo citado ao longo do capítulo",
  ],
};

export const VOZES: Record<Modo, Voz> = {
  narrativo: NARRATIVO,
  saude: SAUDE,
  comportamento: COMPORTAMENTO,
  financas: FINANCAS,
  tecnico: TECNICO,
  pratico: PRATICO,
};

export function vozDe(modo: Modo): Voz {
  return VOZES[modo];
}
