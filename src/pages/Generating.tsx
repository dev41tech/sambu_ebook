import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type EbookDetail } from "../lib/api";

const STEP_LABEL: Record<string, string> = {
  research: "Pesquisando na internet…",
  outline: "Planejando a estrutura do seu ebook…",
  cover: "Gerando a arte da capa…",
  intro: "Escrevendo a introdução…",
  chapter: "Escrevendo o próximo capítulo…",
  images: "Gerando as imagens internas…",
  conclusion: "Amarrando a conclusão…",
  about: "Escrevendo a seção Sobre o Autor…",
};

type ChecklistStatus = "done" | "current" | "pending";
interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStatus;
}

function buildChecklist(ebook: EbookDetail | null): ChecklistItem[] {
  if (!ebook) return [{ key: "outline", label: "Planejando a estrutura", status: "current" }];
  const step = ebook.current_step ?? "";
  const items: ChecklistItem[] = [];

  const outlineDone = ebook.chapters_total > 0;
  items.push({ key: "outline", label: "Estrutura do ebook", status: outlineDone ? "done" : "current" });

  if (ebook.generate_cover) {
    items.push({
      key: "cover",
      label: "Capa",
      status: ebook.cover_path ? "done" : step === "cover" ? "current" : "pending",
    });
  }

  items.push({
    key: "intro",
    label: "Introdução",
    status: ebook.intro ? "done" : step === "intro" ? "current" : "pending",
  });

  const chaptersDone = ebook.chapters_done;
  for (let i = 0; i < ebook.chapters_total; i++) {
    const chapter = ebook.chapters[i];
    const title = chapter?.title || `Capítulo ${i + 1}`;
    const isDone = !!chapter?.content && chapter.content.trim().length > 0;
    const isCurrent = !isDone && step === "chapter" && chaptersDone === i;
    items.push({
      key: `chapter-${i}`,
      label: `Capítulo ${i + 1}: ${title}`,
      status: isDone ? "done" : isCurrent ? "current" : "pending",
    });
  }

  if (ebook.generate_images) {
    items.push({
      key: "images",
      label: "Imagens internas",
      status: ebook.images_done >= ebook.image_count ? "done" : step === "images" ? "current" : "pending",
    });
  }

  items.push({
    key: "conclusion",
    label: "Conclusão",
    status: ebook.conclusion ? "done" : step === "conclusion" ? "current" : "pending",
  });

  if (ebook.include_about && ebook.author_name) {
    items.push({
      key: "about",
      label: "Sobre o Autor",
      status: ebook.about_author ? "done" : step === "about" ? "current" : "pending",
    });
  }

  return items;
}

function StatusIcon({ status }: { status: ChecklistStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[0.65rem] text-white">
        ✓
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-amber-700">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-neutral-300" />;
}

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
        if (data.status === "review" || data.status === "ready") {
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
  const hasAbout = !!(ebook?.include_about && ebook?.author_name);
  const stepsBeforeChapters = 2 + (hasCover ? 1 : 0); // outline + intro (+ capa)
  const stepsAfterChapters = 1 + (hasImages ? 1 : 0) + (hasAbout ? 1 : 0); // conclusão (+ imagens + sobre o autor)
  const totalSteps = stepsBeforeChapters + Math.max(chaptersTotal, 1) + stepsAfterChapters;
  const imagesFraction = hasImages && ebook && ebook.image_count > 0 ? ebook.images_done / ebook.image_count : 0;
  const doneSteps =
    (chaptersTotal > 0 ? 1 : 0) +
    (hasCover ? (ebook?.cover_path ? 1 : 0) : 0) +
    (ebook?.intro ? 1 : 0) +
    chaptersDone +
    imagesFraction +
    (ebook?.conclusion ? 1 : 0) +
    (hasAbout ? (ebook?.about_author ? 1 : 0) : 0);
  const percent = Math.min(100, Math.round((doneSteps / totalSteps) * 100));

  const checklist = buildChecklist(ebook);

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
            <ul className="space-y-2.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-3">
                  <StatusIcon status={item.status} />
                  <span
                    className={`text-sm ${
                      item.status === "current"
                        ? "font-medium text-neutral-900"
                        : item.status === "done"
                          ? "text-neutral-600"
                          : "text-neutral-400"
                    }`}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-neutral-100 pt-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
                <p className="text-sm font-medium text-neutral-800">
                  {STEP_LABEL[ebook?.current_step ?? ""] || "Preparando tudo…"}
                </p>
              </div>
              <div className="mt-3">
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
