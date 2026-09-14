import { Suspense } from "react";
import { HistoricoComandasView } from "@/components/comandas/HistoricoComandasView";
import { NotFoundError } from "@/server/errors";
import { requirePageAccess } from "@/server/permissions/page-access";
import {
  getOrderDetail,
  getOrderPermissions,
  listCatalogForOrders,
  listOrderHistory,
} from "@/server/orders";
import type { OrderStatus } from "@/server/orders/types";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    q?: string;
    page?: string;
    id?: string;
  }>;
};

export default async function ComandasHistoricoPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/comandas/historico", sp);
  const status = (sp.status as OrderStatus | "all") || "all";
  const [data, catalog, permissions] = await Promise.all([
    listOrderHistory({
      from: sp.from,
      to: sp.to,
      status,
      q: sp.q,
      page: Number(sp.page) || 1,
    }),
    listCatalogForOrders(),
    getOrderPermissions(),
  ]);

  let selectedOrder = null;
  if (sp.id) {
    try {
      selectedOrder = await getOrderDetail(sp.id);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <Suspense fallback={<p className="panel-empty">Carregando histórico…</p>}>
      <HistoricoComandasView
        data={data}
        selectedOrder={selectedOrder}
        services={catalog.services}
        products={catalog.products}
        packages={catalog.packages}
        staff={catalog.staff}
        permissions={permissions}
      />
    </Suspense>
  );
}
