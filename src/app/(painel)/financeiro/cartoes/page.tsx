import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  NewCreditCardButton,
  OpenInvoiceButton,
} from "@/components/financeiro/CreditCardForms";
import { formatMoney } from "@/lib/format";
import { requirePageAccess } from "@/server/permissions/page-access";
import { getTreasuryPermissions, listCreditCards } from "@/server/treasury";

export const dynamic = "force-dynamic";

export default async function CartoesPage() {
  await requirePageAccess("/financeiro/cartoes");
  const [cards, permissions] = await Promise.all([
    listCreditCards(),
    getTreasuryPermissions(),
  ]);

  return (
    <>
      <PageHeader
        title="Cartões de crédito"
        subtitle="Limite, fatura aberta e disponível"
        actions={
          <>
            <Link href="/financeiro" className="btn btn-ghost">
              Tesouraria
            </Link>
            <NewCreditCardButton canWrite={permissions.canWrite} />
          </>
        }
      />

      <div className="overview-grid overview-grid-summary">
        {cards.map((c) => (
          <div key={c.id} className="overview-card is-static" style={{ textAlign: "left" }}>
            <strong>{c.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {c.institution ?? "—"} · fecha dia {c.closingDay} · vence dia {c.dueDay}
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 13 }}>
              <span>Limite: {formatMoney(c.limitCents)}</span>
              <span>Usado / fatura: {formatMoney(c.nextInvoiceCents)}</span>
              <span>Disponível: {formatMoney(c.availableCents)}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <OpenInvoiceButton creditCardId={c.id} canWrite={permissions.canWrite} />
            </div>
          </div>
        ))}
      </div>
      {!cards.length ? (
        <p className="muted" style={{ padding: 16 }}>
          Nenhum cartão cadastrado.
        </p>
      ) : null}
    </>
  );
}
