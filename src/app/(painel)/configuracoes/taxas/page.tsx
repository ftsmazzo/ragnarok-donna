import { PageHeader } from "@/components/shell/PageHeader";
import { PaymentFeesForm } from "@/components/config/PaymentFeesForm";
import { getPaymentFeesForm } from "@/server/tenant/payment-fees";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function TaxasPage() {
  await requirePageAccess("/configuracoes/taxas");
  const initial = await getPaymentFeesForm();

  return (
    <>
      <PageHeader
        title="Taxas da maquininha"
        subtitle="Inserir / editar % por bandeira e parcelas — líquido do Caixa"
      />
      <section className="panel">
        <div className="panel-body">
          <PaymentFeesForm initial={initial} />
        </div>
      </section>
    </>
  );
}
