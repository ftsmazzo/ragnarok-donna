import { Suspense } from "react";
import { ConversasView } from "@/components/conversas/ConversasView";
import {
  ensureDefaultAgentProfile,
  getConversation,
  listConversations,
  SKILL_CATALOG,
  TOOL_CATALOG,
  type ConversationFilter,
} from "@/server/agent";
import { getWhatsAppConnection } from "@/server/agent/connection";
import { requireTenantContext } from "@/server/context/tenant";
import { NotFoundError } from "@/server/errors";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ id?: string; filter?: string }>;
};

export default async function ConversasPage({ searchParams }: Props) {
  await requirePageAccess("/conversas");
  const tenant = await requireTenantContext();
  await ensureDefaultAgentProfile({ tenantId: tenant.id, displayName: "Donna" });

  const sp = await searchParams;
  const filter: ConversationFilter =
    sp.filter === "ai" || sp.filter === "human" ? sp.filter : "todas";
  const data = await listConversations({ filter });
  const whatsApp = await getWhatsAppConnection();

  let selected = null;
  if (sp.id) {
    try {
      selected = await getConversation(sp.id);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <Suspense fallback={<p className="panel-empty">Carregando conversas…</p>}>
      <ConversasView
        tenantName={tenant.name}
        data={data}
        selected={selected}
        toolCount={TOOL_CATALOG.length}
        skillTitles={SKILL_CATALOG.map((s) => ({
          name: s.name,
          title: s.title,
          description: s.description,
        }))}
        whatsApp={whatsApp}
      />
    </Suspense>
  );
}
