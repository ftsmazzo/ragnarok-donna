"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { StaffDrawer } from "@/components/staff/StaffDrawer";
import type { StaffDetail, StaffFilter, StaffListItem } from "@/server/staff/queries";
import type { StaffPerformance } from "@/server/staff/performance";
import { formatCommission, formatPhone } from "@/lib/format";

type ListData = {
  rows: StaffListItem[];
  total: number;
  filter: StaffFilter;
  q: string;
};

type Props = {
  data: ListData;
  selectedStaff: StaffDetail | null;
  selectedPerformance: StaffPerformance | null;
  drawerMode: "none" | "new" | "edit";
};

function filterHref(filter: StaffFilter, q?: string) {
  const sp = new URLSearchParams();
  if (filter !== "ativos") sp.set("filter", filter);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `/profissionais?${qs}` : "/profissionais";
}

export function ProfissionaisView({
  data,
  selectedStaff,
  selectedPerformance,
  drawerMode,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildUrl(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function openNew() {
    router.push(buildUrl({ novo: "1", id: undefined }));
  }

  function openStaff(id: string) {
    router.push(buildUrl({ id, novo: undefined }));
  }

  function closeDrawer() {
    router.push(buildUrl({ id: undefined, novo: undefined }));
  }

  function onSaved(id: string) {
    router.push(buildUrl({ id, novo: undefined }));
    router.refresh();
  }

  const drawerOpen = drawerMode !== "none";

  return (
    <>
      <PageHeader
        title="Profissionais"
        subtitle={`${data.total} profissional(is)`}
        actions={
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Novo profissional
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar panel-toolbar-split">
          <CadastroSearch
            action="/profissionais"
            q={data.q}
            placeholder="Nome, apelido ou telefone"
            hidden={{ filter: data.filter !== "ativos" ? data.filter : undefined }}
          />
          <FilterTabs
            tabs={[
              {
                label: "Ativos",
                href: filterHref("ativos", data.q),
                active: data.filter === "ativos",
              },
              {
                label: "Removidos",
                href: filterHref("removidos", data.q),
                active: data.filter === "removidos",
              },
              { label: "Todos", href: filterHref("todos", data.q), active: data.filter === "todos" },
            ]}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table data-table-clickable">
            <thead>
              <tr>
                <th />
                <th>Nome</th>
                <th>Apelido</th>
                <th>Telefone</th>
                <th>Comissão</th>
                <th>Jornada</th>
                <th>Agenda</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhum profissional encontrado.
                  </td>
                </tr>
              ) : (
                data.rows.map((s) => (
                  <tr
                    key={s.id}
                    className={selectedStaff?.id === s.id ? "is-selected" : undefined}
                    onClick={() => openStaff(s.id)}
                  >
                    <td>
                      <PersonAvatar name={s.name} src={s.avatarUrl} color={s.color} />
                    </td>
                    <td className="cell-strong">{s.name}</td>
                    <td>{s.nickname ?? "—"}</td>
                    <td>{formatPhone(s.phone)}</td>
                    <td>{formatCommission(s.defaultCommissionBps)}</td>
                    <td>{s.scheduleSlots} slot(s)</td>
                    <td>
                      <StatusBadge
                        active={s.isBookable}
                        activeLabel="Bookable"
                        inactiveLabel="Off"
                      />
                    </td>
                    <td>
                      <StatusBadge
                        active={s.isActive && !s.deletedAt}
                        inactiveLabel={s.deletedAt ? "Removido" : "Inativo"}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <StaffDrawer
        open={drawerOpen}
        mode={drawerMode === "new" ? "new" : "edit"}
        staff={drawerMode === "edit" ? selectedStaff : null}
        performance={drawerMode === "edit" ? selectedPerformance : null}
        onClose={closeDrawer}
        onSaved={onSaved}
      />
    </>
  );
}
