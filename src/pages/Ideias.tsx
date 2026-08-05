import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type NicheIdea } from "../lib/api";

export default function Ideias() {
  const [ideias, setIdeias] = useState<NicheIdea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("Todas");

  useEffect(() => {
    api
      .listIdeias()
      .then(setIdeias)
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar ideias."));
  }, []);

  const categories = useMemo(() => {
    if (!ideias) return [];
    const set = new Set(ideias.map((i) => i.category));
    return Array.from(set);
  }, [ideias]);

  const filtered = useMemo(() => {
    if (!ideias) return [];
    return category === "Todas" ? ideias : ideias.filter((i) => i.category === category);
  }, [ideias, category]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Inspiração</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Ideias de <span className="italic text-amber-700">nichos</span>
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          {ideias ? `${ideias.length} temas` : "Carregando"} organizados por categoria. Escolha um e já começa com
          o tema preenchido.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {ideias && (
        <div className="flex flex-wrap gap-2">
          {["Todas", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                c === category
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((idea) => (
          <article
            key={idea.id}
            className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-wide text-amber-700">
              {idea.category}
            </p>
            <h2 className="mt-3 text-base font-semibold leading-snug">{idea.name}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{idea.description}</p>
            <Link
              to={`/ebooks/novo?tema=${encodeURIComponent(idea.name)}`}
              className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm font-medium hover:bg-neutral-50"
            >
              Criar ebook sobre este tema →
            </Link>
          </article>
        ))}
      </div>

      {ideias && filtered.length === 0 && (
        <p className="text-sm text-neutral-500">Nenhum tema nesta categoria.</p>
      )}
    </div>
  );
}
