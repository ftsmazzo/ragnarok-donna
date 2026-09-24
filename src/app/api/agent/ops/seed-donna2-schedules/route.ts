import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Registra jornadas Donna 2 com almoço escalonado (2 turnos).
 * Auth: Bearer AUTH_SECRET | EVOLUTION_API_KEY | AGENT_SERVICE_TOKEN
 *
 * Almoço 11–12: Anna, Caroline, Gabrielli, Luciene, Paola
 * Almoço 12–13: Beatriz, Eliane, Igor, Nat
 * Expediente padrão: 09:00–19:00, seg–sáb (domingo sem jornada).
 */
const LUNCH_11 = {
  keys: ["anna", "caroline", "gabriell", "luciene", "paola"],
  turn1: { start: "09:00", end: "11:00" },
  turn2: { start: "12:00", end: "19:00" },
};

const LUNCH_12 = {
  keys: ["beatriz", "eliane", "igor", "nat"],
  turn1: { start: "09:00", end: "12:00" },
  turn2: { start: "13:00", end: "19:00" },
};

function fold(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchGroup(name: string): typeof LUNCH_11 | typeof LUNCH_12 | null {
  const n = fold(name);
  if (LUNCH_11.keys.some((k) => n.includes(k))) return LUNCH_11;
  // "nat" não pode pegar "natalia" de outras — ok; evita "anna"
  if (LUNCH_12.keys.some((k) => (k === "nat" ? /\bnat\b|^nat/i.test(n) || n.startsWith("nat") : n.includes(k)))) {
    return LUNCH_12;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    const expected = [
      process.env.AUTH_SECRET?.trim(),
      process.env.EVOLUTION_API_KEY?.trim(),
      process.env.AGENT_SERVICE_TOKEN?.trim(),
    ].filter(Boolean);
    if (!auth || !expected.includes(auth)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createDb();
    const [tenant] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "donna-elegant"))
      .limit(1);
    if (!tenant) {
      return NextResponse.json({ error: "tenant donna-elegant não encontrado" }, { status: 404 });
    }

    const [branch] = await db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(
        and(eq(schema.branches.tenantId, tenant.id), eq(schema.branches.slug, "unidade-02"))
      )
      .limit(1);
    if (!branch) {
      return NextResponse.json({ error: "unidade-02 não encontrada" }, { status: 404 });
    }

    const staffRows = await db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.tenantId, tenant.id),
          eq(schema.staff.branchId, branch.id),
          isNull(schema.staff.deletedAt)
        )
      );

    const matched: { id: string; name: string; lunch: string }[] = [];
    const skipped: string[] = [];

    for (const s of staffRows) {
      const group = matchGroup(s.name);
      if (!group) {
        skipped.push(s.name);
        continue;
      }
      matched.push({
        id: s.id,
        name: s.name,
        lunch: group === LUNCH_11 ? "11:00-12:00" : "12:00-13:00",
      });
    }

    const weekdays = [1, 2, 3, 4, 5, 6]; // seg–sáb
    let inserted = 0;

    await db.transaction(async (tx) => {
      const ids = matched.map((m) => m.id);
      if (ids.length) {
        await tx
          .delete(schema.staffSchedules)
          .where(
            and(
              eq(schema.staffSchedules.tenantId, tenant.id),
              inArray(schema.staffSchedules.staffId, ids)
            )
          );
      }

      const values: {
        tenantId: string;
        staffId: string;
        branchId: string;
        weekday: number;
        slotIndex: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }[] = [];

      for (const m of matched) {
        const group = matchGroup(m.name)!;
        for (const wd of weekdays) {
          values.push({
            tenantId: tenant.id,
            staffId: m.id,
            branchId: branch.id,
            weekday: wd,
            slotIndex: 1,
            startTime: group.turn1.start,
            endTime: group.turn1.end,
            isActive: true,
          });
          values.push({
            tenantId: tenant.id,
            staffId: m.id,
            branchId: branch.id,
            weekday: wd,
            slotIndex: 2,
            startTime: group.turn2.start,
            endTime: group.turn2.end,
            isActive: true,
          });
        }
      }

      if (values.length) {
        await tx.insert(schema.staffSchedules).values(values);
        inserted = values.length;
      }
    });

    return NextResponse.json({
      ok: true,
      branch: branch.name,
      matched,
      skipped,
      insertedSlots: inserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ops/seed-donna2-schedules]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
