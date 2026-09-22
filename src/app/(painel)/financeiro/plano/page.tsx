import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { NewChartAccountButton } from "@/components/financeiro/NewChartAccountButton";
import { requirePageAccess } from "@/server/permissions/page-access";
import { getTreasuryPermissions, listChartAccounts } from "@/server/treasury";

export const dynamic = "force-dynamic";

export default async function PlanoPage() {
  await requirePageAccess("/financeiro/plano");
  const [accounts, permissions] = await Promise.all([
    listChartAccounts({ activeOnly: false }),
    getTreasuryPermissions(),
  ]);

  return (
    <>
      <PageHeader
        title="Plano de contas"
        subtitle="Hierarquia APR · mapeamento DFC/DRE"
        actions={
          <>
            <Link href="/financeiro" className="btn btn-ghost">
              Tesouraria
            </Link>
            <NewChartAccountButton canWrite={permissions.canWrite} />
          </>
        }
      />

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Analítica</th>
                <th>Sintética</th>
                <th>DFC</th>
                <th>DRE</th>
                <th>Ativa</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.syntheticName ?? "—"}</td>
                  <td>
                    {[a.dfcGroup1, a.dfcGroup2].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td>
                    {[a.dreGroup1, a.dreGroup2].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td>{a.active ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!accounts.length ? (
          <p className="muted" style={{ padding: 16 }}>
            Vazio — use “Importar plano Donna” na home da tesouraria.
          </p>
        ) : null}
      </section>
    </>
  );
}
