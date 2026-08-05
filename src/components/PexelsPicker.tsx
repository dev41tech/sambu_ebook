import { useEffect, useRef, useState } from "react";
import { api, type PexelsPhoto } from "../lib/api";

export default function PexelsPicker({
  initialQuery,
  orientation,
  selectedId,
  onSelect,
}: {
  initialQuery: string;
  orientation: "portrait" | "landscape";
  selectedId: number | null;
  onSelect: (photo: PexelsPhoto) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PexelsPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInitialSearch = useRef(false);

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const photos = await api.searchPexels(q.trim(), orientation);
      setResults(photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar fotos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didInitialSearch.current) return;
    didInitialSearch.current = true;
    runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(query);
            }
          }}
          placeholder="Buscar fotos (ex: escritório moderno)"
        />
        <button
          type="button"
          onClick={() => runSearch(query)}
          disabled={loading}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {results.length > 0 && (
        <div className={`grid gap-2 ${orientation === "portrait" ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3"}`}>
          {results.map((photo) => {
            const selected = photo.id === selectedId;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => onSelect(photo)}
                className={`overflow-hidden rounded-md border-2 transition ${
                  selected ? "border-amber-700 ring-2 ring-amber-700/30" : "border-transparent hover:border-neutral-300"
                }`}
                title={`Foto de ${photo.photographer}`}
              >
                <img
                  src={photo.thumbUrl}
                  alt={photo.alt}
                  className={orientation === "portrait" ? "aspect-[2/3] w-full object-cover" : "aspect-video w-full object-cover"}
                />
              </button>
            );
          })}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <p className="text-xs text-neutral-500">Nenhum resultado ainda — busque um termo acima.</p>
      )}

      <p className="text-[0.65rem] text-neutral-400">Fotos fornecidas pelo Pexels.</p>
    </div>
  );
}
