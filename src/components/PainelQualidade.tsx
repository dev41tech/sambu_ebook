import { useEffect, useState } from "react";
import { api, type AchadoEditorial, type GravidadeAchado, type Metricas, type ResultadoQualidade } from "../lib/api";
import { ehFiccao } from "../lib/categorias";

const CORES: Record<GravidadeAchado, string> = {
  blocker: "border-red-300 bg-red-50 text-red-900",
  major: "border-amber-300 bg-amber-50 text-amber-900",
  warning: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-neutral-200 bg-white text-neutral-600",
};

const ROTULOS: Record<GravidadeAchado, string> = {
  blocker: "Impede publicar",
  major: "Grave",
  warning: "Atenção",
  info: "Nota",
};

function Achado({ a }: { a: AchadoEditorial }) {
  return (
    <div className={`rounded-md border p-3 text-xs ${CORES[a.gravidade]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold uppercase tracking-wide">{ROTULOS[a.gravidade]}</span>
        <span className="text-[0.7rem] opacity-70">{a.local}</span>
      </div>
      <p className="mt-1">{a.evidencia}</p>
      <p className="mt-1 opacity-75">{a.sugestao}</p>
    </div>
  );
}

/**
 * Placar numérico — nunca bloqueia, é o número para comparar antes/depois de
 * uma mudança de prompt sem reler o livro inteiro. Existe porque uma leitura
 * "melhorou"/"piorou" já errou uma vez: um livro que era ensaio corporativo (sem
 * diálogo, sem metáfora) foi comparado com um romance, e a diferença pareceu
 * regressão quando não era.
 */
function PlacarMetricas({ m, ficcao }: { m: Metricas; ficcao: boolean }) {
  if (m.capitulos === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs sm:grid-cols-4">
      {ficcao && (
        <div>
          <dt className="text-neutral-500">Diálogo</dt>
          <dd className="font-medium text-neutral-800">{m.dialogoPorMil}/mil palavras</dd>
        </div>
      )}
      <div>
        <dt className="text-neutral-500">Abstração</dt>
        <dd className="font-medium text-neutral-800">{m.abstracaoPorMil}/mil palavras</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Repetição entre capítulos</dt>
        <dd className="font-medium text-neutral-800">{Math.round(m.repeticaoEntreCapitulos * 100)}%</dd>
      </div>
      <div>
        <dt className="text-neutral-500">Extensão</dt>
        <dd className="font-medium text-neutral-800">
          {m.palavras.toLocaleString("pt-BR")} palavras · {m.capitulos} cap.
        </dd>
      </div>
      {m.personagensSemFuncao.length > 0 && (
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-neutral-500">Personagens em menos de 2 capítulos</dt>
          <dd className="font-medium text-amber-700">{m.personagensSemFuncao.join(", ")}</dd>
        </div>
      )}
      {m.exemplosRepetidos > 0 && (
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-neutral-500">Exemplos repetidos entre capítulos</dt>
          <dd className="font-medium text-amber-700">{m.exemplosRepetidos}</dd>
        </div>
      )}
    </div>
  );
}

/**
 * Mostra o que trava a publicacao ANTES de o usuario clicar em finalizar e
 * receber um erro seco. O escape existe porque o Quality Gate se aplica tambem
 * aos livros antigos: sem ele, quatro ebooks ja publicados ficariam impossiveis
 * de reexportar por um defeito que ninguem tinha como saber que existia.
 */
export default function PainelQualidade({
  ebookId,
  caminhoCategoria,
  ignorarBloqueios,
  onIgnorarBloqueios,
}: {
  ebookId: string;
  /** Categoria do ebook — decide se mostra a métrica de diálogo (só faz sentido em ficção). */
  caminhoCategoria: string;
  ignorarBloqueios: boolean;
  onIgnorarBloqueios: (v: boolean) => void;
}) {
  const [r, setR] = useState<ResultadoQualidade | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api
      .qualidadeEbook(ebookId)
      .then((res) => vivo && setR(res))
      .catch(() => vivo && setR(null))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [ebookId]);

  if (carregando) {
    return <p className="text-xs text-neutral-400">Verificando a qualidade do ebook…</p>;
  }
  if (!r) return null;

  const ordem: GravidadeAchado[] = ["blocker", "major", "warning", "info"];
  const ordenados = [...r.achados].sort((a, b) => ordem.indexOf(a.gravidade) - ordem.indexOf(b.gravidade));
  const ficcao = ehFiccao(caminhoCategoria);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-neutral-700">Verificação de qualidade</h3>
        <span className="text-xs text-neutral-500">
          {r.liberado ? "Liberado para publicar" : `${r.bloqueadores.length} problema(s) impedem publicar`}
        </span>
      </div>

      {r.metricas && <PlacarMetricas m={r.metricas} ficcao={ficcao} />}

      {ordenados.length === 0 ? (
        <p className="text-xs text-emerald-700">
          ✓ Nenhum problema encontrado nas verificações automáticas.
        </p>
      ) : (
        <div className="space-y-2">
          {ordenados.map((a, i) => (
            <Achado key={`${a.categoria}-${i}`} a={a} />
          ))}
        </div>
      )}

      {!r.liberado && (
        <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={ignorarBloqueios}
            onChange={(e) => onIgnorarBloqueios(e.target.checked)}
          />
          <span>
            <strong>Publicar mesmo assim.</strong> Os problemas acima vão para o PDF, o DOCX e o
            EPUB do jeito que estão. Marque só quando souber que o achado é um falso positivo — ou
            quando o livro já estava publicado antes destas verificações existirem.
          </span>
        </label>
      )}
    </div>
  );
}
