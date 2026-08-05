import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type EbookDetail } from "../lib/api";

const STEP_LABEL: Record<string, string> = {
  outline: "Planejando a estrutura do seu ebook…",
  cover: "Gerando a arte da capa…",
  intro: "Escrevendo a introdução…",
  chapter: "Escrevendo o próximo capítulo…",
  images: "Gerando as imagens internas…",
  conclusion: "Amarrando a conclusão…",
  about: "Escrevendo a seção Sobre o Autor…",
  export: "Montando o PDF e o DOCX finais…",
};

export default function Generating() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ebook, setEbook] = useState<EbookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  function startPolling() {
    async function tick() {
      if (!id) return;
      try {
        const data = await api.getEbook(id);
        if (cancelledRef.current) return;
        setEbook(data);
        if (data.status === "ready") {
          navigate(`/ebooks/${id}`);
          return;
        }
        if (data.status === "error") {
          setError(data.error_message || "A geração falhou.");
          return;
        }
        pollRef.current = window.setTimeout(tick, 2500);
      } catch (err) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : "Erro ao consultar progresso.");
      }
    }
    tick();
  }

  useEffect(() => {
    if (!id) return;
    cancelledRef.current = false;
    startPolling();
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRetry() {
    if (!id) return;
    setRetrying(true);
    try {
      await api.retryEbook(id);
      setError(null);
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reiniciar a geração.");
    } finally {
      setRetrying(false);
    }
  }

  const chaptersTotal = ebook?.chapters_total ?? 0;
  const chaptersDone = ebook?.chapters_done ?? 0;
  const hasCover = !!ebook?.generate_cover;
  const hasImages = !!ebook?.generate_images;
  const stepsBeforeChapters = 2 + (hasCover ? 1 : 0); // outline + intro (+ capa)
  const stepsAfterChapters = 2 + (hasImages ? 1 : 0); // conclusion + export (+ imagens)
  const totalSteps = stepsBeforeChapters + Math.max(chaptersTotal, 1) + stepsAfterChapters;
  const imagesFraction = hasImages && ebook && ebook.image_count > 0 ? ebook.images_done / ebook.image_count : 0;
  const doneSteps =
    (chaptersTotal > 0 ? 1 : 0) +
    (hasCover ? (ebook?.cover_path ? 1 : 0) : 0) +
    (ebook?.intro ? 1 : 0) +
    chaptersDone +
    imagesFraction +
    (ebook?.conclusion ? 1 : 0);
  const percent = Math.min(100, Math.round((doneSteps / totalSteps) * 100));

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Em produção</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Escrevendo seu <span className="italic text-amber-700">ebook</span>
      </h1>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {error ? (
          <div className="space-y-3">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {retrying ? "Reiniciando…" : "Tentar novamente"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
              <p className="text-sm font-medium text-neutral-800">
                {STEP_LABEL[ebook?.current_step ?? ""] || "Preparando tudo…"}
              </p>
            </div>
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-amber-700 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
                <span>{chaptersTotal > 0 ? `Capítulos: ${chaptersDone}/${chaptersTotal}` : "Preparando…"}</span>
                <span>{percent}%</span>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              A geração completa leva alguns minutos, dependendo do tamanho do ebook. Você pode fechar esta aba — o
              progresso fica salvo e retoma automaticamente ao voltar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
