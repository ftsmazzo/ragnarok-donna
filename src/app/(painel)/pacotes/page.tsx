import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { listPackages } from "@/lib/cadastros";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PacotesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listPackages({ q: sp.q });

  return (
    <>
      <PageHeader
        title="Pacotes"
        subtitle={`${data.total} pacote(s) · combos e sessões`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
            + Novo pacote
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch action="/pacotes" q={data.q} placeholder="Nome do pacote" />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pacote</th>
                <th>Itens</th>
                <th>Preço</th>
                <th>Online</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Nenhum pacote encontrado.
                  </td>
                </tr>
              ) : (
                data.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">
                      {p.name}
                      {p.description ? (
                        <small className="cell-meta">{p.description.slice(0, 80)}</small>
                      ) : null}
                    </td>
                    <td>{p.itemCount}</td>
                    <td>{formatMoney(p.priceCents)}</td>
                    <td>
                      <StatusBadge
                        active={p.bookableOnline}
                        activeLabel="Sim"
                        inactiveLabel="Não"
                      />
                    </td>
                    <td>
                      <StatusBadge active={p.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
