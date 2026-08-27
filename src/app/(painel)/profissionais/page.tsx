import { Suspense } from "react";
import { ProfissionaisView } from "@/components/staff/ProfissionaisView";
import { isManagementRole, requireSession } from "@/server/context/tenant";
import {
  getStaffMember,
  getStaffPerformance,
  listStaffMembers,
  type StaffFilter,
} from "@/server/staff";
import { NotFoundError } from "@/server/errors";
import { monthStartSp, todaySp } from "@/lib/datetime";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    id?: string;
    novo?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function ProfissionaisPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = (sp.filter as StaffFilter) || "ativos";
  const data = await listStaffMembers({ q: sp.q, filter });

  const perfFrom = sp.from ?? monthStartSp();
  const perfTo = sp.to ?? todaySp();

  let selectedStaff = null;
  let selectedPerformance = null;
  let drawerMode: "none" | "new" | "edit" = "none";

  if (sp.novo === "1") {
    drawerMode = "new";
  } else if (sp.id) {
    try {
      const session = await requireSession();
      selectedStaff = await getStaffMember(sp.id);
      selectedPerformance = await getStaffPerformance(sp.id, {
        from: perfFrom,
        to: perfTo,
        includeManagementMetrics: isManagementRole(session.role),
      });
      drawerMode = "edit";
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <Suspense fallback={<p className="panel-empty">Carregando profissionais…</p>}>
      <ProfissionaisView
        data={data}
        selectedStaff={selectedStaff}
        selectedPerformance={selectedPerformance}
        drawerMode={drawerMode}
      />
    </Suspense>
  );
}
