import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type PexelsPhoto } from "../lib/api";
import PexelsPicker from "../components/PexelsPicker";
import LocalCoverPicker from "../components/LocalCoverPicker";
import ImportIcon from "../components/ImportIcon";

const LANGUAGES = ["Português (Brasil)", "Português (Portugal)", "Inglês", "Espanhol"];

export default function ImportEbook() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [authorName, setAuthorName] = useState("");
  const [authorBio, setAuthorBio] = useState("");
  const [includeCopyright, setIncludeCopyright] = useState(false);
  const [includeAbout, setIncludeAbout] = useState(false);
  const [generateCover, setGenerateCover] = useState(false);
  const [coverSuggestion, setCoverSuggestion] = useState("");
  const [coverSource, setCoverSource] = useState<"ai" | "stock" | "local">("ai");
  const [selectedCoverPhoto, setSelectedCoverPhoto] = useState<PexelsPhoto | null>(null);
  const [selectedLocalCover, setSelectedLocalCover] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    !!file &&
    (!generateCover ||
      coverSource === "ai" ||
      (coverSource === "stock" && !!selectedCoverPhoto) ||
      (coverSource === "local" && !!selectedLocalCover));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      form.append("theme", theme.trim());
      form.append("audience", audience.trim());
      form.append("language", language);
      form.append("author_name", authorName.trim());
      form.append("author_bio", authorBio.trim());
      form.append("include_copyright", includeCopyright ? "1" : "");
      form.append("include_about", includeAbout ? "1" : "");
      form.append("generate_cover", generateCover ? "1" : "");
      form.append("cover_suggestion", coverSuggestion.trim());
      form.append("cover_source", coverSource);
      form.append("cover_stock_url", selectedCoverPhoto?.downloadUrl ?? "");
      form.append("cover_credit", selectedCoverPhoto ? `Foto de ${selectedCoverPhoto.photographer} (Pexels)` : "");
      form.append("cover_alt_text", selectedCoverPhoto?.alt ?? "");
      form.append("cover_local_file", selectedLocalCover ?? "");
      const { id } = await api.importEbook(form);
      navigate(`/ebooks/${id}/gerando`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar o arquivo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Nova criação</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Importar ebook de um <span className="italic text-amber-700">arquivo</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Envie um arquivo com o texto já escrito. A IA não é usada para escrever — só para os extras opcionais
        abaixo (capa, imagens, seção "Sobre o autor"). Depois você revisa tudo antes de exportar.
      </p>
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p>
          <strong>Importante:</strong> use esta tela só para um manuscrito já pronto (capítulos com o texto final).
          Se o que você tem é um roteiro, brief ou especificação do que o livro deve conter, essa página vai importar
          esse roteiro como se fosse o texto final — em vez disso, use{" "}
          <span className="font-medium">"Criar novo"</span> e cole o roteiro no campo de material de referência,
          para a IA escrever o livro a partir dele.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Arquivo do ebook</label>
          <input
            type="file"
            accept=".txt,.md,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
            required
          />
          <p className="text-xs text-neutral-500">
            Aceita .txt, .md ou .pdf (.docx ainda não é suportado). Se o arquivo tiver títulos de capítulo (ex.:
            "# Capítulo 1" ou "Capítulo 1"), eles são reconhecidos automaticamente; senão, o texto inteiro vira um
            único capítulo para você dividir na revisão.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Título do ebook</label>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Se deixar em branco, tentamos detectar no arquivo — recomendado preencher"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Tema / Nicho (opcional)</label>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Usado só para orientar a capa/imagens geradas por IA; se vazio, usamos o título"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Público-alvo (opcional)</label>
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <p className="text-sm font-medium text-neutral-700">Autor (opcional)</p>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Nome do autor"
          />
          {authorName.trim() && (
            <>
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={authorBio}
                onChange={(e) => setAuthorBio(e.target.value)}
                placeholder="Breve biografia do autor (a IA usa isso para escrever a seção 'Sobre o autor', se marcada abaixo)"
                rows={2}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeCopyright} onChange={(e) => setIncludeCopyright(e.target.checked)} />
                Incluir página de copyright
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeAbout} onChange={(e) => setIncludeAbout(e.target.checked)} />
                Gerar seção "Sobre o autor" por IA
              </label>
            </>
          )}
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
              <p className="text-xs text-neutral-500">Gerada por IA (OpenAI) — consome sua cota da API.</p>
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!valid || submitting}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Importando…" : "Importar e continuar"}
        </button>
      </form>
    </div>
  );
}
