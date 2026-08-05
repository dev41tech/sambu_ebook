import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type EbookDetail as EbookDetailType } from "../lib/api";

export default function EbookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ebook, setEbook] = useState<EbookDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);

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
    if (ebook?.audio_status === "generating") {
      const t = window.setTimeout(load, 3000);
      return () => window.clearTimeout(t);
    }
  }, [ebook?.audio_status]);

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!ebook) return <p className="text-sm text-neutral-500">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-5">
        {ebook.status === "ready" && ebook.cover_path && (
          <img
            src={`/api/ebooks/${ebook.id}/cover`}
            alt="Capa do ebook"
            className="h-32 w-24 shrink-0 rounded-md border border-neutral-200 object-cover shadow-sm"
          />
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">{ebook.theme}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ebook.title || ebook.theme}</h1>
          {ebook.subtitle && <p className="mt-1 text-neutral-600">{ebook.subtitle}</p>}
        </div>
      </div>

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

      <div className="flex justify-end">
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

      <div className="space-y-8 rounded-xl border border-neutral-200 bg-white p-6">
        {ebook.intro && (
          <section>
            <h2 className="text-lg font-semibold">Introdução</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
              {ebook.intro.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}

        {ebook.chapters.map((c) => (
          <section key={c.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Capítulo {c.idx + 1}</p>
            <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
              {c.content.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ))}

        {ebook.conclusion && (
          <section>
            <h2 className="text-lg font-semibold">Conclusão</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
              {ebook.conclusion.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}

        {ebook.about_author && (
          <section>
            <h2 className="text-lg font-semibold">Sobre o Autor</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-700">
              {ebook.about_author.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
