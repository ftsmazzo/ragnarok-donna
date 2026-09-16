import { and, desc, eq, lt } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { ForbiddenError } from "../errors";
import { requireSession, requireTenantContext } from "../context/tenant";
import { hasCapability } from "../permissions/capabilities";
import { roleLabel } from "../permissions/roles";
import type { SupportMessageDto, SupportThreadDto } from "@/lib/support-types";
import {
  SUPPORT_HANDOFF_CLAIM_STALE_MS,
  toChronologicalOrder,
} from "./reliability";

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
    await db
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
      .onConflictDoNothing();

    [thread] = await db
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
  }

  if (!thread) {
    throw new Error("Não foi possível criar a conversa de suporte");
  }

  if (
    thread.status === "notifying" &&
    Date.now() - thread.updatedAt.getTime() > SUPPORT_HANDOFF_CLAIM_STALE_MS
  ) {
    const cutoff = new Date(Date.now() - SUPPORT_HANDOFF_CLAIM_STALE_MS);
    const [recovered] = await db
      .update(schema.supportThreads)
      .set({ status: "ai", updatedAt: new Date() })
      .where(
        and(
          eq(schema.supportThreads.id, thread.id),
          eq(schema.supportThreads.tenantId, tenant.id),
          eq(schema.supportThreads.status, "notifying"),
          lt(schema.supportThreads.updatedAt, cutoff)
        )
      )
      .returning({ id: schema.supportThreads.id });
    if (recovered) thread = { ...thread, status: "ai" };
  }

  const recentMessages = await db
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
    .orderBy(
      desc(schema.supportMessages.createdAt),
      desc(schema.supportMessages.id)
    )
    .limit(200);
  const messages = toChronologicalOrder(recentMessages);

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
