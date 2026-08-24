// Retry com backoff exponencial para chamadas a APIs externas (OpenAI, etc.) que falham
// de forma transitória (rate limit, erro 5xx, instabilidade de rede) — evita que a geração
// inteira de um ebook caia por um erro que teria passado numa segunda tentativa.

function isRetryableError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  const code = (err as { code?: string } | undefined)?.code;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(code)) {
    return true;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryableError(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
