import { AgendaView } from "@/components/agenda/AgendaView";
import {
  getAgendaDay,
  getAgendaPermissions,
  listServicesForAgenda,
} from "@/server/agenda";
import {
  getOrderDetail,
  getOrderPermissions,
  listCatalogForOrders,
} from "@/server/orders";
import { NotFoundError } from "@/server/errors";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string; staff?: string; modo?: string; comanda?: string }>;
};

export default async function AgendaPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/agenda", sp);
  const tabletMode = sp.modo === "tablet";

  const [data, services, permissions] = await Promise.all([
    getAgendaDay(sp.date, sp.staff),
    listServicesForAgenda(),
    getAgendaPermissions(),
  ]);

  let selectedOrder = null;
  let orderCatalog = undefined;
  let orderPermissions = undefined;

  if (sp.comanda) {
    try {
      const [order, catalog, orderPerms] = await Promise.all([
        getOrderDetail(sp.comanda),
        listCatalogForOrders(),
        getOrderPermissions(),
      ]);
      selectedOrder = order;
      orderCatalog = catalog;
      orderPermissions = orderPerms;
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <AgendaView
      data={data}
      services={services}
      permissions={permissions}
      staffFilter={sp.staff}
      tabletMode={tabletMode}
      orderCatalog={orderCatalog}
      orderPermissions={orderPermissions}
      selectedOrder={selectedOrder}
    />
  );
}
