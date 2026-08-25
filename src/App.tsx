import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewEbook from "./pages/NewEbook";
import NewEbookGrounded from "./pages/NewEbookGrounded";
import ImportEbook from "./pages/ImportEbook";
import Generating from "./pages/Generating";
import EbookDetail from "./pages/EbookDetail";
import Ideias from "./pages/Ideias";
import KindleReading from "./pages/KindleReading";

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  async function handleLogout() {
    await api.logout();
    navigate("/login");
  }
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Sambu <span className="italic text-amber-700">Ebooks</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-neutral-600 hover:text-neutral-900">
              Meus ebooks
            </Link>
            <Link to="/ebooks/novo" className="text-neutral-600 hover:text-neutral-900">
              Criar novo
            </Link>
            <Link to="/ebooks/importar" className="text-neutral-600 hover:text-neutral-900">
              Importar arquivo
            </Link>
            <Link to="/ebooks/novo-tecnico" className="text-neutral-600 hover:text-neutral-900">
              Ebooks Técnicos
            </Link>
            <Link to="/ebooks/novo-comportamental" className="text-neutral-600 hover:text-neutral-900">
              Ebooks Comportamentais
            </Link>
            <Link to="/ideias" className="text-neutral-600 hover:text-neutral-900">
              Ideias de nichos
            </Link>
            {/* A vitrine roda numa entrada Vite própria (loja.html), por isso é
                um link normal e não uma rota do react-router. */}
            <a href="/loja.html" className="font-medium text-amber-700 hover:text-amber-800">
              Vitrine
            </a>
            <button onClick={handleLogout} className="text-neutral-500 hover:text-neutral-900">
              Sair
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
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
        path="/ebooks/importar"
        element={
          <RequireAuth>
            <ImportEbook />
          </RequireAuth>
        }
      />
      <Route
        path="/ebooks/novo-tecnico"
        element={
          <RequireAuth>
            <NewEbookGrounded category="tecnico" />
          </RequireAuth>
        }
      />
      <Route
        path="/ebooks/novo-comportamental"
        element={
          <RequireAuth>
            <NewEbookGrounded category="comportamental" />
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
      <Route
        path="/ebooks/:id/ler"
        element={
          <RequireAuth>
            <KindleReading />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
