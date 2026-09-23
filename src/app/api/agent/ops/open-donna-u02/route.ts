import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Abre a Donna Unidade 02 para operação (agenda/equipe).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 * Body opcional: { "assignUnassignedStaff"?: boolean }
 *
 * - Garante branch unidade-02 ativa
 * - Reporta staff por unidade
 * - Se assignUnassignedStaff: vincula staff sem branch_id à U02 (não move quem já está na U01)
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  const expected = [
    process.env.AUTH_SECRET?.trim(),
    process.env.EVOLUTION_API_KEY?.trim(),
    process.env.AGENT_SERVICE_TOKEN?.trim(),
  ].filter(Boolean);
  if (!auth || !expected.includes(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let assignUnassignedStaff = false;
  try {
    const body = (await request.json()) as { assignUnassignedStaff?: boolean };
    assignUnassignedStaff = body.assignUnassignedStaff === true;
  } catch {
    // body opcional
  }

  const db = createDb();
  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, "donna-elegant"))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant donna-elegant não encontrado" }, { status: 404 });
  }

  const branches = await db
    .select({
      id: schema.branches.id,
      slug: schema.branches.slug,
      name: schema.branches.name,
      isActive: schema.branches.isActive,
    })
    .from(schema.branches)
    .where(and(eq(schema.branches.tenantId, tenant.id), isNull(schema.branches.deletedAt)));

  const u02 = branches.find((b) => b.slug === "unidade-02");
  if (!u02) {
    return NextResponse.json({ error: "Branch unidade-02 não encontrada" }, { status: 404 });
  }

  await db
    .update(schema.branches)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(schema.branches.id, u02.id));

  const staffRows = await db
    .select({
      id: schema.staff.id,
      name: schema.staff.name,
      branchId: schema.staff.branchId,
      isActive: schema.staff.isActive,
      isBookable: schema.staff.isBookable,
    })
    .from(schema.staff)
    .where(and(eq(schema.staff.tenantId, tenant.id), isNull(schema.staff.deletedAt)));

  const byBranch: Record<string, { id: string; name: string }[]> = {
    "unidade-01": [],
    "unidade-02": [],
    "(sem unidade)": [],
  };
  for (const s of staffRows) {
    const b = branches.find((x) => x.id === s.branchId);
    const key = b?.slug ?? "(sem unidade)";
    if (!byBranch[key]) byBranch[key] = [];
    byBranch[key].push({ id: s.id, name: s.name });
  }

  let assignedToU02 = 0;
  if (assignUnassignedStaff) {
    const result = await db
      .update(schema.staff)
      .set({ branchId: u02.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.staff.tenantId, tenant.id),
          isNull(schema.staff.branchId),
          isNull(schema.staff.deletedAt)
        )
      )
      .returning({ id: schema.staff.id, name: schema.staff.name });
    assignedToU02 = result.length;
  }

  // Memberships staff com branch U02 mas staff.branch_id diferente → alinhar
  const membershipsU02 = await db
    .select({
      userId: schema.memberships.userId,
      staffId: schema.staff.id,
      staffName: schema.staff.name,
      staffBranchId: schema.staff.branchId,
    })
    .from(schema.memberships)
    .innerJoin(schema.staff, eq(schema.staff.userId, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.tenantId, tenant.id),
        eq(schema.memberships.role, "staff"),
        eq(schema.memberships.branchId, u02.id),
        isNull(schema.staff.deletedAt)
      )
    );

  let alignedFromMembership = 0;
  for (const m of membershipsU02) {
    if (m.staffBranchId !== u02.id) {
      await db
        .update(schema.staff)
        .set({ branchId: u02.id, updatedAt: new Date() })
        .where(eq(schema.staff.id, m.staffId));
      alignedFromMembership += 1;
    }
  }

  const staffU02After = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.tenantId, tenant.id),
        eq(schema.staff.branchId, u02.id),
        isNull(schema.staff.deletedAt)
      )
    );

  return NextResponse.json({
    ok: true,
    branch: { slug: u02.slug, name: u02.name, isActive: true },
    staffBefore: Object.fromEntries(
      Object.entries(byBranch).map(([k, v]) => [k, { count: v.length, names: v.map((x) => x.name) }])
    ),
    assignedUnassignedToU02: assignedToU02,
    alignedFromMembership,
    staffOnU02Now: Number(staffU02After[0]?.n ?? 0),
  });
}
