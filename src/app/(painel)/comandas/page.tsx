import { Suspense } from "react";
import { ComandasView } from "@/components/comandas/ComandasView";
import {
  getOrderDetail,
  getOrderPermissions,
  listCatalogForOrders,
  listOpenOrders,
} from "@/server/orders";
import { NotFoundError } from "@/server/errors";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; id?: string; novo?: string }>;
};

export default async function ComandasPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/comandas", sp);

  const [data, catalog, permissions] = await Promise.all([
    listOpenOrders({ q: sp.q }),
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
    <Suspense fallback={<p className="panel-empty">Carregando comandas…</p>}>
      <ComandasView
        data={data}
        selectedOrder={selectedOrder}
        services={catalog.services}
        products={catalog.products}
        staff={catalog.staff}
        permissions={permissions}
        openNew={sp.novo === "1"}
      />
    </Suspense>
  );
}
