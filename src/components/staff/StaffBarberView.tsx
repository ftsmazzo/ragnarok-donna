"use client";

import type { StaffDetail } from "@/server/staff/queries";
import type { StaffPerformance } from "@/server/staff/performance";
import { PageHeader } from "@/components/shell/PageHeader";
import { StaffPerformancePanel } from "@/components/staff/StaffPerformancePanel";

type Props = {
  staff: StaffDetail;
  performance: StaffPerformance;
  perfFrom: string;
  perfTo: string;
};

export function StaffBarberView({ staff, performance }: Props) {
  return (
    <>
      <PageHeader title="Minha performance" subtitle={staff.name} />
      <section className="panel">
        <div className="panel-body">
          <StaffPerformancePanel staffId={staff.id} performance={performance} />
        </div>
      </section>
    </>
  );
}
