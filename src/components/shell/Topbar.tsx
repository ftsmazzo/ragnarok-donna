"use client";

import { useRouter } from "next/navigation";

type ShellSession = {
  userName: string;
  tenantName: string;
  role: string;
};

type TopbarProps = {
  onToggleSidebar?: () => void;
  session: ShellSession;
};

export function Topbar({ onToggleSidebar, session }: TopbarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-menu"
        onClick={onToggleSidebar}
        aria-label="Abrir menu"
      >
        ☰
      </button>
      <div className="topbar-search">
        <input
          type="search"
          placeholder="Buscar cliente, serviço…"
          aria-label="Busca rápida"
          disabled
          title="Busca global — Sprint 1"
        />
      </div>
      <div className="topbar-actions">
        <a href="/caixa" className="btn btn-ghost">
          Caixa
        </a>
        <span className="topbar-user" title={`${session.tenantName} · ${session.role}`}>
          {session.userName}
        </span>
        <button type="button" className="btn btn-outline topbar-logout" onClick={handleLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}
