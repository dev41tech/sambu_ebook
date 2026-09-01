import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { regerarEbook, type EbookDetail } from "../lib/api";
import ClassificacaoPicker from "./ClassificacaoPicker";
import CustoEstimado from "./CustoEstimado";

const TONS = ["Motivador", "Técnico e direto", "Descontraído", "Formal"];
const IDIOMAS = ["Português (Brasil)", "Português (Portugal)", "Inglês", "Espanhol"];

function lerSecundarias(bruto: string): string[] {
  try {
    const v = JSON.parse(bruto || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * As instrucoes que originaram o ebook, abertas para edicao. Ficam na area de
 * diagramacao porque e onde o usuario percebe que algo saiu errado -- ate entao o
 * unico caminho para mudar o briefing era criar um ebook novo do zero.
 */
export default function BriefingEbook({ ebook }: { ebook: EbookDetail }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(ebook.theme);
  const [secundarias, setSecundarias] = useState<string[]>(() => lerSecundarias(ebook.categories_secondary));
  const [audience, setAudience] = useState(ebook.audience);
  const [tone, setTone] = useState(ebook.tone);
  const [language, setLanguage] = useState(ebook.language);
  const [pageCount, setPageCount] = useState(ebook.page_count);
  const [wordsPerPage, setWordsPerPage] = useState(ebook.words_per_page);
  const [extra, setExtra] = useState(ebook.extra_instructions ?? "");

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido =
    theme.trim().length > 0 &&
    audience.trim().length > 0 &&
    pageCount >= 1 &&
    pageCount <= 400 &&
    wordsPerPage >= 150 &&
    wordsPerPage <= 500;

  async function regerar() {
    if (!valido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await regerarEbook(ebook.id, {
        theme: theme.trim(),
        category_main: theme.trim(),
        categories_secondary: secundarias,
        audience: audience.trim(),
        tone,
        language,
        page_count: pageCount,
        words_per_page: wordsPerPage,
        extra_instructions: extra.trim(),
      });
      navigate(`/ebooks/${ebook.id}/gerando`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível regerar o ebook.");
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold">Instruções de criação</h2>
        <p className="text-sm text-neutral-500">
          O que foi informado quando este ebook foi criado. Altere o que precisar e mande
          escrever de novo — o texto atual é substituído.
        </p>
      </div>

      <ClassificacaoPicker
        principal={theme}
        onPrincipal={setTheme}
        secundarias={secundarias}
        onSecundarias={setSecundarias}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">Público-alvo *</label>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">Instrução extra</label>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={5}
          maxLength={5000}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
        <p className="text-xs text-neutral-400">{extra.length}/5000 caracteres.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Número de páginas</label>
          <input
            type="number"
            min={1}
            max={400}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={pageCount}
            onChange={(e) => setPageCount(Number(e.target.value))}
          />
          <p className="text-xs text-neutral-500">Mínimo 1, máximo 400 páginas.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Palavras por página</label>
          <input
            type="number"
            min={150}
            max={500}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={wordsPerPage}
            onChange={(e) => setWordsPerPage(Number(e.target.value))}
          />
          <p className="text-xs text-neutral-500">Mínimo 150, máximo 500 palavras.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Tom de voz</label>
          <select
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            {(TONS.includes(tone) ? TONS : [tone, ...TONS]).map((t) => (
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
            {(IDIOMAS.includes(language) ? IDIOMAS : [language, ...IDIOMAS]).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CustoEstimado
        pageCount={pageCount}
        wordsPerPage={wordsPerPage}
        imageCount={0}
        generateCover={false}
      />

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {/* Duas etapas de proposito: regerar apaga capitulos ja escritos e gasta de
          novo na OpenAI. Um clique unico ao lado de "Verificar diagramacao" seria
          facil demais de acertar sem querer. */}
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={!valido}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Gerar o ebook novamente
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Isto apaga os <strong>{ebook.chapters.length} capítulos</strong> já escritos, a
            introdução, a conclusão, a estratégia de marketing e os arquivos exportados
            (PDF, DOCX, EPUB). A capa e o autor são mantidos. Não tem como desfazer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void regerar()}
              disabled={enviando}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {enviando ? "Iniciando…" : "Apagar e escrever de novo"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
