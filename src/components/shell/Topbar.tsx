"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { hasCapability } from "@/server/permissions/capabilities";
import { roleLabel } from "@/server/permissions/roles";
import type { MemberRole } from "@/server/types";

const CONSOLIDATED_SLUG = "_consolidado";

type OrgOption = { slug: string; name: string };
type BranchOption = { slug: string; name: string };

type ShellSession = {
  userName: string;
  tenantName: string;
  tenantSlug: string;
  branchName?: string | null;
  branchSlug?: string | null;
  branchView?: "unit" | "consolidated";
  canSwitchBranch?: boolean;
  showConsolidated?: boolean;
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
  const isConsolidated = session.branchView === "consolidated";
  const showBranchNav =
    session.canSwitchBranch && (session.branches.length > 1 || session.showConsolidated);
  const consolidatedLabel =
    session.tenantSlug === "donna-elegant" ? "Comparativo Donna" : "Gestão da rede";

  function branchPillLabel(name: string) {
    return name.replace(/^Donna Elegant — /, "").replace(/^Unidade /, "U");
  }

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
    const active =
      slug === CONSOLIDATED_SLUG ? isConsolidated : !isConsolidated && slug === session.branchSlug;
    if (active) return;
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
          <div className="topbar-pills" role="group" aria-label="Organização">
            {session.organizations.map((o) => (
              <button
                key={o.slug}
                type="button"
                className={`topbar-pill${o.slug === session.tenantSlug ? " is-active" : ""}`}
                disabled={pending}
                onClick={() => switchTenant(o.slug)}
              >
                {o.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="topbar-org">{session.tenantName}</span>
        )}

        {showBranchNav ? (
          <>
            <div className="topbar-pills topbar-pills-branch" role="group" aria-label="Unidades">
              {session.branches.map((b) => (
                <button
                  key={b.slug}
                  type="button"
                  className={`topbar-pill topbar-pill-branch${
                    !isConsolidated && b.slug === session.branchSlug ? " is-active" : ""
                  }`}
                  disabled={pending}
                  onClick={() => switchBranch(b.slug)}
                  title={`Operar unidade: ${b.name}`}
                >
                  {branchPillLabel(b.name)}
                </button>
              ))}
            </div>
            {session.showConsolidated ? (
              <button
                type="button"
                className={`topbar-pill topbar-pill-mgmt${isConsolidated ? " is-active" : ""}`}
                disabled={pending}
                onClick={() => switchBranch(CONSOLIDATED_SLUG)}
                title="Comparativo entre unidades — só gestão, sem operação"
              >
                {consolidatedLabel}
              </button>
            ) : null}
          </>
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
