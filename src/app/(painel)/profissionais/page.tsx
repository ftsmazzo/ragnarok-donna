import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { PersonAvatar } from "@/components/cadastro/PersonAvatar";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { listStaff } from "@/lib/cadastros";
import { formatCommission, formatPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProfissionaisPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { rows, total } = await listStaff();
  const q = sp.q?.trim().toLowerCase() ?? "";
  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.nickname?.toLowerCase().includes(q) ?? false) ||
          (r.phone?.includes(q) ?? false)
      )
    : rows;

  return (
    <>
      <PageHeader
        title="Profissionais"
        subtitle={`${total} profissional(is) · equipe bookable`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
            + Novo profissional
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch action="/profissionais" q={sp.q} placeholder="Nome ou telefone" />
        </div>

        <div className="table-wrap">
          <table className="data-table">
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhum profissional encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
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
