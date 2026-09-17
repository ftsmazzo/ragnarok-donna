import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/shell/PageHeader";
import { StockMovementClient } from "@/components/cadastro/StockMovementClient";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "@/server/context/tenant";
import { listRecentStockMovements } from "@/server/catalog/stock";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function EstoqueMovimentacaoPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/produtos/movimentacao", sp);
  const tenant = await requireTenantContext();
  const db = createDb();

  const [products, movements] = await Promise.all([
    db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        stockQty: schema.products.stockQty,
      })
      .from(schema.products)
      .where(
        and(eq(schema.products.tenantId, tenant.id), isNull(schema.products.deletedAt))
      )
      .orderBy(asc(schema.products.name)),
    listRecentStockMovements({ limit: 50 }),
  ]);

  return (
    <>
      <PageHeader
        title="Entrada / saída de estoque"
        subtitle="Ledger operacional — compra, ajuste, uso interno e perdas"
        actions={
          <>
            <Link href="/produtos" className="btn btn-outline">
              Cadastro
            </Link>
            <Link href="/relatorios/estoque" className="btn btn-outline">
              Relatório
            </Link>
          </>
        }
      />
      <section className="panel">
        <div className="panel-body">
          <StockMovementClient products={products} movements={movements} />
        </div>
      </section>
    </>
  );
}
