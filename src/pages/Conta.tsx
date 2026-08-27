import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";

// Troca de usuario e senha do app. Ate agora essas credenciais so existiam no
// .env, e mudar exigia editar o arquivo e reiniciar o servidor.
export default function Conta() {
  const [usuarioAtual, setUsuarioAtual] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (r.username) {
          setUsuarioAtual(r.username);
          setNovoUsuario(r.username);
        }
      })
      .catch(() => {});
  }, []);

  const senhasBatem = novaSenha.length === 0 || novaSenha === confirmacao;
  const valido =
    senhaAtual.length > 0 &&
    novoUsuario.trim().length > 0 &&
    novaSenha.length >= 8 &&
    novaSenha === confirmacao;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      await api.changePassword({
        current_password: senhaAtual,
        username: novoUsuario.trim(),
        new_password: novaSenha,
      });
      setOk(true);
      setUsuarioAtual(novoUsuario.trim());
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Conta</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Trocar <span className="italic text-amber-700">acesso</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Altere o usuário e a senha usados para entrar no aplicativo.
        {usuarioAtual && (
          <>
            {" "}
            Hoje você entra como <strong className="text-neutral-700">{usuarioAtual}</strong>.
          </>
        )}
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Senha atual</label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            required
          />
          <p className="text-xs text-neutral-500">
            Pedimos a senha atual mesmo com você já logado, para que um navegador
            esquecido aberto não permita a troca.
          </p>
        </div>

        <hr className="border-neutral-200" />

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Usuário</label>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={novoUsuario}
            onChange={(e) => setNovoUsuario(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Nova senha</label>
          <input
            type="password"
            autoComplete="new-password"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            required
          />
          <p className="text-xs text-neutral-500">Mínimo de 8 caracteres.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Repita a nova senha</label>
          <input
            type="password"
            autoComplete="new-password"
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              senhasBatem ? "border-neutral-300" : "border-red-400"
            }`}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
          />
          {!senhasBatem && <p className="text-xs text-red-600">As duas senhas não são iguais.</p>}
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {ok && (
          <p className="text-sm text-emerald-700">
            Acesso atualizado. Use os dados novos no próximo login — sua sessão atual continua valendo.
          </p>
        )}

        <button
          type="submit"
          disabled={!valido || salvando}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar novo acesso"}
        </button>
      </form>
    </div>
  );
}
