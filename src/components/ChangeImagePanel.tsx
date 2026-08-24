import { useState } from "react";
import PexelsPicker from "./PexelsPicker";
import LocalCoverPicker from "./LocalCoverPicker";
import type { PexelsPhoto, RegenerateImagePayload } from "../lib/api";

export default function ChangeImagePanel({
  orientation,
  defaultQuery,
  busy,
  error,
  onSubmit,
  onCancel,
  allowLocal,
}: {
  orientation: "portrait" | "landscape";
  defaultQuery: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: RegenerateImagePayload) => void;
  onCancel: () => void;
  allowLocal?: boolean;
}) {
  const [source, setSource] = useState<"ai" | "stock" | "local">("ai");
  const [suggestion, setSuggestion] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PexelsPhoto | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<string | null>(null);

  function handleSubmit() {
    if (source === "ai") {
      onSubmit({ source: "ai", suggestion: suggestion.trim() });
    } else if (source === "stock" && selectedPhoto) {
      onSubmit({
        source: "stock",
        stock_url: selectedPhoto.downloadUrl,
        alt_text: selectedPhoto.alt,
        credit: `Foto de ${selectedPhoto.photographer} (Pexels)`,
      });
    } else if (source === "local" && selectedLocalFile) {
      onSubmit({ source: "local", local_file: selectedLocalFile });
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex gap-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setSource("ai")}
          className={`rounded-full px-3 py-1 ${source === "ai" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
        >
          Gerar com IA
        </button>
        <button
          type="button"
          onClick={() => setSource("stock")}
          className={`rounded-full px-3 py-1 ${source === "stock" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
        >
          Banco de imagens
        </button>
        {allowLocal && (
          <button
            type="button"
            onClick={() => setSource("local")}
            className={`rounded-full px-3 py-1 ${source === "local" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
          >
            Minha imagem
          </button>
        )}
      </div>

      {source === "ai" && (
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          rows={2}
          placeholder="Orientação para a nova imagem (opcional)"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      )}
      {source === "stock" && (
        <PexelsPicker
          initialQuery={defaultQuery}
          orientation={orientation}
          selectedId={selectedPhoto?.id ?? null}
          onSelect={setSelectedPhoto}
        />
      )}
      {source === "local" && <LocalCoverPicker selected={selectedLocalFile} onSelect={setSelectedLocalFile} />}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            busy || (source === "stock" && !selectedPhoto) || (source === "local" && !selectedLocalFile)
          }
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Aplicando…" : "Usar esta imagem"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
