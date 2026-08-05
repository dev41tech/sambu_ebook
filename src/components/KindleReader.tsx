import { useEffect, useMemo, useState } from "react";
import type { EbookDetail } from "../lib/api";
import { buildKindlePages } from "../lib/kindlePaginate";

export default function KindleReader({ ebook }: { ebook: EbookDetail }) {
  const pages = useMemo(() => buildKindlePages(ebook), [ebook]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [ebook.id]);

  const goNext = () => setPageIndex((i) => Math.min(pages.length - 1, i + 1));
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  const page = pages[pageIndex];
  const percent = pages.length > 0 ? Math.round(((pageIndex + 1) / pages.length) * 100) : 0;

  if (!page) {
    return <div className="flex flex-1 items-center justify-center text-xs text-neutral-400">Sem conteúdo.</div>;
  }

  return (
    <>
      <div className="flex-1 overflow-hidden">
        {page.type === "cover" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <img
              src={`/api/ebooks/${ebook.id}/cover`}
              alt=""
              className="max-h-[70%] rounded-sm object-contain shadow-sm grayscale"
            />
            <p className="font-serif text-sm font-semibold leading-snug text-neutral-800">{ebook.title}</p>
          </div>
        ) : (
          <>
            {page.isFirstPageOfSection && (
              <>
                {page.sectionLabel && (
                  <p className="mb-1.5 text-center text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    {page.sectionLabel}
                  </p>
                )}
                <h2 className="mb-4 text-center font-serif text-lg font-bold leading-snug text-neutral-900">
                  {page.sectionTitle}
                </h2>
              </>
            )}
            <div className="space-y-2.5 font-serif text-[0.72rem] leading-relaxed text-neutral-800">
              {page.paragraphs && page.paragraphs.length > 0 ? (
                page.paragraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className="text-center italic text-neutral-400">(sem conteúdo)</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 shrink-0 border-t border-neutral-300 pt-2">
        <div className="flex items-center justify-between text-[0.6rem] text-neutral-500">
          <span>
            Página {pageIndex + 1} de {pages.length}
          </span>
          <span>{percent}%</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-300">
          <div className="h-full rounded-full bg-neutral-700 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2.5 flex justify-between text-xs">
          <button
            type="button"
            onClick={goPrev}
            disabled={pageIndex === 0}
            className="rounded px-2 py-1 font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-30"
          >
            ‹ Anterior
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={pageIndex === pages.length - 1}
            className="rounded px-2 py-1 font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-30"
          >
            Próxima ›
          </button>
        </div>
      </div>
    </>
  );
}
