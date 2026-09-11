import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { requireSession } from "@/server/context/tenant";

/** Monta o widget no PWA (barbeiro/dono no celular). */
export async function PwaSupportHost() {
  const session = await requireSession();
  return <SupportChatWidget role={session.role} variant="pwa" />;
}
