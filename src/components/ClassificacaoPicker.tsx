import { useEffect, useState } from "react";
import { criarCategoria, listarCategorias } from "../lib/api";
import { GRUPO_PERSONALIZADO, TAXONOMIA, limparNomeCategoria } from "../lib/categorias";

// As secundarias sao texto livre digitado pelo usuario, separado por virgula.
// Guardamos o texto cru em estado local em vez de derivar de `secundarias`:
// re-derivar a cada tecla apagaria a virgula no instante em que ela e digitada.
function separar(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .split(",")
    .map((c) => c.trim().slice(0, 60))
    .filter((c) => {
      if (!c || vistos.has(c.toLowerCase())) return false;
      vistos.add(c.toLowerCase());
      return true;
    })
    .slice(0, 8);
}

// Classificacao usada na busca da vitrine e, no caso da principal, como tema que
// alimenta o prompt da IA. Aparece em todas as telas de criacao e na importacao.
export default function ClassificacaoPicker({
  principal,
  onPrincipal,
  secundarias,
  onSecundarias,
  obrigatorio = true,
}: {
  principal: string;
  onPrincipal: (v: string) => void;
  secundarias: string[];
  onSecundarias: (v: string[]) => void;
  obrigatorio?: boolean;
}) {
  const [texto, setTexto] = useState(() => secundarias.join(", "));
  const reconhecidas = separar(texto);

  // Categorias criadas a mao, vindas do banco. Ficam num grupo proprio no fim da
  // lista para o usuario reconhecer o que e dele e o que veio de fabrica.
  const [personalizadas, setPersonalizadas] = useState<string[]>([]);
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    listarCategorias()
      .then((r) => setPersonalizadas(r.personalizadas))
      .catch(() => setPersonalizadas([]));
  }, []);

  async function adicionar() {
    const item = limparNomeCategoria(nova);
    if (!item || salvando) return;
    setSalvando(true);
    setAviso("");
    try {
      const r = await criarCategoria(item);
      // O servidor decide se criou ou reaproveitou: se o nome ja existia na
      // taxonomia fixa ele devolve o caminho de la, e selecionamos aquele em vez
      // de cadastrar uma segunda categoria com o mesmo nome.
      if (r.criada) setPersonalizadas((atual) => [...new Set([...atual, r.caminho])].sort());
      onPrincipal(r.caminho);
      setNova("");
      setAviso(r.criada ? `"${item}" foi criada e já está selecionada.` : `Essa categoria já existia — selecionei "${r.caminho}".`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível criar a categoria.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">
          Categoria principal{obrigatorio && " *"}
        </label>
        <select
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={principal}
          onChange={(e) => onPrincipal(e.target.value)}
          required={obrigatorio}
        >
          <option value="">Selecione…</option>
          {TAXONOMIA.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.itens.map((item) => {
                const caminho = `${g.grupo} > ${item}`;
                return (
                  <option key={caminho} value={caminho}>
                    {item}
                  </option>
                );
              })}
            </optgroup>
          ))}
          {personalizadas.length > 0 && (
            <optgroup label={GRUPO_PERSONALIZADO}>
              {personalizadas.map((caminho) => (
                <option key={caminho} value={caminho}>
                  {caminho.split(" > ").pop()}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="text-xs text-neutral-500">
          Define onde o ebook aparece na busca e orienta a IA sobre o gênero. O assunto
          específico da obra vai no campo de instruções extras.
        </p>

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Não achou na lista? Digite uma categoria nova"
            value={nova}
            maxLength={60}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              // Enter aqui salvaria o formulario inteiro e criaria um ebook sem
              // querer -- o campo esta dentro do <form> da tela de criacao.
              if (e.key === "Enter") {
                e.preventDefault();
                void adicionar();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void adicionar()}
            disabled={!limparNomeCategoria(nova) || salvando}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Adicionar"}
          </button>
        </div>
        {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">
          Temas secundários (opcional)
        </label>
        <input
          type="text"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Ex.: suspense psicológico, ambientação rural, luto"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            onSecundarias(separar(e.target.value));
          }}
        />
        <p className="text-xs text-neutral-500">
          Separe por vírgula. Até 8 temas, de 60 caracteres cada — a IA usa para tangenciar
          sem desviar da categoria principal.
          {reconhecidas.length > 0 && ` Serão enviados ${reconhecidas.length}.`}
        </p>
      </div>
    </div>
  );
}
