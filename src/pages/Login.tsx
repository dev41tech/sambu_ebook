import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(username, password);
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // 500/502 aqui quase nunca e senha errada (isso da 401): e o servidor da
      // API fora do ar, e o proxy do Vite devolvendo erro generico. Dizer isso
      // evita procurar problema na senha.
      setError(
        /^Erro (5\d\d|000)$/.test(msg) || /Failed to fetch|NetworkError/i.test(msg)
          ? "O servidor da API não respondeu. Ele não sobe sem DATABASE_URL no .env — veja o terminal onde o app foi iniciado."
          : msg || "Erro ao entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sambu <span className="italic text-amber-700">Ebooks</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Acesso restrito — uso pessoal.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Usuário</label>
            <input
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
            <input
              type="password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
