import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewEbook from "./pages/NewEbook";
import Generating from "./pages/Generating";
import EbookDetail from "./pages/EbookDetail";
import Ideias from "./pages/Ideias";

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  async function handleLogout() {
    await api.logout();
    navigate("/login");
  }
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Ebook <span className="italic text-amber-700">Dias</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-neutral-600 hover:text-neutral-900">
              Meus ebooks
            </Link>
            <Link to="/ebooks/novo" className="text-neutral-600 hover:text-neutral-900">
              Criar novo
            </Link>
            <Link to="/ideias" className="text-neutral-600 hover:text-neutral-900">
              Ideias de nichos
            </Link>
            <button onClick={handleLogout} className="text-neutral-500 hover:text-neutral-900">
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((r) => {
        if (!cancelled) setStatus(r.authenticated ? "ok" : "denied");
      })
      .catch(() => {
        if (!cancelled) setStatus("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return <div className="p-8 text-center text-neutral-500">Carregando…</div>;
  }
  if (status === "denied") {
    return <Navigate to="/login" replace />;
  }
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/ebooks/novo"
        element={
          <RequireAuth>
            <NewEbook />
          </RequireAuth>
        }
      />
      <Route
        path="/ebooks/:id/gerando"
        element={
          <RequireAuth>
            <Generating />
          </RequireAuth>
        }
      />
      <Route
        path="/ebooks/:id"
        element={
          <RequireAuth>
            <EbookDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/ideias"
        element={
          <RequireAuth>
            <Ideias />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
