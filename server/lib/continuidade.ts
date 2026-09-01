import type { Outline } from "./ai";

// Verificação de continuidade sem chamar o modelo. Roda ao fim da geração e
// compara os nomes próprios que aparecem na introdução, nos capítulos e na
// conclusão contra o elenco fixado no sumário.
//
// O caso que motivou: "Além das Quatro Linhas" abriu apresentando Luísa e
// Guilherme, e os 84 capítulos falavam de Ana e Lucas. Nada no sistema percebeu.

export type Gravidade = "info" | "warning" | "major" | "blocker";

export interface Achado {
  categoria: string;
  gravidade: Gravidade;
  local: string;
  evidencia: string;
  sugestao: string;
}

// Palavras que começam com maiúscula sem serem nome de pessoa. Sem esta lista o
// verificador acusaria "Curitiba", "Enquanto" e "Segunda" como personagens.
const NAO_SAO_NOMES_BRUTO = [
  "a", "à", "ao", "aos", "as", "às", "com", "como", "contra", "da", "das", "de", "do", "dos",
  "e", "em", "entre", "mas", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelo",
  "por", "quando", "que", "se", "sem", "sob", "sobre", "um", "uma", "e",
  "agora", "ainda", "além", "antes", "apesar", "após", "assim", "até", "cada", "certa", "certo",
  "depois", "durante", "enquanto", "então", "essa", "esse", "esta", "este", "eu", "ela", "ele",
  "elas", "eles", "havia", "hoje", "logo", "mesmo", "muito", "nada", "não", "nunca", "outra",
  "outro", "pouco", "primeira", "primeiro", "quase", "sempre", "só", "talvez", "tanto", "todas",
  "todo", "todos", "tudo", "última", "último", "capítulo", "parte", "livro", "introdução",
  "conclusão", "segunda", "segundas", "terceira", "janeiro", "fevereiro", "março", "abril",
  "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "domingo", "segunda-feira", "terça", "quarta", "quinta", "sexta", "sábado",
  // Tratamentos e titulos. Entram em maiuscula colados ao nome ("Delegada
  // Mariana", "Dona Tereza") e sem isto viravam personagens proprios. "Sao"
  // aparece por nome de lugar -- Sao Paulo, Sao Joao.
  "delegada", "delegado", "doutor", "doutora", "dona", "dom", "senhor", "senhora",
  "padre", "frei", "irmã", "irmao", "irmão", "seu", "são", "santo", "santa",
  "professor", "professora", "sargento", "capitão", "capitao", "tenente", "coronel",
];

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// A lista acima e escrita com acento para ser legivel, mas a comparacao usa a
// forma normalizada -- sem isto "Nao" nunca casava com "não" e entrava na lista
// de personagens.
const NAO_SAO_NOMES = new Set(NAO_SAO_NOMES_BRUTO.map(normalizar));

/**
 * Nomes próprios candidatos: palavra capitalizada que não abre frase e não está
 * na lista de exceções. Não é perfeito — é um detector de sinal, e por isso os
 * achados que ele gera são `warning`, não `blocker`, salvo quando comparado
 * diretamente ao elenco declarado.
 */
export function extrairNomes(texto: string): Map<string, number> {
  // Contamos as ocorrencias totais e, em separado, as que NAO abrem frase.
  //
  // Excluir toda palavra pos-ponto apagava o protagonista, porque "Ana olhou
  // para ele" e a forma mais comum de um personagem central aparecer. Mas contar
  // tudo trazia "Era", "Foi" e "Parece" como se fossem gente. O criterio que
  // separa os dois casos: nome de pessoa aparece no meio de uma frase pelo menos
  // uma vez; verbo capitalizado por inicio de frase, nunca.
  const total = new Map<string, number>();
  const meioDeFrase = new Map<string, number>();

  const re = /\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,})\b/g;
  for (const m of texto.matchAll(re)) {
    const nome = m[1];
    if (NAO_SAO_NOMES.has(normalizar(nome))) continue;
    total.set(nome, (total.get(nome) ?? 0) + 1);
    // Olhar so o caractere anterior nao serve: antes de um nome pos-ponto vem um
    // espaco, nao o ponto. Precisamos da janela anterior sem o espaco em branco.
    const antes = texto.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0);
    const abreFrase = antes.trim() === "" || /[.!?:;"'—–]\s*$/.test(antes);
    if (!abreFrase) meioDeFrase.set(nome, (meioDeFrase.get(nome) ?? 0) + 1);
  }

  const encontrados = new Map<string, number>();
  for (const [nome, n] of total) {
    if ((meioDeFrase.get(nome) ?? 0) >= 1) encontrados.set(nome, n);
  }
  return encontrados;
}

