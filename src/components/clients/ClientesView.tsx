"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { Pagination } from "@/components/cadastro/Pagination";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { ClientDrawer } from "@/components/clients/ClientDrawer";
import type { ClientDetail, ClientFilter, ClientListItem, ClientProfile } from "@/server/clients/queries";
import { formatPhone } from "@/lib/format";

type ListData = {
  rows: ClientListItem[];
  total: number;
  page: number;
  totalPages: number;
  filter: ClientFilter;
  q: string;
};

type Props = {
  data: ListData;
  selectedClient: ClientDetail | null;
  selectedProfile: ClientProfile | null;
  drawerMode: "none" | "new" | "edit";
};

function filterHref(filter: ClientFilter, q?: string) {
  const sp = new URLSearchParams();
  if (filter !== "ativos") sp.set("filter", filter);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

export function ClientesView({ data, selectedClient, selectedProfile, drawerMode }: Props) {
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

  function openClient(id: string) {
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
        title="Clientes"
        subtitle={`${data.total.toLocaleString("pt-BR")} registro(s)`}
        actions={
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Novo cliente
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar panel-toolbar-split">
          <CadastroSearch
            action="/clientes"
            q={data.q}
            placeholder="Nome, telefone ou e-mail"
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
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Pontos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                data.rows.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedClient?.id === c.id ? "is-selected" : undefined}
                    onClick={() => openClient(c.id)}
                  >
                    <td className="cell-strong">{c.name}</td>
                    <td>{formatPhone(c.phone)}</td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c.loyaltyPoints.toLocaleString("pt-BR")}</td>
                    <td>
                      <StatusBadge
                        active={c.isActive && !c.deletedAt}
                        inactiveLabel={c.deletedAt ? "Removido" : "Inativo"}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-footer">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            basePath="/clientes"
            params={{
              q: data.q || undefined,
              filter: data.filter !== "ativos" ? data.filter : undefined,
            }}
          />
        </div>
      </section>

      <ClientDrawer
        open={drawerOpen}
        mode={drawerMode === "new" ? "new" : "edit"}
        client={drawerMode === "edit" ? selectedClient : null}
        profile={drawerMode === "edit" ? selectedProfile : null}
        onClose={closeDrawer}
        onSaved={onSaved}
      />
    </>
  );
}
