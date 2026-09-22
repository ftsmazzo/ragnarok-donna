import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { NewBankAccountButton } from "@/components/financeiro/NewBankAccountButton";
import { BankStatementTable } from "@/components/financeiro/BankStatementTable";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";
import {
  getTreasuryPermissions,
  listBankAccounts,
  listBankStatement,
} from "@/server/treasury";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ bank?: string }>;
};

export default async function BancosPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/financeiro/bancos", sp);
  const [banks, permissions] = await Promise.all([
    listBankAccounts(),
    getTreasuryPermissions(),
  ]);
  const selectedId = sp.bank || banks[0]?.id;
  const statement = selectedId
    ? await listBankStatement({ bankAccountId: selectedId })
    : null;

  return (
    <>
      <PageHeader
        title="Bancos / extrato"
        subtitle="Conciliação manual · separado do caixa de turno"
        actions={
          <>
            <Link href="/financeiro" className="btn btn-ghost">
              Tesouraria
            </Link>
            <NewBankAccountButton canWrite={permissions.canWrite} />
          </>
        }
      />

      <section className="panel" style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {banks.map((b) => (
            <Link
              key={b.id}
              href={`/financeiro/bancos?bank=${b.id}`}
              className={`btn btn-sm ${b.id === selectedId ? "btn-primary" : "btn-outline"}`}
            >
              {b.name}
            </Link>
          ))}
          {!banks.length ? <p className="muted">Nenhuma conta — cadastre ou importe o seed Donna.</p> : null}
        </div>
      </section>

      {statement ? (
        <section className="panel">
          <div className="panel-toolbar" style={{ marginBottom: 8 }}>
            <strong>Saldo abertura: {formatMoney(statement.openingBalanceCents)}</strong>
            <strong>Saldo calculado: {formatMoney(statement.balanceCents)}</strong>
          </div>
          <BankStatementTable entries={statement.entries} canWrite={permissions.canWrite} />
        </section>
      ) : null}
    </>
  );
}
