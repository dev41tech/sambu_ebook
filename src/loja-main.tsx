// Entrada separada para a vitrine (Sambu Online portado). Fica num documento
// próprio de propósito: o CSS do Sambu é global (estiliza body, botões, inputs)
// e vazaria por cima do Tailwind do restante do app se dividisse a mesma página.
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import SambuApp from "./sambu/SambuApp";

type User = { name: string; email: string } | null;

function LojaRoot() {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then(async (auth) => {
        if (cancelled) return;
        if (!auth.authenticated) {
          setState("denied");
          return;
        }
        const profile = await fetch("/api/profile")
          .then((r) => (r.ok ? r.json() : { profile: null }))
          .catch(() => ({ profile: null }));
        const email = String(profile.profile?.email || "leitor@sambu.local");
        const name = String(
          profile.profile?.display_name || profile.profile?.displayName || email.split("@")[0]
        );
        setUser({ name, email });
        setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === "denied") window.location.replace("/login");
  }, [state]);

  if (state !== "ok") {
    return (
      <div style={{ padding: "3rem", textAlign: "center", fontFamily: "Inter, Arial, sans-serif" }}>
        Carregando…
      </div>
    );
  }
  return <SambuApp user={user} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LojaRoot />
  </React.StrictMode>
);
