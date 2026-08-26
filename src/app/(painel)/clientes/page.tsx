import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { FilterTabs } from "@/components/cadastro/FilterTabs";
import { Pagination } from "@/components/cadastro/Pagination";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { listClients, type ClientFilter } from "@/lib/cadastros";
import { formatPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
};

function filterHref(filter: ClientFilter, q?: string) {
  const sp = new URLSearchParams();
  if (filter !== "ativos") sp.set("filter", filter);
  if (q) sp.set("q", q);
  const qs = sp.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

export default async function ClientesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = (sp.filter as ClientFilter) || "ativos";
  const page = Number(sp.page) || 1;
  const data = await listClients({ q: sp.q, filter, page });

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${data.total.toLocaleString("pt-BR")} registro(s) · import AppBarber`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
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
            hidden={{ filter: filter !== "ativos" ? filter : undefined }}
          />
          <FilterTabs
            tabs={[
              { label: "Ativos", href: filterHref("ativos", data.q), active: filter === "ativos" },
              {
                label: "Removidos",
                href: filterHref("removidos", data.q),
                active: filter === "removidos",
              },
              { label: "Todos", href: filterHref("todos", data.q), active: filter === "todos" },
            ]}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
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
                  <tr key={c.id}>
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
            params={{ q: data.q || undefined, filter: filter !== "ativos" ? filter : undefined }}
          />
        </div>
      </section>
    </>
  );
}
