// Título do capítulo sem a numeração que a IA às vezes cola na frente ("2. O copo
// rachado", "Capítulo 3: A porta", "4 - A rua"). O número do capítulo é mostrado à
// parte ("Capítulo 2" acima do título) — com ele também no título, o leitor via
// "Capítulo 2 / 2. O copo rachado de Íris". 125 capítulos de 7 livros estavam assim
// em 02/10/2026.
//
// Usado em dois pontos: ao gravar o sumário (livros novos já nascem limpos) e ao
// exibir/exportar (livros antigos saem limpos sem precisar mexer no banco).

const PREFIXO = /^\s*(?:cap[ií]tulo\s+)?(?:\d+|[ivxlcdm]+)\s*(?:[.:)\-–—]\s*|\s+[-–—]\s+)/i;
const SO_ROTULO = /^\s*cap[ií]tulo\s+(?:\d+|[ivxlcdm]+)\s*$/i;

export function limparTituloCapitulo(titulo: string): string {
  const t = (titulo ?? "").trim();
  if (!t || SO_ROTULO.test(t)) return t; // "Capítulo 3" sozinho é o título — não sobra nada para mostrar
  const limpo = t.replace(PREFIXO, "").trim();
  return limpo || t;
}
