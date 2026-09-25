/**
 * Slug do livro no catalogo publico (Sambu Online).
 *
 * E a unica trava contra publicar o mesmo livro duas vezes: antes de inserir, a
 * publicacao procura o slug em `books` e pula se ja existir -- a mesma regra do
 * script de carga do acervo. Fica em arquivo proprio, sem dependencia de banco,
 * para poder ser testado sem subir o app.
 */
export function slugDe(titulo: string, id: string): string {
  const base = (titulo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 70)
    .replace(/^-+|-+$/g, "");
  // Sem titulo (ou titulo so de simbolos) o slug viria vazio e colidiria com
  // qualquer outro livro na mesma situacao.
  return base || `ebook-${id.slice(0, 8)}`;
}
