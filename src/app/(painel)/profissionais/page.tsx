import { Suspense } from "react";
import { ProfissionaisView } from "@/components/staff/ProfissionaisView";
import { StaffBarberView } from "@/components/staff/StaffBarberView";
import {
  getStaffMember,
  getStaffPerformance,
  listStaffMembers,
  type StaffFilter,
} from "@/server/staff";
import { NotFoundError } from "@/server/errors";
import { listTenantBranches } from "@/server/context/branch";
import { monthStartSp, todaySp } from "@/lib/datetime";
import {
  assertOwnStaffAccess,
  isBarberRole,
  isOwnerOnlyInsights,
  requireOwnStaffId,
  requirePageAccess,
} from "@/server/permissions";

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
  const session = await requirePageAccess("/profissionais", sp);

  const perfFrom = sp.from ?? monthStartSp();
  const perfTo = sp.to ?? todaySp();

  if (isBarberRole(session.role)) {
    const staffId = sp.id ?? (await requireOwnStaffId(session));
    await assertOwnStaffAccess(session, staffId);
    const [staff, performance] = await Promise.all([
      getStaffMember(staffId),
      getStaffPerformance(staffId, {
        from: perfFrom,
        to: perfTo,
        includeManagementMetrics: false,
      }),
    ]);

    return (
      <StaffBarberView
        staff={staff}
        performance={performance}
        perfFrom={perfFrom}
        perfTo={perfTo}
      />
    );
  }

  const filter = (sp.filter as StaffFilter) || "ativos";
  const [data, branches] = await Promise.all([
    listStaffMembers({ q: sp.q, filter }),
    listTenantBranches(session.tenant.id),
  ]);

  let selectedStaff = null;
  let selectedPerformance = null;
  let drawerMode: "none" | "new" | "edit" = "none";

  if (sp.novo === "1") {
    drawerMode = "new";
  } else if (sp.id) {
    try {
      selectedStaff = await getStaffMember(sp.id);
      selectedPerformance = await getStaffPerformance(sp.id, {
        from: perfFrom,
        to: perfTo,
        includeManagementMetrics: isOwnerOnlyInsights(session.role),
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
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        defaultBranchId={session.branch?.id ?? branches[0]?.id ?? null}
      />
    </Suspense>
  );
}
