import { useState } from "react";
import { api } from "../lib/api";

export default function ReferenceMaterialPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const [mode, setMode] = useState<"texto" | "link" | "pdf">("texto");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtractUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.extractReferenceUrl(url.trim());
      onChange(value ? `${value}\n\n${result.text}` : result.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao extrair o link.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.extractReferencePdf(file);
      onChange(value ? `${value}\n\n${result.text}` : result.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao extrair o PDF.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs font-medium">
        {(["texto", "link", "pdf"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 ${mode === m ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
          >
            {m === "texto" ? "Colar texto" : m === "link" ? "Colar link" : "Enviar PDF"}
          </button>
        ))}
      </div>

      {mode === "link" && (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={handleExtractUrl}
            disabled={busy || !url.trim()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy ? "Extraindo…" : "Extrair"}
          </button>
        </div>
      )}

      {mode === "pdf" && (
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfChange}
          disabled={busy}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-neutral-50"
        />
      )}

      {busy && mode === "pdf" && <p className="text-xs text-neutral-500">Extraindo texto do PDF…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          mode === "texto"
            ? "Cole aqui o texto de referência que a IA deve usar como base do ebook…"
            : "O texto extraído aparece aqui — revise e edite antes de gerar o ebook."
        }
        rows={10}
      />
      <p className="text-xs text-neutral-500">{value.length.toLocaleString("pt-BR")} caracteres de material de referência.</p>
    </div>
  );
}
