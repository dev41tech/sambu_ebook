import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type PexelsPhoto } from "../lib/api";
import PexelsPicker from "../components/PexelsPicker";
import LocalCoverPicker from "../components/LocalCoverPicker";
import ImportIcon from "../components/ImportIcon";

const TONES = ["Motivador", "Técnico e direto", "Descontraído", "Formal"];

const LANGUAGES = [
  "Português (Brasil)",
  "Português (Portugal)",
  "Inglês",
  "Espanhol",
];

export default function NewEbook() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [theme, setTheme] = useState(() => searchParams.get("tema") ?? "");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [pageCount, setPageCount] = useState(20);
  const [wordsPerPage, setWordsPerPage] = useState(250);
  const [titleMode, setTitleMode] = useState<"ai" | "manual">("ai");
  const [customTitle, setCustomTitle] = useState("");
  const [customSubtitle, setCustomSubtitle] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [generateCover, setGenerateCover] = useState(false);
  const [coverSuggestion, setCoverSuggestion] = useState("");
  const [coverSource, setCoverSource] = useState<"ai" | "stock" | "local">("ai");
  const [selectedCoverPhoto, setSelectedCoverPhoto] = useState<PexelsPhoto | null>(null);
  const [selectedLocalCover, setSelectedLocalCover] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [authorBio, setAuthorBio] = useState("");
  const [includeCopyright, setIncludeCopyright] = useState(false);
  const [includeAbout, setIncludeAbout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    theme.trim().length > 0 &&
    audience.trim().length > 0 &&
    pageCount >= 10 &&
    pageCount <= 50 &&
    wordsPerPage >= 150 &&
    wordsPerPage <= 500 &&
    (titleMode === "ai" || customTitle.trim().length > 0) &&
    (!generateCover ||
      coverSource === "ai" ||
      (coverSource === "stock" && !!selectedCoverPhoto) ||
      (coverSource === "local" && !!selectedLocalCover));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await api.createEbook({
        theme: theme.trim(),
        audience: audience.trim(),
        tone,
        language,
        page_count: pageCount,
        words_per_page: wordsPerPage,
        author_name: authorName.trim(),
        author_bio: authorBio.trim(),
        include_copyright: includeCopyright,
        include_about: includeAbout,
        title_mode: titleMode,
        custom_title: customTitle.trim(),
        custom_subtitle: customSubtitle.trim(),
        extra_instructions: extraInstructions.trim(),
        generate_cover: generateCover,
        cover_suggestion: coverSuggestion.trim(),
        cover_source: coverSource,
        cover_stock_url: selectedCoverPhoto?.downloadUrl ?? "",
        cover_credit: selectedCoverPhoto ? `Foto de ${selectedCoverPhoto.photographer} (Pexels)` : "",
        cover_alt_text: selectedCoverPhoto?.alt ?? "",
        cover_local_file: selectedLocalCover ?? "",
      });
      navigate(`/ebooks/${id}/gerando`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar geração.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Nova criação</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Criar novo <span className="italic text-amber-700">ebook</span>
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Tema / Nicho</label>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="ex: emagrecimento"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Público-alvo</label>
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="ex: mulheres depois dos 40 anos"
            rows={2}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Tom de voz</label>
            <select
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Idioma</label>
            <select
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-neutral-200 p-4">
          <p className="text-sm font-medium text-neutral-700">Título do ebook</p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={titleMode === "ai"} onChange={() => setTitleMode("ai")} />
              Deixar a IA gerar
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={titleMode === "manual"} onChange={() => setTitleMode("manual")} />
              Escrever meu próprio título
            </label>
          </div>
          {titleMode === "manual" && (
            <div className="space-y-3">
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Título"
                maxLength={120}
              />
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={customSubtitle}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                placeholder="Subtítulo (opcional)"
                maxLength={160}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Instrução extra para este ebook (opcional)</label>
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            placeholder="Ex.: dê ênfase à parte prática, use exemplos brasileiros, evite um tom acadêmico…"
            rows={2}
            maxLength={1000}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Número de páginas</label>
            <input
              type="number"
              min={1}
              max={1000}
              className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              value={pageCount}
              onChange={(e) => setPageCount(Number(e.target.value))}
            />
            <p className="text-xs text-neutral-500">Mínimo 1, máximo 1000 páginas.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Palavras por página</label>
            <input
              type="number"
              min={150}
              max={500}
              step={10}
              className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              value={wordsPerPage}
              onChange={(e) => setWordsPerPage(Number(e.target.value))}
            />
            <p className="text-xs text-neutral-500">Mínimo 150, máximo 500 palavras.</p>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-neutral-200 p-4">
          <p className="text-sm font-medium text-neutral-700">Capa do ebook</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => setGenerateCover(false)}
              className={`rounded-full px-3 py-1.5 ${!generateCover ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
            >
              Sem capa
            </button>
            <button
              type="button"
              onClick={() => {
                setGenerateCover(true);
                setCoverSource("local");
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${generateCover && coverSource === "local" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
            >
              <ImportIcon /> Importar capa
            </button>
            <button
              type="button"
              onClick={() => {
                setGenerateCover(true);
                setCoverSource("ai");
              }}
              className={`rounded-full px-3 py-1.5 ${generateCover && coverSource === "ai" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
            >
              Gerar por IA
            </button>
            <button
              type="button"
              onClick={() => {
                setGenerateCover(true);
                setCoverSource("stock");
              }}
              className={`rounded-full px-3 py-1.5 ${generateCover && coverSource === "stock" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"}`}
            >
              Banco de imagens
            </button>
          </div>

          {generateCover && coverSource === "local" && (
            <LocalCoverPicker selected={selectedLocalCover} onSelect={setSelectedLocalCover} />
          )}
          {generateCover && coverSource === "ai" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Sugestão para a capa</label>
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={coverSuggestion}
                onChange={(e) => setCoverSuggestion(e.target.value)}
                placeholder="Ex.: capa moderna, profissional, tons azul e branco, título em destaque"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-neutral-500">
                Descreva como a IA deve gerar o arquivo de imagem da capa. Gerada por IA (OpenAI) — consome sua cota
                da API.
              </p>
            </div>
          )}
          {generateCover && coverSource === "stock" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">Escolha uma foto</label>
              <PexelsPicker
                initialQuery={theme || "negócios"}
                orientation="portrait"
                selectedId={selectedCoverPhoto?.id ?? null}
                onSelect={setSelectedCoverPhoto}
              />
              {!selectedCoverPhoto && <p className="text-xs text-amber-700">Selecione uma foto para continuar.</p>}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-neutral-200 p-4">
          <p className="text-sm font-medium text-neutral-700">Autor (opcional)</p>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Nome do autor ou empresa"
          />
          {authorName.trim().length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeCopyright} onChange={(e) => setIncludeCopyright(e.target.checked)} />
                Incluir página de copyright
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeAbout} onChange={(e) => setIncludeAbout(e.target.checked)} />
                Incluir seção "Sobre o Autor"
              </label>
              {includeAbout && (
                <textarea
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  value={authorBio}
                  onChange={(e) => setAuthorBio(e.target.value)}
                  placeholder="Uma frase ou parágrafo sobre você (opcional)"
                  rows={2}
                />
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!valid || submitting}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Iniciando…" : "Gerar Ebook com IA"}
        </button>
      </form>
    </div>
  );
}
