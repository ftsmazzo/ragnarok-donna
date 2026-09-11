import { Suspense } from "react";
import { ConsumoMobileApp } from "@/components/pwa/ConsumoMobileApp";
import { resolveTenantBrand } from "@/lib/brand";
import { requireTenantContext } from "@/server/context/tenant";
import { listCatalogForOrders, listOpenOrders } from "@/server/orders";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function PwaConsumoPage() {
  await requirePageAccess("/pwa/consumo");
  const tenant = await requireTenantContext();
  const brand = resolveTenantBrand({
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  });

  const [ordersData, catalog] = await Promise.all([listOpenOrders(), listCatalogForOrders()]);

  return (
    <Suspense fallback={<p className="panel-empty">Carregando…</p>}>
      <ConsumoMobileApp
        brandName={brand.displayName}
        orders={ordersData.rows.map((o) => ({
          id: o.id,
          clientName: o.clientName,
          totalCents: o.totalCents,
          itemCount: o.itemCount,
        }))}
        products={catalog.products.map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
          stockQty: p.stockQty ?? 0,
        }))}
      />
    </Suspense>
  );
}
