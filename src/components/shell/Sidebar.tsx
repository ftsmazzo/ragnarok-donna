"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, TENANT_LABEL, type NavItem } from "./nav";

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/agenda") return pathname === "/" || pathname === "/agenda";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasActiveChild(pathname: string, item: NavItem) {
  return item.children?.some((c) => isActive(pathname, c.href)) ?? false;
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">RD</span>
        <div>
          <strong>{TENANT_LABEL}</strong>
          <small>Donna · RagnaroK</small>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Principal">
        {NAV.map((item) => {
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
