import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type EbookSummary, type EbookDetail } from "../lib/api";
import KindleFrame from "../components/KindleFrame";
import KindleReader from "../components/KindleReader";

const STATUS_LABEL: Record<EbookSummary["status"], string> = {
  draft: "Rascunho",
  generating: "Gerando",
  ready: "Pronto",
  error: "Erro",
};

const STATUS_CLASS: Record<EbookSummary["status"], string> = {
  draft: "bg-neutral-100 text-neutral-600",
  generating: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const [ebooks, setEbooks] = useState<EbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewEbook, setPreviewEbook] = useState<EbookDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    api
      .listEbooks()
      .then((list) => {
        setEbooks(list);
        const firstReady = list.find((e) => e.status === "ready");
        if (firstReady) setPreviewId(firstReady.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar."));
  }, []);

  useEffect(() => {
    if (!previewId) return;
    setPreviewLoading(true);
    api
      .getEbook(previewId)
      .then(setPreviewEbook)
      .catch(() => setPreviewEbook(null))
      .finally(() => setPreviewLoading(false));
  }, [previewId]);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Biblioteca</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Meus ebooks</h1>
          </div>
          <Link
            to="/ebooks/novo"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Criar novo ebook
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {ebooks && ebooks.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white py-16 text-center">
            <p className="text-lg font-medium">Nenhum ebook ainda</p>
            <Link to="/ebooks/novo" className="text-sm text-amber-700 underline underline-offset-2">
              Criar o primeiro
            </Link>
          </div>
        )}

        {ebooks && ebooks.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {ebooks.map((e) => {
              const isPreviewing = e.id === previewId;
              return (
                <div
                  key={e.id}
                  onClick={() => e.status === "ready" && setPreviewId(e.id)}
                  className={`flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm transition ${
                    e.status === "ready" ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
                  } ${isPreviewing ? "border-amber-600 ring-1 ring-amber-600/30" : "border-neutral-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold leading-snug">{e.title || e.theme}</h2>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[e.status]}`}>
                      {STATUS_LABEL[e.status]}
                      {e.status === "generating" && e.chapters_total > 0
                        ? ` ${e.chapters_done}/${e.chapters_total}`
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    Tema: <span className="text-neutral-800">{e.theme}</span> · {e.page_count} páginas
                  </p>
                  <Link
                    to={e.status === "generating" ? `/ebooks/${e.id}/gerando` : `/ebooks/${e.id}`}
                    onClick={(evt) => evt.stopPropagation()}
                    className="mt-auto rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm font-medium hover:bg-neutral-50"
                  >
                    {e.status === "generating" ? "Ver progresso" : "Abrir"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-20 space-y-3">
          {previewEbook && !previewLoading ? (
            <>
              <KindleFrame>
                <KindleReader ebook={previewEbook} />
              </KindleFrame>
              <Link
                to={`/ebooks/${previewEbook.id}/ler`}
                className="block text-center text-sm font-medium text-amber-700 hover:underline"
              >
                Ler em tela cheia →
              </Link>
            </>
          ) : (
            <KindleFrame>
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <span className="text-3xl">📖</span>
                <p className="text-xs text-neutral-400">
                  {previewLoading ? "Carregando…" : "Clique em um ebook pronto para pré-visualizar aqui."}
                </p>
              </div>
            </KindleFrame>
          )}
        </div>
      </div>
    </div>
  );
}
