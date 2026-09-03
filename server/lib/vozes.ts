import type { Modo } from "../../src/lib/modos";

// O que cada modo editorial pede do texto.
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
  /** Vai para o prompt de sistema, depois das regras comuns a todos. */
  regras: string;
  /** Como abrir um capítulo. Sorteado por índice, como antes. */
  aberturas: string[];
  /** Como fechar um capítulo. */
  fechamentos: string[];
}

const NARRATIVO: Voz = {
  regras: `ESTE LIVRO É FICÇÃO. Escreva narrativa, não ensaio.

Cena, não resumo — dramatize o que acontece em vez de contar que aconteceu. "Ele passou semanas evitando o assunto" é resumo; a conversa em que ele desvia da pergunta é cena. A maior parte do capítulo deve ser cena.

O narrador não comenta a lição — jamais explique o que o leitor deve aprender com o que acabou de ler, não faça perguntas ao leitor, não conecte o episódio à "vida real dele". O significado tem de sair das ações e das consequências. Se um parágrafo pode começar com "isso mostra que", corte o parágrafo.

Diálogo — inclua pelo menos três ou quatro trocas de fala neste capítulo (cada linha de personagem, uma troca), a menos que a cena exija alguém sozinho e sem ninguém para falar com. As pessoas falam para conseguir alguma coisa, não para informar o leitor. Ninguém explica ao outro o que os dois já sabem.

Consequência — algo precisa mudar no capítulo: alguém decide, descobre, perde ou estraga algo. Um capítulo em que ninguém age é um capítulo perdido.

Concretude sensorial — lugar, hora do dia, clima, objeto na mão. O leitor precisa saber onde está.

Nada de vocabulário corporativo ou de autoajuda: jornada, transformação, mindset, propósito, ressignificar, protagonismo.`,
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
  regras: `Livro sobre saúde e corpo, para leigos.

Separe informação de orientação — explique como as coisas funcionam; não prescreva dose, tratamento, jejum, suplemento ou exercício específico como se fosse conduta individual.

Nada de promessa de resultado — sem "em 7 dias", sem número de quilos, sem cura. Fale em faixas, variação entre pessoas e no que a evidência ainda não sabe.

Diga quando procurar um profissional — sempre que o tema tocar sintoma, dor, remédio, gestação, criança, idoso ou condição crônica.

Não invente estudo, instituição, percentual ou nome de pesquisador. Sem material de referência informado, escreva sobre mecanismos e experiência comum, não sobre dados.

Acolhimento sem infantilizar — o leitor provavelmente já tentou antes e não deu certo. Reconheça isso em vez de motivar.`,
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
  regras: `Livro sobre comportamento, relações e vida adulta.

Parta da experiência, não do conceito — comece pelo que a pessoa vive, e só então nomeie o que está acontecendo.

Não diagnostique — evite rotular o leitor ou terceiros com termos clínicos (narcisista, tóxico, TDAH, depressivo). Descreva comportamentos e efeitos.

Exemplo concreto em cada capítulo, com nome fictício, situação e desfecho — deixe claro que é ilustração, não caso real.

Sem culpa e sem urgência falsa — não sugira que quem não mudar está se sabotando. Reconheça que há circunstâncias que a vontade não resolve.

Evite o vocabulário gasto de autoajuda: jornada, ressignificar, protagonismo, mindset, versão melhor de si.`,
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
  regras: `Livro sobre dinheiro, gestão ou negócios, no contexto brasileiro.

Todo conceito com número — apresente um exemplo numérico fechado, com os valores, a conta e o resultado. Um capítulo sobre margem sem uma margem calculada não ensina nada.

Diga a data de referência de qualquer regra, alíquota, limite ou faixa. Quando não tiver certeza da vigência, diga que a regra muda e mande conferir na fonte oficial.

Não invente norma, artigo de lei, alíquota, jurisprudência ou nome de programa. Sem material de referência informado, fique no conceito e no método de cálculo.

Nada de promessa de retorno, nem recomendação de investimento específico.

Realidade brasileira — regime tributário, prazo bancário, sazonalidade, informalidade. Nada de exemplo em dólar ou de prática que não existe aqui.`,
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
  regras: `Livro técnico, para quem vai aplicar.

Passo verificável — o leitor precisa conseguir reproduzir e saber se deu certo. Diga como confirmar o resultado de cada etapa.

Não prometa o que a ferramenta não faz, e diga o que ela faz mal. Ferramenta que muda rápido: diga a versão ou a data em que aquilo valia.

Não invente comando, função, parâmetro, preço ou limite de plano.

Explique o porquê antes do como — quem entende o mecanismo se adapta quando a tela muda de lugar.`,
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
  regras: `Livro prático, de aplicação.

Promessa clara no início e cumprida ao longo do capítulo. Se o título anuncia um método, o método precisa aparecer.

Exemplo concreto por capítulo, com situação, decisão e resultado.

Explique também o que impede a aplicação na prática, os erros comuns e como adaptar a recomendação a situações diferentes.

Sem elogio artificial ao leitor, sem urgência fabricada, sem estatística inventada.`,
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
