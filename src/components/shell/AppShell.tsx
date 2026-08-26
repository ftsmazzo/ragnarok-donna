"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell${collapsed ? " is-collapsed" : ""}`}>
      <Sidebar />
      <div className="app-main">
        <Topbar onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
