"use client";

import Link from "next/link";
import { daysAgoSp, monthStartSp, todaySp } from "@/lib/datetime";

type Props = {
  staffId: string;
  from: string;
  to: string;
  filter?: string;
  q?: string;
};

function buildHref(
  staffId: string,
  from: string,
  to: string,
  filter?: string,
  q?: string
): string {
  const sp = new URLSearchParams({ id: staffId, from, to });
  if (filter && filter !== "ativos") sp.set("filter", filter);
  if (q) sp.set("q", q);
  return `/profissionais?${sp.toString()}`;
}

export function StaffPerformanceFilters({ staffId, from, to, filter, q }: Props) {
  const today = todaySp();
  const presets = [
    { label: "Mês atual", from: monthStartSp(), to: today },
    { label: "7 dias", from: daysAgoSp(6), to: today },
    { label: "30 dias", from: daysAgoSp(29), to: today },
  ];

  return (
    <div className="perf-filters">
      <div className="perf-presets">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Link
              key={p.label}
              href={buildHref(staffId, p.from, p.to, filter, q)}
              className={active ? "perf-preset is-active" : "perf-preset"}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <form action="/profissionais" method="get" className="perf-custom-range">
        <input type="hidden" name="id" value={staffId} />
        {filter && filter !== "ativos" ? (
          <input type="hidden" name="filter" value={filter} />
        ) : null}
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <label className="filter-field">
          <span>De</span>
          <input type="date" name="from" defaultValue={from} className="search-input" />
        </label>
        <label className="filter-field">
          <span>Até</span>
          <input type="date" name="to" defaultValue={to} className="search-input" />
        </label>
        <button type="submit" className="btn btn-outline btn-sm">
          Aplicar
        </button>
      </form>
    </div>
  );
}
