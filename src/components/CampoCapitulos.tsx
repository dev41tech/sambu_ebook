import { capitulosParaPalavras, MAX_CAPITULOS, PALAVRAS_POR_CAPITULO } from "../lib/custo";

/**
 * Numero de capitulos, perguntado antes de gerar.
 *
 * Ate aqui a quantidade saia de uma conta escondida (palavras / media por
 * capitulo) e o usuario so descobria depois -- foi assim que um pedido de 250
 * paginas virou 100 capitulos. O campo ja vem com a sugestao da conta; mexer
 * nele e uma escolha, deixar como esta e aceitar a sugestao.
 *
 * `valor` null = automatico (a sugestao acompanha o tamanho do livro).
 */
export default function CampoCapitulos({
  palavras,
  valor,
  onChange,
}: {
  palavras: number;
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  const sugestao = capitulosParaPalavras(palavras);
  const efetivo = valor ?? sugestao;
  const porCapitulo = Math.round(palavras / Math.max(1, efetivo));

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-4">
      <label className="text-sm font-medium text-neutral-700" htmlFor="campo-capitulos">
        Número de capítulos
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="campo-capitulos"
          type="number"
          min={1}
          max={MAX_CAPITULOS}
          className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={efetivo}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) && n >= 1 ? Math.min(MAX_CAPITULOS, Math.round(n)) : null);
          }}
        />
        {valor === null ? (
          <span className="text-xs text-neutral-500">Sugestão automática para o tamanho escolhido.</span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-amber-700 underline underline-offset-2"
          >
            Voltar para a sugestão ({sugestao})
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Cerca de {porCapitulo.toLocaleString("pt-BR")} palavras por capítulo. Máximo {MAX_CAPITULOS}.
      </p>
      {porCapitulo > PALAVRAS_POR_CAPITULO * 1.8 && (
        <p className="text-xs text-amber-700">
          Capítulos longos demais: a IA costuma escrever cerca de {PALAVRAS_POR_CAPITULO.toLocaleString("pt-BR")}{" "}
          palavras por capítulo, então o livro tende a sair menor que o pedido. Aumente o número de capítulos
          para chegar ao tamanho escolhido.
        </p>
      )}
      {porCapitulo < 400 && (
        <p className="text-xs text-amber-700">
          Capítulos muito curtos (menos de 400 palavras cada) — o texto tende a ficar raso ou a passar do tamanho
          pedido.
        </p>
      )}
    </div>
  );
}
