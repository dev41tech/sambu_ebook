import { ehFiccao } from "../lib/categorias";
import { capitulosParaPalavras } from "../lib/custo";
import { capitulosMinimosDaHistoria, palavrasRecomendadas, promessasDoPedido } from "../lib/promessas";

/**
 * Aviso de extensão curta para o que a história promete.
 *
 * "Depois da Última Chave" pedia romance, grande traição e final inesperado em
 * 30 páginas: virou 8 capítulos de ~900 palavras, e a leitora reclamou nas três
 * versões que o romance ficava em segundo plano. Não muda nada sozinho -- o
 * tamanho do livro é escolha (e custo) de quem cria; só mostra a conta e oferece
 * o ajuste com um clique.
 */
export default function AvisoExtensao({
  caminho,
  secundarias,
  instrucao,
  palavras,
  palavrasPorPagina,
  capitulosEscolhidos,
  onUsar,
}: {
  /** Caminho efetivo da categoria (já com o ícone História aplicado). */
  caminho: string;
  secundarias: string[];
  instrucao: string;
  palavras: number;
  palavrasPorPagina: number;
  capitulosEscolhidos: number | null;
  /** Recebe a extensão recomendada, em palavras. */
  onUsar: (palavras: number) => void;
}) {
  if (!ehFiccao(caminho)) return null;
  const pr = promessasDoPedido({ theme: caminho, secondaryCategories: secundarias, extraInstructions: instrucao });
  const recomendadas = palavrasRecomendadas(pr);
  if (recomendadas === 0 || palavras >= recomendadas) return null;

  const promete = [pr.romance && "romance", pr.revelacao && "traição ou segredo revelado aos poucos", pr.viradaFinal && "final inesperado"]
    .filter(Boolean)
    .join(", ");
  const paginas = Math.ceil(recomendadas / Math.max(1, palavrasPorPagina));
  const capitulos =
    capitulosEscolhidos ?? Math.max(capitulosParaPalavras(palavras), capitulosMinimosDaHistoria(pr, palavras));
  const porCapitulo = Math.round(palavras / Math.max(1, capitulos));

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        Esta história promete <strong>{promete}</strong>. Com a extensão atual ela fica em {capitulos} capítulos de cerca
        de {porCapitulo.toLocaleString("pt-BR")} palavras — pouco espaço para desenvolver tudo isso, e o romance tende a
        ficar em segundo plano.
      </p>
      <p>
        Recomendado: pelo menos <strong>{paginas} páginas</strong> (cerca de {recomendadas.toLocaleString("pt-BR")}{" "}
        palavras).
      </p>
      <button
        type="button"
        className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        onClick={() => onUsar(recomendadas)}
      >
        Usar {paginas} páginas
      </button>
    </div>
  );
}
