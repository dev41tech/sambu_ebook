import { useEffect, useRef, useState } from "react";
import { api, type LocalCoverFile } from "../lib/api";
import ImportIcon from "./ImportIcon";

export default function LocalCoverPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (filename: string) => void;
}) {
  const [files, setFiles] = useState<LocalCoverFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    api.listLocalCovers().then(setFiles).catch(() => setFiles([]));
  }

  useEffect(() => {
    if (files === null) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const saved = await api.uploadLocalCover(file);
      refresh();
      onSelect(saved.filename);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao enviar a imagem.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
        disabled={uploading}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex w-full flex-col items-center gap-1.5 rounded-md border-2 border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50"
      >
        <ImportIcon className="h-5 w-5 text-neutral-500" />
        {uploading ? "Enviando…" : "Clique para importar uma imagem"}
      </button>
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      <p className="text-xs text-neutral-500">
        Ou coloque arquivos manualmente na pasta <code>ebook-forge/covers</code> — eles aparecem abaixo.
      </p>

      {files === null ? (
        <p className="text-xs text-neutral-500">Carregando…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-neutral-500">Nenhuma capa disponível ainda.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <button
              key={f.filename}
              type="button"
              onClick={() => onSelect(f.filename)}
              className={`overflow-hidden rounded-md border-2 ${selected === f.filename ? "border-neutral-900" : "border-transparent"}`}
              title={f.filename}
            >
              <img
                src={`/api/local-covers/${encodeURIComponent(f.filename)}/preview`}
                alt={f.filename}
                className="h-24 w-20 object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {!selected && files && files.length > 0 && (
        <p className="text-xs text-amber-700">Selecione uma imagem para continuar.</p>
      )}
    </div>
  );
}
