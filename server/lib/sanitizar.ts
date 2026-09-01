// Barreira entre o que a IA (ou uma exceção) devolve e o que vira conteúdo de
// livro ou texto na tela. Dois vazamentos reais motivaram este módulo:
//
// 1. Capítulos 4 e 10 de "Vingança Perigosa" guardam "Desculpe, não posso ajudar
//    com esse pedido." como se fosse o texto do capítulo. A recusa chega em
//    HTTP 200 e o código só testava `if (!text)`, então passou direto.
// 2. "ELEVENLABS_API_KEY ou ELEVENLABS_VOICE_ID não configurados no .env." era
//    gravado cru em audio_error e renderizado na área editorial.

/** Recusa do modelo. Chega como resposta normal, não como erro. */
const RECUSAS = [
  /^\s*desculpe[,.!\s]{0,4}(mas\s+)?(eu\s+)?n[ãa]o\s+posso/i,
  /^\s*sinto\s+muito[,.!\s]{0,4}(mas\s+)?(eu\s+)?n[ãa]o\s+posso/i,
  /^\s*n[ãa]o\s+posso\s+(ajudar|atender|criar|gerar|escrever|continuar)/i,
  /^\s*(i'?m\s+sorry|i\s+cannot|i\s+can'?t|i\s+am\s+unable)/i,
  /^\s*(as\s+an\s+ai|como\s+uma?\s+(ia|intelig[êe]ncia\s+artificial))/i,
];

/**
 * Um capítulo legítimo tem milhares de caracteres. Recusas são curtas — as duas
 * reais tinham 43 e 47. O limite serve de segunda rede para recusas que não
 * casem com os padrões acima; textos longos nunca são barrados por ele.
 */
const MIN_CHARS_CONTEUDO = 200;

export interface ConteudoRecusado {
  recusado: true;
  motivo: string;
  amostra: string;
}

/**
 * Decide se a resposta do modelo é conteúdo de verdade. Devolve null quando o
 * texto serve, ou o motivo da recusa quando não serve.
 */
export function detectarRecusa(texto: string, minChars = MIN_CHARS_CONTEUDO): ConteudoRecusado | null {
  const limpo = (texto ?? "").trim();
  const amostra = limpo.slice(0, 120);

  if (!limpo) {
    return { recusado: true, motivo: "resposta vazia", amostra: "" };
  }
  for (const padrao of RECUSAS) {
    if (padrao.test(limpo)) {
      return { recusado: true, motivo: "o modelo recusou o pedido", amostra };
    }
  }
  if (limpo.length < minChars) {
    return {
      recusado: true,
      motivo: `resposta curta demais (${limpo.length} caracteres, mínimo ${minChars})`,
      amostra,
    };
  }
  return null;
}

// Nomes de variável de ambiente e caminhos de arquivo não dizem nada a quem usa
// o app e expõem a configuração do servidor. O valor de um segredo nunca deveria
// chegar aqui, mas se chegar também não passa.
const PADROES_INTERNOS: Array<[RegExp, string]> = [
  [/\b[A-Z][A-Z0-9]*(_[A-Z0-9]+)+\b/g, "uma configuração do servidor"],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "«removido»"],
  [/\b[a-zA-Z]:\\[^\s"']+/g, "«caminho removido»"],
  [/\/(?:home|root|usr|var|etc)\/[^\s"']+/g, "«caminho removido»"],
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, "«conexão removida»"],
  [/\bhttps?:\/\/[^\s"']*(?:key|token|secret|password)=[^\s"']*/gi, "«URL removida»"],
];

/**
 * Limpa uma mensagem antes de ela virar texto de tela (audio_error,
 * error_message). Preserva a frase para o usuário entender o que houve, sem
 * entregar o nome da variável nem o caminho do arquivo.
 */
export function sanitizarMensagem(bruta: string): string {
  let msg = (bruta ?? "").trim();
  if (!msg) return "Erro inesperado.";

  for (const [padrao, troca] of PADROES_INTERNOS) {
    msg = msg.replace(padrao, troca);
  }

  // Stack trace: só a primeira linha interessa a quem lê na tela.
  msg = msg.split("\n")[0].trim();
  return msg.slice(0, 300) || "Erro inesperado.";
}

/**
 * Mensagens de configuração ausente viram texto acionável. Sem isto, o usuário
 * lê o nome de uma variável de ambiente e não sabe o que fazer com ela.
 */
export function mensagemDeErroParaUsuario(bruta: string): string {
  const msg = (bruta ?? "").trim();
  if (/ELEVENLABS/i.test(msg)) {
    return "A narração não está configurada neste servidor. Fale com o responsável técnico.";
  }
  if (/OPENAI_API_KEY/i.test(msg)) {
    return "A geração por IA não está configurada neste servidor. Fale com o responsável técnico.";
  }
  if (/DATABASE_URL|ECONNREFUSED|28P01|3D000/i.test(msg)) {
    return "O servidor não conseguiu falar com o banco de dados. Tente de novo em instantes.";
  }
  return sanitizarMensagem(msg);
}
