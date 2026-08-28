import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type EbookDetail as EbookDetailType,
  type RegenerateImagePayload,
  type MarketingStrategy,
} from "../lib/api";
import ChangeImagePanel from "../components/ChangeImagePanel";
import MarketingCreativeCard from "../components/MarketingCreativeCard";
import { MarkdownBlock, splitBlocks } from "../lib/markdownBlock";

export default function EbookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ebook, setEbook] = useState<EbookDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [copiedSinopse, setCopiedSinopse] = useState(false);
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [marketing, setMarketing] = useState<MarketingStrategy | null>(null);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [editIntro, setEditIntro] = useState("");
  const [editConclusion, setEditConclusion] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [editChapters, setEditChapters] = useState<{ id: string; title: string; content: string }[]>([]);
  const [contentSaving, setContentSaving] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [layoutPreview, setLayoutPreview] = useState<{ pageCount: number; clippingIssues: number; overflowIssues: number } | null>(
    null
  );
  const [layoutPreviewBusy, setLayoutPreviewBusy] = useState(false);
  const [layoutPreviewError, setLayoutPreviewError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      const data = await api.getEbook(id);
      setEbook(data);
      if (data.status === "generating") navigate(`/ebooks/${id}/gerando`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar ebook.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!ebook) return;
    if (ebook.status === "review" || editMode) {
      setEditTitle(ebook.title || "");
      setEditSubtitle(ebook.subtitle || "");
      setEditVersion(ebook.version || "v1.0");
      setEditIntro(ebook.intro || "");
      setEditConclusion(ebook.conclusion || "");
      setEditAbout(ebook.about_author || "");
      setEditChapters(ebook.chapters.map((c) => ({ id: c.id, title: c.title, content: c.content })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebook?.id, ebook?.status, editMode]);

  useEffect(() => {
    if (ebook?.audio_status === "generating") {
      const t = window.setTimeout(load, 3000);
      return () => window.clearTimeout(t);
    }
  }, [ebook?.audio_status]);

  useEffect(() => {
    if (!id || ebook?.status !== "ready") return;
    api
      .getMarketingStrategy(id)
      .then(setMarketing)
      .catch(() => {
        // Ainda não foi gerada uma estratégia de marketing para este ebook — normal.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ebook?.status]);

  async function handleGenerateMarketing() {
    if (!id) return;
    setMarketingBusy(true);
    setMarketingError(null);
    try {
      const strategy = await api.generateMarketingStrategy(id);
      setMarketing(strategy);
    } catch (err) {
      setMarketingError(err instanceof Error ? err.message : "Erro ao gerar estratégia de marketing.");
    } finally {
      setMarketingBusy(false);
    }
  }

  async function handleGenerateAudiobook() {
    if (!id) return;
    setAudioBusy(true);
    try {
      await api.startAudiobook(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar audiobook.");
    } finally {
      setAudioBusy(false);
    }
  }

  async function handleRetry() {
    if (!id) return;
    try {
      await api.retryEbook(id);
      navigate(`/ebooks/${id}/gerando`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reiniciar a geração.");
    }
  }

  async function handleDelete() {
    if (!id || !ebook) return;
    if (!window.confirm(`Excluir "${ebook.title}"? Essa ação não pode ser desfeita.`)) return;
    await api.deleteEbook(id);
    navigate("/");
  }

  async function handleRegenerateCover(payload: RegenerateImagePayload) {
    if (!id) return;
    setCoverBusy(true);
    setCoverError(null);
    try {
      await api.regenerateCover(id, payload);
      setCoverPanelOpen(false);
      await load();
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Erro ao trocar a capa.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function handleRegenerateImage(imageId: string, payload: RegenerateImagePayload) {
    if (!id) return;
    setImageBusy(true);
    setImageError(null);
    try {
      await api.regenerateChapterImage(id, imageId, payload);
      setEditingImageId(null);
      await load();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Erro ao trocar a imagem.");
    } finally {
      setImageBusy(false);
    }
  }

  function currentEditPayload() {
    return {
      title: editTitle,
      subtitle: editSubtitle,
      version: editVersion,
      intro: editIntro,
      conclusion: editConclusion,
      about_author: editAbout,
      chapters: editChapters,
    };
  }

  async function handleSaveContent() {
    if (!id) return;
    setContentSaving(true);
    setContentError(null);
    try {
      await api.updateEbookContent(id, currentEditPayload());
      await load();
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    } finally {
      setContentSaving(false);
    }
  }

  async function handleGenerateLayoutPreview() {
    if (!id) return;
    setLayoutPreviewBusy(true);
    setLayoutPreviewError(null);
    try {
      // Salva o que estiver editado antes de gerar a prévia, senão ela mostraria
      // o conteúdo antigo salvo, não o que está na tela agora.
      if (showEditForm) await api.updateEbookContent(id, currentEditPayload());
      const result = await api.generateLayoutPreview(id);
      setLayoutPreview(result);
    } catch (err) {
      setLayoutPreviewError(err instanceof Error ? err.message : "Erro ao gerar a prévia de diagramação.");
    } finally {
      setLayoutPreviewBusy(false);
    }
  }

  async function handleFinalize() {
    if (!id) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await api.updateEbookContent(id, currentEditPayload());
      await api.finalizeEbook(id);
      setEditMode(false);
      await load();
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "Erro ao finalizar e exportar.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleSendFeedback() {
    if (!id || !feedback.trim()) return;
    setFeedbackBusy(true);
    setFeedbackError(null);
    try {
      await api.sendFeedback(id, feedback.trim());
      setFeedback("");
      setFeedbackSent(true);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Erro ao enviar sugestão.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!ebook) return <p className="text-sm text-neutral-500">Carregando…</p>;

  const showEditForm = ebook.status === "review" || editMode;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-5">
        {(ebook.status === "ready" || ebook.status === "review") && ebook.cover_path && (
          <img
            src={`/api/ebooks/${ebook.id}/cover`}
            alt="Capa do ebook"
            className="h-32 w-24 shrink-0 rounded-md border border-neutral-200 object-cover shadow-sm"
          />
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">{ebook.theme}</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{ebook.title || ebook.theme}</h1>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
              {ebook.version || "v1.0"}
            </span>
          </div>
          {ebook.subtitle && <p className="mt-1 text-neutral-600">{ebook.subtitle}</p>}
        </div>
      </div>

      {ebook.status === "review" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">O texto está pronto — revise antes de exportar.</p>
          <p className="mt-1">
            Edite o que quiser abaixo. O PDF, o DOCX e o EPUB só são gerados quando você clicar em "Finalizar e
            exportar".
          </p>
        </div>
      )}

      {ebook.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">A geração deste ebook falhou.</p>
          <p className="mt-1">{ebook.error_message || "Erro desconhecido."}</p>
          <button
            onClick={handleRetry}
            className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {ebook.status === "ready" && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <Link
          to={`/ebooks/${ebook.id}/ler`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          📖 Ler no Kindle
        </Link>
        <a
          href={`/api/ebooks/${ebook.id}/pdf`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Baixar PDF
        </a>
        <a
          href={`/api/ebooks/${ebook.id}/docx`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Baixar DOCX
        </a>
        <a
          href={`/api/ebooks/${ebook.id}/epub`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Baixar EPUB (Kindle)
        </a>

        {ebook.audio_status === "none" && (
          <button
            onClick={handleGenerateAudiobook}
            disabled={audioBusy}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            🎧 Gerar audiobook
          </button>
        )}
        {ebook.audio_status === "generating" && (
          <span className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-700 border-t-transparent" />
            Gerando audiobook…
          </span>
        )}
        {ebook.audio_status === "ready" && (
          <a
            href={`/api/ebooks/${ebook.id}/audiobook`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            🎧 Baixar audiobook
          </a>
        )}
        {ebook.audio_status === "error" && (
          <button
            onClick={handleGenerateAudiobook}
            className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            title={ebook.audio_error ?? undefined}
          >
            Falha no audiobook — tentar de novo
          </button>
        )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {ebook.status === "ready" && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
          >
            {editMode ? "Cancelar edição" : "Editar conteúdo"}
          </button>
        )}
        <button
          onClick={handleDelete}
          className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50 hover:text-red-600"
        >
          Excluir ebook
        </button>
      </div>

      {ebook.audio_error && ebook.audio_status === "error" && (
        <p className="text-sm text-red-600">{ebook.audio_error}</p>
      )}

      {(ebook.status === "ready" || ebook.status === "review") && (
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Imagens</h2>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">Capa</p>
            <div className="flex items-start gap-4">
              {ebook.cover_path ? (
                <img
                  src={`/api/ebooks/${ebook.id}/cover`}
                  alt="Capa do ebook"
                  className="h-40 w-28 shrink-0 rounded-md border border-neutral-200 object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-40 w-28 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400">
                  Sem capa
                </div>
              )}
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setCoverPanelOpen((v) => !v);
                    setCoverError(null);
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
                >
                  {coverPanelOpen ? "Fechar" : "Trocar capa"}
                </button>
                {coverPanelOpen && (
                  <ChangeImagePanel
                    orientation="portrait"
                    defaultQuery={ebook.theme}
                    busy={coverBusy}
                    error={coverError}
                    onSubmit={handleRegenerateCover}
                    onCancel={() => setCoverPanelOpen(false)}
                    allowLocal
                  />
                )}
              </div>
            </div>
          </div>

          {ebook.chapter_images.length > 0 && (
            <div className="space-y-5">
              <p className="text-sm font-medium text-neutral-700">Imagens internas</p>
              {ebook.chapters.map((c) => {
                const images = ebook.chapter_images.filter((img) => img.chapter_id === c.id);
                if (images.length === 0) return null;
                return (
                  <div key={c.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Capítulo {c.idx + 1}: {c.title}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {images.map((img) => (
                        <div key={img.id} className="w-36">
                          <img
                            src={`/api/ebooks/${ebook.id}/chapter-image/${img.id}`}
                            alt={img.alt_text}
                            className="h-24 w-36 rounded-md border border-neutral-200 object-cover shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditingImageId((v) => (v === img.id ? null : img.id));
                              setImageError(null);
                            }}
                            className="mt-1.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                          >
                            {editingImageId === img.id ? "Fechar" : "Trocar"}
                          </button>
                        </div>
                      ))}
                    </div>
                    {images.some((img) => img.id === editingImageId) && (
                      <ChangeImagePanel
                        orientation="landscape"
                        defaultQuery={c.title}
                        busy={imageBusy}
                        error={imageError}
                        onSubmit={(payload) => handleRegenerateImage(editingImageId!, payload)}
                        onCancel={() => setEditingImageId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {ebook.status === "ready" && (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Marketing</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Estratégia de venda (público, dores, desejos) e 4 criativos prontos para divulgar o ebook: capa
                alternativa, post, story e banner.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateMarketing}
              disabled={marketingBusy}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {marketingBusy ? "Gerando…" : marketing ? "Gerar de novo" : "Gerar estratégia de marketing"}
            </button>
          </div>

          {marketingError && <p className="text-sm text-red-600">{marketingError}</p>}

          {marketing && (
            <>
              <div className="grid gap-3 rounded-md bg-neutral-50 p-4 text-sm text-neutral-700 sm:grid-cols-2">
                <p>
                  <span className="font-medium text-neutral-900">Público principal:</span> {marketing.publico_principal}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">Público secundário:</span>{" "}
                  {marketing.publico_secundario}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium text-neutral-900">Ângulo principal:</span> {marketing.angulo_principal}
                </p>
              </div>

              {marketing.sinopse && (
                <div className="rounded-md border border-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">Sinopse</h3>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        É o texto que o leitor vê na Vitrine, antes de abrir o livro.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(marketing.sinopse);
                        setCopiedSinopse(true);
                        window.setTimeout(() => setCopiedSinopse(false), 2000);
                      }}
                      className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                    >
                      {copiedSinopse ? "Copiada" : "Copiar"}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
                    {splitBlocks(marketing.sinopse).map((block, i) => (
                      <p key={i}>{block}</p>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    {marketing.sinopse.length} caracteres
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {marketing.criativos.map((creative) => (
                  <MarketingCreativeCard key={creative.id} ebookId={ebook.id} creative={creative} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showEditForm && (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Diagramação</h2>
              <p className="text-sm text-neutral-500">
                Gera uma imagem de cada página do jeito que ela vai sair no PDF, pra você conferir a diagramação
                antes de exportar.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateLayoutPreview}
              disabled={layoutPreviewBusy}
              className="shrink-0 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {layoutPreviewBusy ? "Gerando…" : "Verificar diagramação"}
            </button>
          </div>

          {layoutPreviewError && <p className="text-sm text-red-600">{layoutPreviewError}</p>}

          {layoutPreview && (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-neutral-600">{layoutPreview.pageCount} páginas</span>
                <span className={layoutPreview.clippingIssues === 0 ? "text-emerald-700" : "text-red-600"}>
                  {layoutPreview.clippingIssues === 0 ? "✓" : "✗"} {layoutPreview.clippingIssues} corte(s) de texto
                </span>
                <span className={layoutPreview.overflowIssues === 0 ? "text-emerald-700" : "text-red-600"}>
                  {layoutPreview.overflowIssues === 0 ? "✓" : "✗"} {layoutPreview.overflowIssues} estouro(s) de
                  margem
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: layoutPreview.pageCount }, (_, i) => (
                  <img
                    key={i}
                    src={`/api/ebooks/${ebook.id}/layout-preview/${i}?t=${Date.now()}`}
                    alt={`Página ${i + 1}`}
                    className="h-64 w-auto shrink-0 rounded-md border border-neutral-200 shadow-sm"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showEditForm ? (
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Editar conteúdo</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Título</label>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Subtítulo</label>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={editSubtitle}
                onChange={(e) => setEditSubtitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Versão</label>
              <input
                className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                placeholder="v1.0"
              />
              <p className="text-xs text-neutral-500">
                Suba manualmente (ex.: v1.1) quando fizer correções depois do lançamento.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Introdução</label>
            <textarea
              className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
              rows={8}
              value={editIntro}
              onChange={(e) => setEditIntro(e.target.value)}
            />
          </div>

          {editChapters.map((c, i) => (
            <div key={c.id} className="space-y-1.5 border-t border-neutral-100 pt-5 first:border-t-0 first:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Capítulo {i + 1}</p>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium"
                value={c.title}
                onChange={(e) =>
                  setEditChapters((prev) => prev.map((ch, idx) => (idx === i ? { ...ch, title: e.target.value } : ch)))
                }
              />
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
                rows={12}
                value={c.content}
                onChange={(e) =>
                  setEditChapters((prev) => prev.map((ch, idx) => (idx === i ? { ...ch, content: e.target.value } : ch)))
                }
              />
            </div>
          ))}

          <div className="space-y-1.5 border-t border-neutral-100 pt-5">
            <label className="text-sm font-medium text-neutral-700">Conclusão</label>
            <textarea
              className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
              rows={6}
              value={editConclusion}
              onChange={(e) => setEditConclusion(e.target.value)}
            />
          </div>

          {ebook.about_author && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Sobre o Autor</label>
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
                rows={4}
                value={editAbout}
                onChange={(e) => setEditAbout(e.target.value)}
              />
            </div>
          )}

          {contentError && <p className="text-sm text-red-600">{contentError}</p>}
          {finalizeError && <p className="text-sm text-red-600">{finalizeError}</p>}

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-5">
            <button
              type="button"
              onClick={handleSaveContent}
              disabled={contentSaving || finalizing}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {contentSaving ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              disabled={contentSaving || finalizing}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {finalizing ? "Exportando…" : ebook.status === "review" ? "Finalizar e exportar" : "Salvar e reexportar"}
            </button>
            {ebook.status === "ready" && (
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8 rounded-xl border border-neutral-200 bg-white p-6">
          {ebook.intro && (
            <section>
              <h2 className="text-lg font-semibold">Introdução</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
                {splitBlocks(ebook.intro).map((block, i) => (
                  <MarkdownBlock key={i} block={block} />
                ))}
              </div>
            </section>
          )}

          {ebook.chapters.map((c) => (
            <section key={c.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Capítulo {c.idx + 1}</p>
              <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
                {splitBlocks(c.content).map((block, i) => (
                  <MarkdownBlock key={i} block={block} />
                ))}
              </div>
            </section>
          ))}

          {ebook.conclusion && (
            <section>
              <h2 className="text-lg font-semibold">Conclusão</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
                {splitBlocks(ebook.conclusion).map((block, i) => (
                  <MarkdownBlock key={i} block={block} />
                ))}
              </div>
            </section>
          )}

          {ebook.about_author && (
            <section>
              <h2 className="text-lg font-semibold">Sobre o Autor</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
                {splitBlocks(ebook.about_author).map((block, i) => (
                  <MarkdownBlock key={i} block={block} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {ebook.status === "ready" && (
        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-800">Sugestão para os próximos ebooks</h2>
          <p className="text-xs text-neutral-500">
            O que podemos melhorar? Sua sugestão fica guardada na memória do Sambu Ebooks e é usada para orientar a
            geração dos próximos ebooks.
          </p>
          {feedbackSent ? (
            <p className="text-sm text-emerald-700">Aprendizado registrado — obrigado! Isso vai ajudar nos próximos ebooks.</p>
          ) : (
            <>
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex.: os parágrafos ficaram longos demais, capriche mais em exemplos concretos…"
                rows={2}
                maxLength={1000}
              />
              {feedbackError && <p className="text-sm text-red-600">{feedbackError}</p>}
              <button
                type="button"
                onClick={handleSendFeedback}
                disabled={feedbackBusy || !feedback.trim()}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {feedbackBusy ? "Enviando…" : "Enviar sugestão"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
