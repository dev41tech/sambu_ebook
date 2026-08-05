import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type VisualTemplate, type PexelsPhoto } from "../lib/api";
import TemplatePicker from "../components/TemplatePicker";
import PexelsPicker from "../components/PexelsPicker";

const TONES = ["Motivador", "Técnico e direto", "Descontraído", "Formal"];

function suggestedImageCount(pages: number): number {
  if (pages <= 10) return 4;
  if (pages <= 20) return 8;
  if (pages <= 30) return 11;
  return 16;
}
const LANGUAGES = [
  "Português (Brasil)",
  "Português (Portugal)",
  "Inglês",
  "Espanhol",
];

export default function NewEbook() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<VisualTemplate[]>([]);
  const [theme, setTheme] = useState(() => searchParams.get("tema") ?? "");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [template, setTemplate] = useState("editorial");
  const [pageCount, setPageCount] = useState(20);
  const [titleMode, setTitleMode] = useState<"ai" | "manual">("ai");
  const [customTitle, setCustomTitle] = useState("");
  const [customSubtitle, setCustomSubtitle] = useState("");
  const [generateCover, setGenerateCover] = useState(false);
  const [coverSuggestion, setCoverSuggestion] = useState("");
  const [coverSource, setCoverSource] = useState<"ai" | "stock">("ai");
  const [selectedCoverPhoto, setSelectedCoverPhoto] = useState<PexelsPhoto | null>(null);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageCount, setImageCount] = useState(3);
  const [imageSuggestion, setImageSuggestion] = useState("");
  const [imageSource, setImageSource] = useState<"ai" | "stock">("ai");
  const [authorName, setAuthorName] = useState("");
  const [authorBio, setAuthorBio] = useState("");
  const [includeCopyright, setIncludeCopyright] = useState(false);
  const [includeAbout, setIncludeAbout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.templates().then((t) => {
      setTemplates(t);
      if (t.length > 0) setTemplate(t[0].id);
    });
  }, []);

  const valid =
    theme.trim().length > 0 &&
    audience.trim().length > 0 &&
    pageCount >= 10 &&
    pageCount <= 50 &&
    (titleMode === "ai" || customTitle.trim().length > 0) &&
    (!generateImages || (imageCount >= 1 && imageCount <= 39)) &&
    (!generateCover || coverSource === "ai" || !!selectedCoverPhoto);

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
        template,
        page_count: pageCount,
        author_name: authorName.trim(),
        author_bio: authorBio.trim(),
        include_copyright: includeCopyright,
        include_about: includeAbout,
        title_mode: titleMode,
        custom_title: customTitle.trim(),
        custom_subtitle: customSubtitle.trim(),
        generate_cover: generateCover,
        cover_suggestion: coverSuggestion.trim(),
        cover_source: coverSource,
        cover_stock_url: selectedCoverPhoto?.downloadUrl ?? "",
        cover_credit: selectedCoverPhoto ? `Foto de ${selectedCoverPhoto.photographer} (Pexels)` : "",
        cover_alt_text: selectedCoverPhoto?.alt ?? "",
        generate_images: generateImages,
        image_count: imageCount,
        image_suggestion: imageSuggestion.trim(),
        image_source: imageSource,
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Template visual</label>
          <TemplatePicker templates={templates} value={template} onChange={setTemplate} />
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
          <label className="text-sm font-medium text-neutral-700">Número de páginas</label>
          <input
            type="number"
            min={10}
            max={50}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={pageCount}
            onChange={(e) => setPageCount(Number(e.target.value))}
          />
          <p className="text-xs text-neutral-500">Mínimo 10, máximo 50 páginas.</p>
        </div>

        <div className="rounded-md border border-neutral-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:gap-6">
            <label className="flex items-start gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={generateCover}
                onChange={(e) => setGenerateCover(e.target.checked)}
              />
              Gerar capa?
            </label>
            {generateCover && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={coverSource === "ai"} onChange={() => setCoverSource("ai")} />
                    Gerar por IA
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={coverSource === "stock"} onChange={() => setCoverSource("stock")} />
                    Buscar foto (banco de imagens)
                  </label>
                </div>

                {coverSource === "ai" ? (
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
                      Descreva como a IA deve gerar o arquivo de imagem da capa. Gerada por IA (OpenAI) — consome sua
                      cota da API.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-neutral-700">Escolha uma foto</label>
                    <PexelsPicker
                      initialQuery={theme || "negócios"}
                      orientation="portrait"
                      selectedId={selectedCoverPhoto?.id ?? null}
                      onSelect={setSelectedCoverPhoto}
                    />
                    {!selectedCoverPhoto && (
                      <p className="text-xs text-amber-700">Selecione uma foto para continuar.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:gap-6">
            <label className="flex items-start gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={generateImages}
                onChange={(e) => {
                  setGenerateImages(e.target.checked);
                  if (e.target.checked) setImageCount(suggestedImageCount(pageCount));
                }}
              />
              Gerar imagens dentro do ebook?
            </label>
            {generateImages && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={imageSource === "ai"} onChange={() => setImageSource("ai")} />
                    Gerar por IA
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={imageSource === "stock"} onChange={() => setImageSource("stock")} />
                    Buscar fotos (banco de imagens) automaticamente
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-neutral-700">
                    {imageSource === "ai" ? "Sugestão para as imagens" : "Termo de busca (opcional)"}
                  </label>
                  <textarea
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    value={imageSuggestion}
                    onChange={(e) => setImageSuggestion(e.target.value)}
                    placeholder={
                      imageSource === "ai"
                        ? "Ex.: ilustrações minimalistas, profissionais, estilo clean, coerentes com o conteúdo"
                        : "Ex.: escritório, reunião de equipe — deixe em branco para buscar pelo título de cada capítulo"
                    }
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-neutral-500">
                    {imageSource === "ai"
                      ? "Descreva como a IA deve gerar os arquivos de imagem do e-book."
                      : "Uma foto é buscada automaticamente para cada capítulo — sem seleção manual."}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-neutral-700">Quantidade de imagens internas</label>
                  <input
                    type="number"
                    min={1}
                    max={39}
                    className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    value={imageCount}
                    onChange={(e) => setImageCount(Number(e.target.value))}
                  />
                  <p className="text-xs text-neutral-500">
                    Sugestão automática com base no tamanho do livro — ajuste como quiser (1 a 39). Distribuídas entre
                    os capítulos.{" "}
                    {imageSource === "ai"
                      ? "Geradas por IA (OpenAI) — consome sua cota da API, variando entre cena, conceito e composição."
                      : "Buscadas no banco de imagens (Pexels), uma por capítulo."}
                  </p>
                </div>
              </div>
            )}
          </div>
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
