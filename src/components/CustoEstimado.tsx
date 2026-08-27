import { estimarCusto, formatarUsd, type EntradaCusto } from "../lib/custo";

// Mostrado antes de gerar. Serve a duas perguntas que so apareciam depois:
// quanto isso vai custar, e quantas paginas o sistema realmente entrega.
export default function CustoEstimado(props: EntradaCusto) {
  const e = estimarCusto(props);

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-neutral-700">Custo aproximado</span>
        <span className="text-lg font-semibold tabular-nums text-neutral-900">
          {formatarUsd(e.usdTotal)}
        </span>
      </div>

      <dl className="mt-2 space-y-0.5 text-xs text-neutral-500">
        <div className="flex justify-between gap-4">
          <dt>Texto — {e.capitulos} capítulos, ~{e.palavrasEstimadas.toLocaleString("pt-BR")} palavras</dt>
          <dd className="tabular-nums">{formatarUsd(e.usdTexto)}</dd>
        </div>
        {e.usdImagens > 0 && (
          <div className="flex justify-between gap-4">
            <dt>Imagens geradas por IA</dt>
            <dd className="tabular-nums">{formatarUsd(e.usdImagens)}</dd>
          </div>
        )}
      </dl>

      {e.abaixoDoPedido && (
        <p className="mt-3 border-t border-neutral-200 pt-2 text-xs text-amber-700">
          O sistema gera no máximo 12 capítulos, e cada um sai com cerca de 830 palavras.
          Este pedido deve resultar em <strong>~{e.paginasEstimadas} páginas</strong>, não
          nas {props.pageCount} solicitadas.
        </p>
      )}

      <p className="mt-2 text-[11px] text-neutral-400">
        Estimativa a partir da média do acervo — a fatura real varia. Audiobook não incluído
        (é cobrado à parte, por caractere).
      </p>
    </div>
  );
}
