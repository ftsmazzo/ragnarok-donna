import { StubPage } from "@/components/shell/StubPage";
import { requirePageAccess } from "@/server/permissions/page-access";

export default async function Page() {
  await requirePageAccess("/conversas");
  return (
    <StubPage
      title="Conversas IA"
      subtitle="WhatsApp · handoff humano · n8n"
      hint="Recepção e dono atendem conversas do agente. Diferencial vs AppBarber: agente conectado à agenda e comandas."
    />
  );
}
