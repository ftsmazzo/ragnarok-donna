"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

import type { MemberRole } from "@/server/types";

export type ShellSession = {
  userName: string;
  tenantName: string;
  tenantSlug: string;
  branchName?: string | null;
  branchSlug?: string | null;
  role: MemberRole;
  staffId?: string | null;
  brandLogoSrc?: string | null;
  brandTagline?: string | null;
  themeClass?: string | null;
  branchView?: "unit" | "consolidated";
  canSwitchBranch?: boolean;
  showConsolidated?: boolean;
  organizations: { slug: string; name: string }[];
  branches: { slug: string; name: string }[];
};

type AppShellProps = {
  children: React.ReactNode;
  session: ShellSession;
};

export function AppShell({ children, session }: AppShellProps) {
  const searchParams = useSearchParams();
  const tabletMode = searchParams.get("modo") === "tablet";
  const [collapsed, setCollapsed] = useState(tabletMode);

  useEffect(() => {
    if (tabletMode) setCollapsed(true);
  }, [tabletMode]);

  return (
    <div
      className={[
        "app-shell",
        collapsed ? "is-collapsed" : "",
        tabletMode ? "is-tablet-mode" : "",
        session.themeClass ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Sidebar session={session} />
      <div className="app-main">
        <Topbar session={session} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
