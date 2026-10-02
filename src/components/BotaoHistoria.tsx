import { ehFiccao } from "../lib/categorias";

// Ícone "História" (pedido do Marcos em 02/10/2026). Liga o modo de escrita de
// história: enredo com elenco fixo em que nenhum personagem se perde, e o fim da
// história nos últimos capítulos (server/lib/historia.ts).
//
// Categoria que já é de ficção ("Romance > ...", "Minhas categorias > Fantasia
// acolhedora") liga o modo sozinha — o ícone aparece aceso e travado. Ele serve
// para a categoria que não parece ficção mas é: "Drama Familiar", "Aventura",
// "Crônica de bairro".

function IconeLivroAberto({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export default function BotaoHistoria({
  categoria,
  ativo,
  onChange,
}: {
  categoria: string;
  ativo: boolean;
  onChange: (v: boolean) => void;
}) {
  const automatico = ehFiccao(categoria);
  const ligado = automatico || ativo;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={automatico}
      onClick={() => onChange(!ativo)}
      title={
        automatico
          ? "A categoria já é de ficção: o modo história está ligado automaticamente."
          : ligado
            ? "Modo história ligado — clique para desligar"
            : "É uma história? Clique para ligar o modo história"
      }
      className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
        ligado
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-neutral-300 bg-white text-neutral-600 hover:border-amber-300 hover:bg-amber-50/50"
      } ${automatico ? "cursor-default" : "cursor-pointer"}`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          ligado ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        <IconeLivroAberto />
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">
          História {ligado ? "— ligado" : "— desligado"}
          {automatico && <span className="ml-1 text-xs font-normal text-amber-700">(pela categoria)</span>}
        </span>
        <span className="block text-xs text-neutral-500">
          Enredo com elenco fixo — nenhum personagem se perde no caminho — e a história termina nos últimos capítulos:
          clímax na reta final e desfecho no último.
        </span>
      </span>
    </button>
  );
}
