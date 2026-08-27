import { and, asc, eq, isNull } from "drizzle-orm";
import { CaixaView } from "@/components/caixa/CaixaView";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "@/server/context/tenant";
import { getCashDay, getCashPermissions } from "@/server/finance";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ date?: string }>;
};

export default async function CaixaPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/caixa", sp);
  const tenant = await requireTenantContext();
  const db = createDb();

  const [data, permissions, staffList] = await Promise.all([
    getCashDay(sp.date),
    getCashPermissions(),
    db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt)))
      .orderBy(asc(schema.staff.name)),
  ]);

  return <CaixaView data={data} permissions={permissions} staffList={staffList} />;
}
