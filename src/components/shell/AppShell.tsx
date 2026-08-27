"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

import type { MemberRole } from "@/server/types";

export type ShellSession = {
  userName: string;
  tenantName: string;
  tenantSlug: string;
  role: MemberRole;
  staffId?: string | null;
};

type AppShellProps = {
  children: React.ReactNode;
  session: ShellSession;
};

export function AppShell({ children, session }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell${collapsed ? " is-collapsed" : ""}`}>
      <Sidebar session={session} />
      <div className="app-main">
        <Topbar session={session} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
