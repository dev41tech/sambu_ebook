import test from "node:test";
import assert from "node:assert/strict";
import { slugDe } from "./slug";

// O slug e a unica trava contra publicar o mesmo livro duas vezes no site (o
// script de carga do acervo usa a mesma regra), entao ele precisa ser estavel e
// nunca sair vazio.
test("slug tira acento, pontuacao e caixa alta", () => {
  assert.equal(slugDe("Ecos do Além", "abc12345-0000"), "ecos-do-alem");
  assert.equal(slugDe("NR-1 na Prática: Como Mapear", "abc12345-0000"), "nr-1-na-pratica-como-mapear");
  assert.equal(slugDe("  Menopausa e Perimenopausa  ", "abc12345-0000"), "menopausa-e-perimenopausa");
});

test("titulo vazio ou so de simbolos cai no id, e nao num slug vazio", () => {
  // Sem isto, dois livros sem titulo colidiriam entre si e o segundo seria
  // tratado como "ja publicado".
  assert.equal(slugDe("", "abc12345-0000"), "ebook-abc12345");
  assert.equal(slugDe("!!! ???", "def67890-0000"), "ebook-def67890");
});

test("slug tem teto de tamanho e nao termina em traco", () => {
  const s = slugDe("A".repeat(200), "abc12345-0000");
  assert.equal(s.length, 70);
  assert.ok(!s.endsWith("-"));
  const cortado = slugDe(`${"palavra ".repeat(20)}fim`, "abc12345-0000");
  assert.ok(!cortado.endsWith("-"), `terminou em traco: ${cortado}`);
});

test("o mesmo titulo gera sempre o mesmo slug", () => {
  assert.equal(slugDe("Sob o Mesmo Teto", "id-1"), slugDe("Sob o Mesmo Teto", "id-2"));
});
