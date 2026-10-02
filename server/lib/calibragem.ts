// Calibragem de tamanho por modelo (correção de 02/10/2026).
//
// Pedir nao segura tamanho: o prompt pede "entre X e Y palavras" e os modelos
// atuais escrevem bem mais. Medido:
//   - briefing de 6 capitulos, alvo 900: gpt-5.4-mini 1.722 (1,9x), gpt-5.5 1.664 (1,85x);
//   - "Depois da Ultima Chave", alvo 1.500: gpt-5.4-mini bateu no teto de tokens
//     nos 5 capitulos (~2.400 palavras cada, 1,6x -- e so parou porque foi cortado).
// O teto de tokens segurava o livro cortando o fim de cada capitulo. Com a
// continuacao (askOpenAI "continuar"), o corte deixou de ser freio: sem
// calibragem o livro passaria de 2x a meta.
//
// Aqui a meta pedida ao modelo e dividida pelo excesso dele, para o que sai
// cair perto da meta real. O excesso comeca num palpite por modelo e se ajusta
// sozinho pelo que cada capitulo entregou -- mesmo principio da reserva de
// raciocinio em ai.ts: converge para o comportamento real em vez de ficar num
// chute.

/** Palpite inicial, pelas medicoes acima. Modelo desconhecido = 1 (nao corrige). */
function palpite(modelo: string): number {
  const m = modelo.toLowerCase();
  if (/gpt-5\.\d+-mini|gpt-5-mini/.test(m)) return 1.7;
  if (/gpt-5/.test(m)) return 1.6;
  return 1;
}

const MIN = 1;
const MAX = 2.5;
/** Peso da observacao nova: metade, para reagir rapido sem oscilar com um capitulo fora da curva. */
const PESO = 0.5;

const porModelo = new Map<string, number>();

/** Quanto este modelo escreve a mais do que o piso pedido (>= 1). */
export function excessoDe(modelo: string): number {
  return porModelo.get(modelo) ?? palpite(modelo);
}

/**
 * Registra o que um capitulo entregou contra o piso que foi pedido. Capitulos
 * muito curtos (recusa, erro) nao entram -- eles diriam que o modelo escreve
 * menos, quando o problema foi outro.
 */
export function registrarEntrega(modelo: string, pisoPedido: number, entregue: number): number {
  const atual = excessoDe(modelo);
  if (pisoPedido <= 0 || entregue < pisoPedido * 0.5) return atual;
  const observado = Math.min(MAX, Math.max(MIN, entregue / pisoPedido));
  const novo = Math.min(MAX, Math.max(MIN, atual * (1 - PESO) + observado * PESO));
  porModelo.set(modelo, novo);
  return novo;
}

/** Faixa de palavras a PEDIR para que o modelo entregue perto de `meta`. */
export function faixaPedida(modelo: string, meta: number, folgaDoTeto = 1.3): { piso: number; teto: number } {
  const f = excessoDe(modelo);
  return {
    piso: Math.max(150, Math.round(meta / f)),
    teto: Math.max(200, Math.round((meta * folgaDoTeto) / f)),
  };
}

/** Só para testes. */
export function zerarCalibragem(): void {
  porModelo.clear();
}
