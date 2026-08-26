import { useState } from "react";
import { api } from "../lib/api";

// Marcador de fonte: o servidor usa isso para dividir a verba de contexto entre
// os artigos, em vez de cortar o material no primeiro que couber.
export const MARCA_FONTE = "--- Fonte:";

export default function ReferenceMaterialPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const [mode, setMode] = useState<"texto" | "link" | "pdf">("texto");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fontes = value
    .split("\n")
    .filter((l) => l.startsWith(MARCA_FONTE))
    .map((l) => l.replace(MARCA_FONTE, "").replace(/---$/, "").trim());

  function anexar(atual: string, titulo: string, texto: string) {
    const bloco = `${MARCA_FONTE} ${titulo} ---\n${texto}`;
    return atual ? `${atual}\n\n${bloco}` : bloco;
  }

  async function extrairLinks() {
    const lista = urls
      .split(/[\s,;]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (lista.length === 0) {
      setError("Cole um ou mais links começando com http:// ou https://.");
      return;
    }
    setBusy(true);
    setError(null);
    let acumulado = value;
    const falhas: string[] = [];
    for (let i = 0; i < lista.length; i++) {
      setProgresso(`Extraindo ${i + 1} de ${lista.length}…`);
      try {
        const r = await api.extractReferenceUrl(lista[i]);
        acumulado = anexar(acumulado, `${r.title || "Artigo"} (${lista[i]})`, r.text);
      } catch {
        falhas.push(lista[i]);
      }
    }
    onChange(acumulado);
    setUrls("");
    setProgresso("");
    setBusy(false);
    if (falhas.length > 0) {
      setError(`Não consegui extrair ${falhas.length} de ${lista.length}: ${falhas.join(", ")}`);
    }
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    let acumulado = value;
    const falhas: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgresso(`Extraindo ${i + 1} de ${files.length}…`);
      try {
        const r = await api.extractReferencePdf(files[i]);
        acumulado = anexar(acumulado, `${r.title || files[i].name} (PDF)`, r.text);
      } catch {
        falhas.push(files[i].name);
      }
    }
    onChange(acumulado);
    setProgresso("");
    setBusy(false);
    e.target.value = "";
    if (falhas.length > 0) setError(`Falha em: ${falhas.join(", ")}`);
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
            {m === "texto" ? "Colar texto" : m === "link" ? "Colar links" : "Enviar PDFs"}
          </button>
        ))}
      </div>

      {mode === "link" && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"Cole vários links, um por linha:\nhttps://artigo-1...\nhttps://artigo-2..."}
            rows={4}
            disabled={busy}
          />
          <button
            type="button"
            onClick={extrairLinks}
            disabled={busy || !urls.trim()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy ? progresso || "Extraindo…" : "Extrair todos"}
          </button>
        </div>
      )}

      {mode === "pdf" && (
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handlePdfChange}
          disabled={busy}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-neutral-50"
        />
      )}

      {busy && progresso && <p className="text-xs text-neutral-500">{progresso}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {fontes.length > 0 && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-700">
            {fontes.length} {fontes.length === 1 ? "fonte incluída" : "fontes incluídas"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {fontes.map((f, i) => (
              <li key={i} className="truncate text-xs text-neutral-500">
                {i + 1}. {f}
              </li>
            ))}
          </ul>
        </div>
      )}

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
      <p className="text-xs text-neutral-500">
        {value.length.toLocaleString("pt-BR")} caracteres de material de referência.
      </p>
    </div>
  );
}
