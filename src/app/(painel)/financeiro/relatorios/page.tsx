import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatMoney } from "@/lib/format";
import { todaySp } from "@/lib/datetime";
import { requirePageAccess } from "@/server/permissions/page-access";
import { reportDre, reportFcd, reportFcm } from "@/server/treasury";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string; month?: string; tab?: string }>;
};

export default async function RelatoriosFinanceiroPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/financeiro/relatorios", sp);
  const today = todaySp();
  const year = Number(sp.year) || Number(today.slice(0, 4));
  const month = Number(sp.month) || Number(today.slice(5, 7));
  const tab = sp.tab === "fcd" || sp.tab === "dre" ? sp.tab : "fcm";

  const [fcm, fcd, dre] = await Promise.all([
    reportFcm({ year }),
    reportFcd({ year, month, mode: "due" }),
    reportDre({ from: `${year}-01-01`, to: `${year}-12-31` }),
  ]);

  return (
    <>
      <PageHeader
        title="Relatórios DFC"
        subtitle="FCM 12 meses · FCD diário · DRE por competência"
        actions={
          <Link href="/financeiro" className="btn btn-ghost">
            Tesouraria
          </Link>
        }
      />

      <nav className="panel-toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <Link
          href={`/financeiro/relatorios?tab=fcm&year=${year}`}
          className={`btn btn-sm ${tab === "fcm" ? "btn-primary" : "btn-outline"}`}
        >
          FCM
        </Link>
        <Link
          href={`/financeiro/relatorios?tab=fcd&year=${year}&month=${month}`}
          className={`btn btn-sm ${tab === "fcd" ? "btn-primary" : "btn-outline"}`}
        >
          FCD
        </Link>
        <Link
          href={`/financeiro/relatorios?tab=dre&year=${year}`}
          className={`btn btn-sm ${tab === "dre" ? "btn-primary" : "btn-outline"}`}
        >
          DRE
        </Link>
        <form method="get" style={{ display: "flex", gap: 6, alignItems: "end" }}>
          <input type="hidden" name="tab" value={tab} />
          <label>
            Ano
            <input name="year" type="number" defaultValue={year} className="search-input" style={{ width: 90 }} />
          </label>
          {tab === "fcd" ? (
            <label>
              Mês
              <input name="month" type="number" min={1} max={12} defaultValue={month} className="search-input" style={{ width: 70 }} />
            </label>
          ) : null}
          <button type="submit" className="btn btn-outline btn-sm">
            Atualizar
          </button>
        </form>
      </nav>

      {tab === "fcm" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th style={{ textAlign: "right" }}>Forecast +</th>
                  <th style={{ textAlign: "right" }}>Forecast −</th>
                  <th style={{ textAlign: "right" }}>Budget +</th>
                  <th style={{ textAlign: "right" }}>Budget −</th>
                  <th style={{ textAlign: "right" }}>Real +</th>
                  <th style={{ textAlign: "right" }}>Real −</th>
                </tr>
              </thead>
              <tbody>
                {fcm.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.forecastIn)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.forecastOut)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.budgetIn)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.budgetOut)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.actualIn)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(m.actualOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "fcd" ? (
        <section className="panel">
          <p className="muted" style={{ padding: "8px 12px" }}>
            Abertura consolidada: {formatMoney(fcd.openingCents)}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th style={{ textAlign: "right" }}>Entradas</th>
                  <th style={{ textAlign: "right" }}>Saídas</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {fcd.days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(d.inCents)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(d.outCents)}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(d.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "dre" ? (
        <section className="panel">
          <p className="muted" style={{ padding: "8px 12px" }}>
            Receitas {formatMoney(dre.totalRevenue)} · Despesas {formatMoney(dre.totalExpense)} ·
            Resultado {formatMoney(dre.totalRevenue - dre.totalExpense)}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grupo I</th>
                  <th>Grupo II</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {dre.lines.map((l) => (
                  <tr key={`${l.group1}-${l.group2}`}>
                    <td>{l.group1}</td>
                    <td>{l.group2}</td>
                    <td style={{ textAlign: "right" }}>{formatMoney(l.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
