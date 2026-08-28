import webpush from "web-push";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function ensureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@barbeariaragnarok.com.br";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys não configuradas");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/** Envia push Web para todos os dispositivos inscritos do tenant. */
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!vapidConfigured()) {
    return { sent: 0, failed: 0 };
  }

  ensureVapid();
  const db = createDb();
  const rows = await db
    .select({
      id: schema.pushSubscriptions.id,
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
    })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.tenantId, tenantId));

  if (rows.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, row.id));
      }
    }
  }

  return { sent, failed };
}
