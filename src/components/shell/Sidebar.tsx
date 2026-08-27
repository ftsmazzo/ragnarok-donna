"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { filterNavForRole, type NavItem } from "./nav";
import type { MemberRole } from "@/server/types";

type ShellSession = {
  tenantName: string;
  tenantSlug: string;
  role: MemberRole;
  staffId?: string | null;
};

type SidebarProps = {
  session: ShellSession;
};

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/inicio") return pathname === "/" || pathname === "/inicio";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasActiveChild(pathname: string, item: NavItem) {
  return item.children?.some((c) => isActive(pathname, c.href)) ?? false;
}

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const nav = filterNavForRole(session.role, session.staffId);

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">RD</span>
        <div>
          <strong>{session.tenantName}</strong>
          <small>{session.tenantSlug} · SaaS</small>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Principal">
        {nav.map((item) => {
          if (item.href) {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link${active ? " is-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          }

          const expanded = open[item.label] ?? hasActiveChild(pathname, item);
          return (
            <div key={item.label} className="nav-group">
              <button
                type="button"
                className={`nav-link nav-toggle${expanded ? " is-open" : ""}${
                  hasActiveChild(pathname, item) ? " is-active" : ""
                }`}
                onClick={() => toggle(item.label)}
                aria-expanded={expanded}
              >
                <span>{item.label}</span>
                <span className="nav-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {expanded && item.children ? (
                <div className="nav-children">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`nav-link nav-child${
                        isActive(pathname, child.href) ? " is-active" : ""
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