/**
 * Primeiro nome de verdade, pulando tratamentos. O elenco veio com "Delegada
 * Mariana Silva" e isto devolvia "delegada" -- entao Mariana, a protagonista,
 * era acusada de nao ser protagonista na propria introducao.
 */
function primeiroNome(completo: string): string {
  const partes = completo.trim().split(/\s+/).map(normalizar).filter(Boolean);
  return partes.find((p) => !NAO_SAO_NOMES.has(p)) ?? partes[0] ?? "";
}

export interface EntradaContinuidade {
  outline: Outline;
  intro: string | null;
  conclusao: string | null;
  capitulos: Array<{ idx: number; title: string; content: string }>;
  /** Só faz sentido em ficção; em não ficção a checagem é pulada. */
  ficcao: boolean;
}

/**
 * Compara os nomes de cada parte do livro com o elenco declarado no sumário.
 * Devolve achados, não uma nota — o objetivo é o revisor saber onde olhar.
 */
export function verificarContinuidade(e: EntradaContinuidade): Achado[] {
  if (!e.ficcao) return [];

  const elenco = e.outline.personagens ?? [];
  const achados: Achado[] = [];

  const autorizados = new Set<string>();
  for (const p of elenco) {
    autorizados.add(primeiroNome(p.nome));
    for (const parte of p.nome.split(/\s+/)) autorizados.add(normalizar(parte));
  }

  // Frequência no corpo do livro: quem aparece muito é personagem de fato, e é
  // com esse conjunto que a introdução e a conclusão precisam concordar.
  const corpo = new Map<string, number>();
  for (const c of e.capitulos) {
    for (const [nome, n] of extrairNomes(c.content || "")) {
      corpo.set(nome, (corpo.get(nome) ?? 0) + n);
    }
  }
  const recorrentes = [...corpo.entries()].filter(([, n]) => n >= 5).map(([nome]) => nome);

  if (elenco.length === 0) {
    achados.push({
      categoria: "elenco-ausente",
      gravidade: "warning",
      local: "sumário",
      evidencia: `Livro de ficção sem elenco declarado. Nomes recorrentes no texto: ${recorrentes.slice(0, 6).join(", ") || "nenhum"}.`,
      sugestao: "Regerar o sumário para fixar o elenco antes de escrever os capítulos.",
    });
  }

  // Protagonista inventado: nome muito recorrente que não está no elenco.
  if (elenco.length > 0) {
    for (const nome of recorrentes) {
      if (!autorizados.has(normalizar(nome))) {
        const ocorrencias = corpo.get(nome) ?? 0;
        achados.push({
          categoria: "personagem-nao-autorizado",
          gravidade: ocorrencias >= 50 ? "major" : "warning",
          local: "capítulos",
          evidencia: `"${nome}" aparece ${ocorrencias}× nos capítulos e não está no elenco do sumário.`,
          sugestao: `Incluir "${nome}" no elenco ou substituir pelo nome correto.`,
        });
      }
    }
  }

  // Introdução e conclusão são geradas em chamadas próprias — é onde os nomes
  // divergiam. Um nome citado ali que não existe no corpo do livro é blocker:
  // o leitor abre o livro conhecendo alguém que nunca aparece.
  const conhecidos = new Set<string>([...autorizados]);
  for (const nome of recorrentes) conhecidos.add(normalizar(nome));

  // Titulos entram em caixa alta e a conclusao costuma cita-los. Sem isto,
  // "No 'Primeiro Tempo: Encontro no Campo', Lucas e Marina..." acusava "Tempo"
  // como personagem inexistente -- e como blocker, o que travaria a publicacao.
  const palavrasDeTitulo = new Set<string>();
  for (const texto of [e.outline.title, e.outline.subtitle, ...e.outline.chapters.map((c) => c.title)]) {
    for (const palavra of (texto || "").split(/\s+/)) {
      const limpa = palavra.replace(/[^\p{L}]/gu, "");
      if (limpa) palavrasDeTitulo.add(normalizar(limpa));
    }
  }

  for (const [rotulo, texto] of [
    ["introdução", e.intro],
    ["conclusão", e.conclusao],
  ] as Array<[string, string | null]>) {
    if (!texto) continue;
    for (const [nome, n] of extrairNomes(texto)) {
      if (n < 2) continue; // menção única pode ser cidade, marca, mês
      if (palavrasDeTitulo.has(normalizar(nome))) continue;
      if (!conhecidos.has(normalizar(nome))) {
        achados.push({
          categoria: "personagem-fantasma",
          gravidade: "blocker",
          local: rotulo,
          evidencia: `"${nome}" é citado ${n}× na ${rotulo} e não aparece nos capítulos nem no elenco.`,
          sugestao: `Reescrever a ${rotulo} usando os personagens do livro (${[...autorizados].slice(0, 4).join(", ")}).`,
        });
      }
    }
  }

  // O defeito de "Alem das Quatro Linhas" nao era um nome inexistente: Guilherme
  // e Luisa apareciam 10 e 12 vezes nos capitulos, como secundarios. A introducao
  // os apresentava como o casal central, sendo que o casal e Ana e Lucas. Ou
  // seja, o erro era de PAPEL, e a checagem de nome fantasma passa por cima dele.
  const protagonistas = elenco.filter((p) => /protagonista|par rom|casal|principal/i.test(p.papel));
  const centrais = new Set<string>();
  for (const p of protagonistas) {
    // Todas as partes do nome, nao so a primeira: o texto alterna entre
    // "Mariana", "Silva" e "Delegada Silva" para a mesma pessoa.
    for (const parte of p.nome.split(/\s+/)) {
      const chave = normalizar(parte);
      if (chave && !NAO_SAO_NOMES.has(chave)) centrais.add(chave);
    }
  }
  // Guardado a parte porque `centrais` e normalizado para comparar, e a mensagem
  // precisa mostrar o nome como esta escrito no livro.
  const nomesCentrais = protagonistas
    .map((p) => p.nome.split(/\s+/).find((x) => !NAO_SAO_NOMES.has(normalizar(x))) ?? p.nome)
    .join(" e ");

  if (centrais.size > 0) {
    for (const [rotulo, texto] of [
      ["introdução", e.intro],
      ["conclusão", e.conclusao],
    ] as Array<[string, string | null]>) {
      if (!texto) continue;
      const nomes = [...extrairNomes(texto).entries()]
        .filter(([nome]) => !palavrasDeTitulo.has(normalizar(nome)))
        .sort((a, b) => b[1] - a[1]);
      const principal = nomes[0];
      if (principal && principal[1] >= 2 && !centrais.has(normalizar(principal[0]))) {
        achados.push({
          categoria: "protagonista-divergente",
          gravidade: "major",
          local: rotulo,
          evidencia: `A ${rotulo} gira em torno de "${principal[0]}" (${principal[1]}×), que nao e protagonista. O papel central e de ${nomesCentrais}.`,
          sugestao: `Reescrever a ${rotulo} centrada nos protagonistas do livro.`,
        });
      }
    }
  }

  // Capitulos orfaos: nenhuma das duas figuras dominantes do livro aparece.
  //
  // Esta e a unica checagem que nao depende do elenco declarado, e por isso a
  // unica capaz de pegar livros escritos antes de existir elenco. "Alem das
  // Quatro Linhas" tem Ana (333 mencoes) e Lucas (284), e mesmo assim 36 dos 84
  // capitulos nao citam nenhum dos dois -- cada um inventou o proprio casal.
  // Sem esta regra aquele livro passava no Quality Gate sem um unico achado
  // grave, que e exatamente o pior caso possivel.
  if (e.capitulos.length >= 8) {
    const dominantes = [...corpo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([nome]) => normalizar(nome));

    if (dominantes.length === 2) {
      const orfaos = e.capitulos.filter((c) => {
        const nomes = [...extrairNomes(c.content || "").keys()].map(normalizar);
        return !dominantes.some((d) => nomes.includes(d));
      });
      const proporcao = orfaos.length / e.capitulos.length;
      if (proporcao > 0.15) {
        const lista = orfaos.slice(0, 8).map((c) => c.idx + 1).join(", ");
        achados.push({
          categoria: "capitulos-orfaos",
          // Acima de 30% o livro nao e mais uma obra so; abaixo disso pode ser
          // uma subtrama legitima e fica como aviso forte para o revisor.
          gravidade: proporcao > 0.3 ? "blocker" : "major",
          local: "capítulos",
          evidencia: `${orfaos.length} de ${e.capitulos.length} capítulos (${Math.round(proporcao * 100)}%) não citam nenhuma das figuras centrais do livro. Capítulos: ${lista}${orfaos.length > 8 ? "…" : ""}.`,
          sugestao: "Rever esses capítulos: provavelmente trocaram os protagonistas por outros nomes.",
        });
      }
    }
  }

  return achados;
}

export function contarPorGravidade(achados: Achado[]): Record<Gravidade, number> {
  const t: Record<Gravidade, number> = { info: 0, warning: 0, major: 0, blocker: 0 };
  for (const a of achados) t[a.gravidade] += 1;
  return t;
}
