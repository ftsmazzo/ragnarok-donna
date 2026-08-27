import { Suspense } from "react";
import { ConversasMobileApp } from "@/components/pwa/ConversasMobileApp";
import {
  ensureDefaultAgentProfile,
  getConversation,
  listConversations,
  type ConversationFilter,
} from "@/server/agent";
import { requireTenantContext } from "@/server/context/tenant";
import { NotFoundError } from "@/server/errors";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ id?: string; filter?: string }>;
};

export default async function PwaConversasPage({ searchParams }: Props) {
  await requirePageAccess("/pwa/conversas");
  const tenant = await requireTenantContext();
  await ensureDefaultAgentProfile({
    tenantId: tenant.id,
    displayName: "Donna",
    businessName: tenant.name,
  });

  const sp = await searchParams;
  const filter: ConversationFilter =
    sp.filter === "ai" || sp.filter === "human" ? sp.filter : "todas";
  const data = await listConversations({ filter });

  let selected = null;
  if (sp.id) {
    try {
      selected = await getConversation(sp.id);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <Suspense fallback={<p className="panel-empty">Carregando…</p>}>
      <ConversasMobileApp rows={data.rows} filter={filter} selected={selected} />
    </Suspense>
  );
}
