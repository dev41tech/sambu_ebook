import { TAXONOMIA } from "../lib/categorias";

// Classificacao usada na busca da vitrine e, no caso da principal, como tema que
// alimenta o prompt da IA. Aparece em todas as telas de criacao e na importacao.
export default function ClassificacaoPicker({
  principal,
  onPrincipal,
  secundarias,
  onSecundarias,
  obrigatorio = true,
}: {
  principal: string;
  onPrincipal: (v: string) => void;
  secundarias: string[];
  onSecundarias: (v: string[]) => void;
  obrigatorio?: boolean;
}) {
  function alternar(caminho: string) {
    onSecundarias(
      secundarias.includes(caminho)
        ? secundarias.filter((c) => c !== caminho)
        : [...secundarias, caminho],
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">
          Categoria principal{obrigatorio && " *"}
        </label>
        <select
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={principal}
          onChange={(e) => onPrincipal(e.target.value)}
          required={obrigatorio}
        >
          <option value="">Selecione…</option>
          {TAXONOMIA.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.itens.map((item) => {
                const caminho = `${g.grupo} > ${item}`;
                return (
                  <option key={caminho} value={caminho}>
                    {item}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Define onde o ebook aparece na busca e orienta a IA sobre o gênero. O assunto
          específico da obra vai no campo de instruções extras.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">
          Categorias secundárias (opcional)
        </label>
        {secundarias.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {secundarias.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => alternar(c)}
                className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs text-white"
                title="Remover"
              >
                {c} ×
              </button>
            ))}
          </div>
        )}
        <details className="rounded-md border border-neutral-200">
          <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600">
            Escolher categorias secundárias
          </summary>
          <div className="max-h-64 space-y-3 overflow-y-auto px-3 py-2">
            {TAXONOMIA.map((g) => (
              <div key={g.grupo}>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {g.grupo}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.itens.map((item) => {
                    const caminho = `${g.grupo} > ${item}`;
                    const ativo = secundarias.includes(caminho);
                    const ehPrincipal = caminho === principal;
                    return (
                      <button
                        key={caminho}
                        type="button"
                        disabled={ehPrincipal}
                        onClick={() => alternar(caminho)}
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          ehPrincipal
                            ? "cursor-not-allowed border border-neutral-200 text-neutral-300"
                            : ativo
                              ? "bg-amber-700 text-white"
                              : "border border-neutral-300 text-neutral-600 hover:border-neutral-500"
                        }`}
                        title={ehPrincipal ? "Já é a categoria principal" : ""}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
