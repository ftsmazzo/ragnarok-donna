import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { listServices } from "@/lib/cadastros";
import { formatCommission, formatDuration, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ServicosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listServices({ q: sp.q });

  return (
    <>
      <PageHeader
        title="Serviços"
        subtitle={`${data.total} serviço(s) · duração, preço e comissão`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
            + Novo serviço
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch action="/servicos" q={data.q} placeholder="Nome do serviço" />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Categoria</th>
                <th>Duração</th>
                <th>Preço</th>
                <th>Comissão</th>
                <th>Online</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Nenhum serviço encontrado.
                  </td>
                </tr>
              ) : (
                data.rows.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.name}</td>
                    <td>{s.categoryName ?? "—"}</td>
                    <td>{formatDuration(s.durationMin)}</td>
                    <td>{formatMoney(s.priceCents)}</td>
                    <td>{formatCommission(s.commissionBps)}</td>
                    <td>
                      <StatusBadge
                        active={s.bookableOnline}
                        activeLabel="Sim"
                        inactiveLabel="Não"
                      />
                    </td>
                    <td>
                      <StatusBadge active={s.isActive} />
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
