import type { ReactNode } from "react";

/**
 * Introducao e conclusao, ligadas ou desligadas antes de gerar.
 *
 * As duas sempre eram escritas. Num livro de contos, num manual direto ao ponto
 * ou numa colecao que ja tem apresentacao propria elas sobram -- e custam duas
 * chamadas de escrita e duas de humanizacao cada.
 */
function IconeIntroducao() {
  // Livro aberto: o comeco da leitura.
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5.5c3-1.3 6.3-1.3 10 .8v13c-3.7-2.1-7-2.1-10-.8z" />
      <path d="M22 5.5c-3-1.3-6.3-1.3-10 .8v13c3.7-2.1 7-2.1 10-.8z" />
    </svg>
  );
}

function IconeConclusao() {
  // Bandeira de chegada: o fim da leitura.
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function Alternar({
  ativo,
  onClick,
  icone,
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  icone: ReactNode;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={ativo ? `${rotulo} incluída — clique para tirar` : `Sem ${rotulo.toLowerCase()} — clique para incluir`}
      className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition ${
        ativo
          ? "bg-neutral-900 text-white"
          : "border border-dashed border-neutral-300 text-neutral-400 line-through decoration-neutral-400"
      }`}
    >
      {icone}
      {rotulo}
    </button>
  );
}

export default function SecoesDoLivro({
  introducao,
  conclusao,
  onIntroducao,
  onConclusao,
}: {
  introducao: boolean;
  conclusao: boolean;
  onIntroducao: (v: boolean) => void;
  onConclusao: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-4">
      <p className="text-sm font-medium text-neutral-700">Seções do livro</p>
      <div className="flex flex-wrap gap-2">
        <Alternar ativo={introducao} onClick={() => onIntroducao(!introducao)} icone={<IconeIntroducao />} rotulo="Introdução" />
        <Alternar ativo={conclusao} onClick={() => onConclusao(!conclusao)} icone={<IconeConclusao />} rotulo="Conclusão" />
      </div>
      <p className="text-xs text-neutral-500">
        {introducao && conclusao
          ? "O livro terá introdução e conclusão. Clique em uma delas para tirar."
          : !introducao && !conclusao
            ? "Sem introdução e sem conclusão: o livro começa no capítulo 1 e termina no último capítulo."
            : !introducao
              ? "Sem introdução: o livro começa direto no capítulo 1."
              : "Sem conclusão: o livro termina no último capítulo."}
      </p>
    </div>
  );
}
