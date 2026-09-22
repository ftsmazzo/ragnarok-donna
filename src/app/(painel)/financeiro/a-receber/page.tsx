import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { FinanceEntriesTable } from "@/components/financeiro/FinanceEntriesTable";
import { NewFinanceEntryButton } from "@/components/financeiro/NewFinanceEntryButton";
import { PeriodPresets } from "@/components/relatorio/PeriodPresets";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { formatMoney } from "@/lib/format";
import { resolveReportPeriod } from "@/lib/datetime";
import { requirePageAccess } from "@/server/permissions/page-access";
import {
  getTreasuryPermissions,
  listBankAccounts,
  listChartAccounts,
  listReceivables,
  listTreasuryPaymentMethods,
} from "@/server/treasury";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; period?: string; situation?: string }>;
};

export default async function AReceberPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/financeiro/a-receber", sp);
  const period = resolveReportPeriod({ period: sp.period, from: sp.from, to: sp.to });
  const situation =
    sp.situation === "overdue" ||
    sp.situation === "this_week" ||
    sp.situation === "open" ||
    sp.situation === "settled" ||
    sp.situation === "all_open"
      ? sp.situation
      : "all_open";

  const [entries, permissions, charts, banks, methods] = await Promise.all([
    listReceivables({
      from: period.from,
      to: period.to,
      dateField: "due",
      situation,
    }),
    getTreasuryPermissions(),
    listChartAccounts(),
    listBankAccounts(),
    listTreasuryPaymentMethods(),
  ]);

  const total = entries.reduce((s, e) => s + e.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Contas a receber"
        subtitle={`${entries.length} títulos · ${formatMoney(total)}`}
        actions={
          <>
            <Link href="/financeiro" className="btn btn-ghost">
              Tesouraria
            </Link>
            <NewFinanceEntryButton
              direction="credit"
              chartAccounts={charts}
              bankAccounts={banks}
              paymentMethods={methods}
              canWrite={permissions.canWrite}
            />
          </>
        }
      />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
          <PeriodPresets
            basePath="/financeiro/a-receber"
            period={period.period}
            from={period.from}
            to={period.to}
            extraParams={{ situation }}
          />
          <RelatorioFilters action="/financeiro/a-receber" from={period.from} to={period.to}>
            <label className="filter-field">
              <span>Situação</span>
              <select name="situation" defaultValue={situation} className="search-input">
                <option value="all_open">Abertos</option>
                <option value="overdue">Atrasados</option>
                <option value="this_week">Na semana</option>
                <option value="open">Aberto</option>
                <option value="settled">Realizados</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>
      </section>

      <section className="panel">
        <FinanceEntriesTable entries={entries} canWrite={permissions.canWrite} />
      </section>
    </>
  );
}
