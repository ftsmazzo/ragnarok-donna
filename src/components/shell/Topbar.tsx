"use client";

import { useRouter } from "next/navigation";
import { hasCapability } from "@/server/permissions/capabilities";
import { roleLabel } from "@/server/permissions/roles";
import type { MemberRole } from "@/server/types";

type ShellSession = {
  userName: string;
  tenantName: string;
  role: MemberRole;
};

type TopbarProps = {
  onToggleSidebar?: () => void;
  session: ShellSession;
};

export function Topbar({ onToggleSidebar, session }: TopbarProps) {
  const router = useRouter();
  const showCash = hasCapability(session.role, "cash.read");

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
        {showCash ? (
          <a href="/caixa" className="btn btn-ghost">
            Caixa
          </a>
        ) : null}
        <span
          className="topbar-user"
          title={`${session.tenantName} · ${roleLabel(session.role)}`}
        >
          {session.userName}
          <small className="topbar-role">{roleLabel(session.role)}</small>
        </span>
        <button type="button" className="btn btn-outline topbar-logout" onClick={handleLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}
