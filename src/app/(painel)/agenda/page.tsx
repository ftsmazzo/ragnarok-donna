import { AgendaView } from "@/components/agenda/AgendaView";
import {
  getAgendaDay,
  getAgendaPermissions,
  listServicesForAgenda,
} from "@/server/agenda";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string; staff?: string; modo?: string }>;
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

  return (
    <AgendaView
      data={data}
      services={services}
      permissions={permissions}
      staffFilter={sp.staff}
      tabletMode={tabletMode}
    />
  );
}
