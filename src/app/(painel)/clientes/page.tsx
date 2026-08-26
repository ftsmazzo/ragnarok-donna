import { Suspense } from "react";
import { ClientesView } from "@/components/clients/ClientesView";
import { getClient, getClientProfile, listClients, type ClientFilter } from "@/server/clients";
import { NotFoundError } from "@/server/errors";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; filter?: string; page?: string; id?: string; novo?: string }>;
};

export default async function ClientesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = (sp.filter as ClientFilter) || "ativos";
  const page = Number(sp.page) || 1;
  const data = await listClients({ q: sp.q, filter, page });

  let selectedClient = null;
  let selectedProfile = null;
  let drawerMode: "none" | "new" | "edit" = "none";

  if (sp.novo === "1") {
    drawerMode = "new";
  } else if (sp.id) {
    try {
      selectedClient = await getClient(sp.id);
      selectedProfile = await getClientProfile(sp.id);
      drawerMode = "edit";
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return (
    <Suspense fallback={<p className="panel-empty">Carregando clientes…</p>}>
      <ClientesView
        data={data}
        selectedClient={selectedClient}
        selectedProfile={selectedProfile}
        drawerMode={drawerMode}
      />
    </Suspense>
  );
}
