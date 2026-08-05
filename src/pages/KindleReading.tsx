import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type EbookDetail } from "../lib/api";
import KindleFrame from "../components/KindleFrame";
import KindleReader from "../components/KindleReader";

export default function KindleReading() {
  const { id } = useParams<{ id: string }>();
  const [ebook, setEbook] = useState<EbookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getEbook(id)
      .then(setEbook)
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar ebook."));
  }, [id]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <Link to={id ? `/ebooks/${id}` : "/"} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Voltar
        </Link>
        {ebook && <p className="text-sm font-medium text-neutral-700">{ebook.title}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!ebook && !error && <p className="text-center text-sm text-neutral-500">Carregando…</p>}

      {ebook && ebook.status !== "ready" && (
        <p className="text-center text-sm text-neutral-500">Este ebook ainda não está pronto para leitura.</p>
      )}

      {ebook && ebook.status === "ready" && (
        <KindleFrame>
          <KindleReader ebook={ebook} />
        </KindleFrame>
      )}

      <p className="text-center text-xs text-neutral-400">Use as setas ← → do teclado para virar a página.</p>
    </div>
  );
}
