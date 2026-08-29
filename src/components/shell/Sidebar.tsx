"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark";
import { filterNavForRole, type NavItem } from "./nav";
import type { MemberRole } from "@/server/types";

type ShellSession = {
  tenantName: string;
  tenantSlug: string;
  role: MemberRole;
  staffId?: string | null;
  brandLogoSrc?: string | null;
  brandTagline?: string | null;
  branchView?: "unit" | "consolidated";
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

function NavLabel({ icon, label }: { icon?: string; label: string }) {
  return (
    <span className="nav-label">
      {icon ? (
        <span className="nav-link-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="nav-label-text">{label}</span>
    </span>
  );
}

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const isConsolidated = session.branchView === "consolidated";
  const nav = filterNavForRole(session.role, session.staffId, {
    consolidated: isConsolidated,
  });

  const routeGroup =
    nav.find((item) => item.children && hasActiveChild(pathname, item))?.label ?? null;

  /** Accordion: um grupo por vez. */
  const [openLabel, setOpenLabel] = useState<string | null>(routeGroup);

  useEffect(() => {
    if (routeGroup) setOpenLabel(routeGroup);
  }, [routeGroup]);

  function toggle(label: string) {
    setOpenLabel((prev) => (prev === label ? null : label));
  }

  const tagline = isConsolidated
    ? session.tenantSlug === "donna-elegant"
      ? "Gestão · comparativo das unidades"
      : "Gestão · comparativo da rede"
    : (session.brandTagline ?? "Painel");

  return (
    <aside className={`sidebar${isConsolidated ? " is-consolidated" : ""}`}>
      <div className="sidebar-brand">
        <BrandMark
          key={session.tenantSlug}
          logoSrc={session.brandLogoSrc}
          alt={session.tenantName}
          size="md"
        />
        <div>
          <strong className="sidebar-brand-name">{session.tenantName}</strong>
          <small>{tagline}</small>
        </div>
      </div>

      {isConsolidated ? (
        <p className="sidebar-consolidated-hint">
          Visão de gestão. Para agenda, comanda ou caixa, escolha uma unidade no topo.
        </p>
      ) : null}

      <nav className="sidebar-nav" aria-label={isConsolidated ? "Gestão da rede" : "Principal"}>
        {nav.map((item) => {
          if (item.href) {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link${active ? " is-active" : ""}`}
              >
                <NavLabel icon={item.icon} label={item.label} />
              </Link>
            );
          }

          const expanded = openLabel === item.label;
          const childActive = hasActiveChild(pathname, item);

          return (
            <div key={item.label} className={`nav-group${expanded ? " is-open" : ""}`}>
              <button
                type="button"
                className={`nav-link nav-toggle${expanded ? " is-open" : ""}${
                  childActive ? " is-active" : ""
                }`}
                onClick={() => toggle(item.label)}
                aria-expanded={expanded}
              >
                <NavLabel icon={item.icon} label={item.label} />
                <span className={`nav-caret${expanded ? " is-open" : ""}`} aria-hidden>
                  ▾
                </span>
              </button>
              <div className={`nav-children${expanded ? " is-open" : ""}`}>
                <div className="nav-children-inner">
                  {item.children?.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`nav-link nav-child${
                        isActive(pathname, child.href) ? " is-active" : ""
                      }`}
                    >
                      <NavLabel icon={child.icon} label={child.label} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
