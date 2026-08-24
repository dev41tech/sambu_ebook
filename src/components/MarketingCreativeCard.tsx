import { useState } from "react";
import { api, type MarketingCreative } from "../lib/api";

const TIPO_LABEL: Record<string, string> = {
  capa: "Capa alternativa",
  post: "Post (quadrado)",
  story: "Story (vertical)",
  banner: "Banner (paisagem)",
};

export default function MarketingCreativeCard({
  ebookId,
  creative,
}: {
  ebookId: string;
  creative: MarketingCreative;
}) {
  const [status, setStatus] = useState<"checking" | "ready" | "missing" | "rendering">("checking");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const imgUrl = `/api/ebooks/${ebookId}/marketing/creative/${encodeURIComponent(creative.id)}?v=${version}`;

  async function handleRender() {
    setStatus("rendering");
    setError(null);
    try {
      await api.renderMarketingCreative(ebookId, creative.id);
      setVersion((v) => v + 1);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao renderizar criativo.");
      setStatus("missing");
    }
  }

  return (
    <div className="w-44 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        {TIPO_LABEL[creative.tipo] || creative.tipo}
      </p>

      {status !== "missing" && status !== "rendering" && (
        <img
          src={imgUrl}
          alt={creative.headline}
          className="h-40 w-44 rounded-md border border-neutral-200 object-cover shadow-sm"
          style={{ display: status === "ready" ? "block" : "none" }}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("missing")}
        />
      )}
      {status === "checking" && (
        <div className="flex h-40 w-44 items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400">
          Verificando…
        </div>
      )}
      {status === "missing" && (
        <div className="flex h-40 w-44 items-center justify-center rounded-md border border-dashed border-neutral-300 p-2 text-center text-xs text-neutral-400">
          Ainda não renderizado
        </div>
      )}
      {status === "rendering" && (
        <div className="flex h-40 w-44 items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400">
          Renderizando…
        </div>
      )}

      <p className="text-xs leading-snug text-neutral-600">{creative.headline}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRender}
          disabled={status === "rendering"}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          {status === "ready" ? "Renderizar de novo" : "Renderizar"}
        </button>
        {status === "ready" && (
          <a
            href={imgUrl}
            download={`${creative.tipo}-${creative.id}.png`}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
          >
            Baixar
          </a>
        )}
      </div>
    </div>
  );
}
