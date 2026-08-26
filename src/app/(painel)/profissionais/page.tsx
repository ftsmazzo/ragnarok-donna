import { Suspense } from "react";
import { ProfissionaisView } from "@/components/staff/ProfissionaisView";
import {
  getStaffMember,
  getStaffStats,
  listStaffMembers,
  type StaffFilter,
} from "@/server/staff";
import { NotFoundError } from "@/server/errors";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; filter?: string; id?: string; novo?: string }>;
};

export default async function ProfissionaisPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = (sp.filter as StaffFilter) || "ativos";
  const data = await listStaffMembers({ q: sp.q, filter });

  let selectedStaff = null;
  let selectedStats = null;
  let drawerMode: "none" | "new" | "edit" = "none";

  if (sp.novo === "1") {
    drawerMode = "new";
  } else if (sp.id) {
    try {
      selectedStaff = await getStaffMember(sp.id);
      selectedStats = await getStaffStats(sp.id);
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
        selectedStats={selectedStats}
        drawerMode={drawerMode}
      />
    </Suspense>
  );
}
