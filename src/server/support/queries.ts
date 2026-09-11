import { and, asc, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { roleLabel } from "../permissions/roles";
import type { SupportMessageDto, SupportThreadDto } from "@/lib/support-types";

export type { SupportMessageDto, SupportThreadDto };

export async function assertCanUseSupport() {
  const session = await requireSession();
  const tenant = await requireTenantContext();
  if (!hasCapability(session.role, "support.use")) {
    throw new ForbiddenError("Sem permissão para suporte");
  }
  return { session, tenant };
}

/** Thread do usuário atual na unidade (cria se não existir). */
export async function getOrCreateSupportThread(): Promise<SupportThreadDto> {
  const { session, tenant } = await assertCanUseSupport();
  const db = createDb();

  let [thread] = await db
    .select()
    .from(schema.supportThreads)
    .where(
      and(
        eq(schema.supportThreads.tenantId, tenant.id),
        eq(schema.supportThreads.userId, session.user.id)
      )
    )
    .orderBy(desc(schema.supportThreads.updatedAt))
    .limit(1);

  if (!thread) {
    [thread] = await db
      .insert(schema.supportThreads)
      .values({
        tenantId: tenant.id,
        userId: session.user.id,
        status: "ai",
        meta: {
          role: session.role,
          roleLabel: roleLabel(session.role),
          userName: session.user.name,
        },
      })
      .returning();
  }

  const messages = await db
    .select({
      id: schema.supportMessages.id,
      role: schema.supportMessages.role,
      body: schema.supportMessages.body,
      createdAt: schema.supportMessages.createdAt,
    })
    .from(schema.supportMessages)
    .where(
      and(
        eq(schema.supportMessages.tenantId, tenant.id),
        eq(schema.supportMessages.threadId, thread.id)
      )
    )
    .orderBy(asc(schema.supportMessages.createdAt))
    .limit(200);

  return {
    id: thread.id,
    status: thread.status === "human" ? "human" : "ai",
    humanRequestedAt: thread.humanRequestedAt?.toISOString() ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
