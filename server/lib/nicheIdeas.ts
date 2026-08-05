export interface NicheIdea {
  id: string;
  category: string;
  name: string;
  description: string;
}

export const NICHE_IDEAS: NicheIdea[] = [
  {
    id: "n1",
    category: "Saúde e Bem-estar",
    name: "Emagrecimento sem dietas restritivas",
    description: "Hábitos sustentáveis de alimentação e movimento para quem já tentou de tudo e desistiu.",
  },
  {
    id: "n2",
    category: "Saúde e Bem-estar",
    name: "Sono de qualidade depois dos 40",
    description: "Rotina noturna, ambiente e hábitos para dormir melhor em uma fase de vida mais corrida.",
  },
  {
    id: "n3",
    category: "Saúde e Bem-estar",
    name: "Ansiedade no dia a dia de quem trabalha muito",
    description: "Técnicas práticas para lidar com a ansiedade sem precisar parar a rotina.",
  },
  {
    id: "n4",
    category: "Saúde e Bem-estar",
    name: "Energia para mães que trabalham em casa",
    description: "Estratégias de autocuidado realistas para quem concilia filhos e trabalho remoto.",
  },
  {
    id: "n5",
    category: "Finanças Pessoais",
    name: "Sair das dívidas do cartão de crédito",
    description: "Passo a passo para renegociar, reorganizar e não voltar a se endividar.",
  },
  {
    id: "n6",
    category: "Finanças Pessoais",
    name: "Investindo os primeiros mil reais",
    description: "Guia para quem nunca investiu e quer começar sem cair em furadas.",
  },
  {
    id: "n7",
    category: "Finanças Pessoais",
    name: "Organização financeira para autônomos",
    description: "Como separar contas, guardar dinheiro para impostos e ter previsibilidade sem CLT.",
  },
  {
    id: "n8",
    category: "Finanças Pessoais",
    name: "Aposentadoria para quem começou tarde",
    description: "Planejamento realista para quem só foi pensar em previdência depois dos 40.",
  },
  {
    id: "n9",
    category: "Produtividade",
    name: "Foco profundo em um mundo cheio de notificações",
    description: "Técnicas para proteger blocos de tempo e sair do modo reativo o dia inteiro.",
  },
  {
    id: "n10",
    category: "Produtividade",
    name: "Gestão de tempo para freelancers",
    description: "Como precificar horas, organizar múltiplos clientes e não trabalhar de madrugada.",
  },
  {
    id: "n11",
    category: "Produtividade",
    name: "Rotina matinal para quem odeia acordar cedo",
    description: "Um método gradual para construir manhãs produtivas sem sofrimento.",
  },
  {
    id: "n12",
    category: "Produtividade",
    name: "Organização da casa em 15 minutos por dia",
    description: "Sistema simples para manter a casa em ordem sem grandes mutirões de faxina.",
  },
  {
    id: "n13",
    category: "Relacionamentos",
    name: "Comunicação não violenta no casamento",
    description: "Como discordar sem brigar e reconstruir a conexão no dia a dia.",
  },
  {
    id: "n14",
    category: "Relacionamentos",
    name: "Educação sem gritos",
    description: "Estratégias práticas de disciplina positiva para pais exaustos.",
  },
  {
    id: "n15",
    category: "Relacionamentos",
    name: "Reconstruindo amizades na vida adulta",
    description: "Como fazer amigos de verdade depois dos 30, quando a rotina não ajuda mais.",
  },
  {
    id: "n16",
    category: "Desenvolvimento Pessoal",
    name: "Autoconfiança para quem sempre foi o \"quieto do grupo\"",
    description: "Exercícios práticos para se posicionar mais sem virar outra pessoa.",
  },
  {
    id: "n17",
    category: "Desenvolvimento Pessoal",
    name: "Superando a procrastinação crônica",
    description: "Entendendo a raiz emocional da procrastinação e saindo dela na prática.",
  },
  {
    id: "n18",
    category: "Desenvolvimento Pessoal",
    name: "Recomeçar depois dos 50",
    description: "Um guia de reinvenção pessoal e profissional pra quem acha que já é tarde.",
  },
  {
    id: "n19",
    category: "Negócios e Empreendedorismo",
    name: "Primeiros clientes para um negócio novo",
    description: "Estratégias de baixo custo para conseguir os 10 primeiros clientes pagantes.",
  },
  {
    id: "n20",
    category: "Negócios e Empreendedorismo",
    name: "Transformando um hobby em renda extra",
    description: "Passo a passo para testar e validar um pequeno negócio nas horas vagas.",
  },
  {
    id: "n21",
    category: "Negócios e Empreendedorismo",
    name: "Precificação para prestadores de serviço",
    description: "Como cobrar o que vale sem perder cliente por preço nem trabalhar de graça.",
  },
  {
    id: "n22",
    category: "Negócios e Empreendedorismo",
    name: "Marketing de conteúdo para pequenos negócios locais",
    description: "Um plano simples de redes sociais para quem não tem tempo nem equipe.",
  },
  {
    id: "n23",
    category: "Culinária e Estilo de Vida",
    name: "Marmitas saudáveis para a semana toda",
    description: "Cardápio e técnica de preparo para quem não tem tempo de cozinhar todo dia.",
  },
  {
    id: "n24",
    category: "Culinária e Estilo de Vida",
    name: "Minimalismo prático para famílias",
    description: "Como reduzir excesso de objetos e rotina sem virar um estilo de vida radical.",
  },
];

export function listCategories(): string[] {
  const set = new Set(NICHE_IDEAS.map((i) => i.category));
  return Array.from(set);
}
