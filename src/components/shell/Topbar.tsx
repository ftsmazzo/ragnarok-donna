"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { hasCapability } from "@/server/permissions/capabilities";
import { roleLabel } from "@/server/permissions/roles";
import type { MemberRole } from "@/server/types";

type OrgOption = { slug: string; name: string };
type BranchOption = { slug: string; name: string };

type ShellSession = {
  userName: string;
  tenantName: string;
  tenantSlug: string;
  branchName?: string | null;
  branchSlug?: string | null;
  role: MemberRole;
  organizations: OrgOption[];
  branches: BranchOption[];
};

type TopbarProps = {
  onToggleSidebar?: () => void;
  session: ShellSession;
};

export function Topbar({ onToggleSidebar, session }: TopbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const showCash = hasCapability(session.role, "cash.read");
  const showOrgSwitch = session.organizations.length > 1;
  const showBranchSwitch = session.branches.length > 1;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/login/${session.tenantSlug}`);
    router.refresh();
  }

  function switchTenant(slug: string) {
    if (slug === session.tenantSlug) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: slug }),
      });
      if (res.ok) {
        router.push("/inicio");
        router.refresh();
      }
    });
  }

  function switchBranch(slug: string) {
    if (slug === session.branchSlug) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchSlug: slug }),
      });
      if (res.ok) router.refresh();
    });
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

      <div className="topbar-context">
        {showOrgSwitch ? (
          <select
            className="topbar-select"
            value={session.tenantSlug}
            disabled={pending}
            aria-label="Organização"
            onChange={(e) => switchTenant(e.target.value)}
          >
            {session.organizations.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="topbar-org">{session.tenantName}</span>
        )}

        {showBranchSwitch ? (
          <select
            className="topbar-select topbar-select-branch"
            value={session.branchSlug ?? ""}
            disabled={pending}
            aria-label="Unidade"
            onChange={(e) => switchBranch(e.target.value)}
          >
            {session.branches.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        ) : session.branchName ? (
          <span className="topbar-branch">{session.branchName}</span>
        ) : null}
      </div>

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
        <a href="/configuracoes/conta" className="btn btn-ghost" title="Minha conta">
          Conta
        </a>
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
