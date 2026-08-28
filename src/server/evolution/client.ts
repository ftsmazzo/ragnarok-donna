import { getEvolutionConfig } from "./config";

type EvolutionFetchOptions = {
  method?: string;
  body?: unknown;
};

async function evolutionFetch<T>(path: string, options: EvolutionFetchOptions = {}): Promise<T> {
  const { baseUrl, apiKey } = getEvolutionConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : text.slice(0, 200) || res.statusText;
    throw new Error(`Evolution ${path}: ${msg}`);
  }

  return json as T;
}

export type EvolutionInstance = {
  instance?: { instanceName?: string; status?: string; owner?: string };
  instanceName?: string;
  name?: string;
  connectionStatus?: string;
  owner?: string;
  ownerJid?: string;
  number?: string;
};

export async function fetchInstances(): Promise<EvolutionInstance[]> {
  const data = await evolutionFetch<EvolutionInstance[] | { instances?: EvolutionInstance[] }>(
    "/instance/fetchInstances"
  );
  if (Array.isArray(data)) return data;
  return data.instances ?? [];
}

export async function createBaileysInstance(instanceName: string) {
  try {
    return await evolutionFetch("/instance/create", {
      body: {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: false,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/already|exist/i.test(msg)) return null;
    throw err;
  }
}

export async function connectInstance(instanceName: string) {
  return evolutionFetch<{
    qrcode?: { base64?: string; code?: string; count?: number };
    base64?: string;
    instance?: { status?: string };
  }>(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function getConnectionState(instanceName: string) {
  return evolutionFetch<{
    instance?: { instanceName?: string; state?: string; status?: string };
    state?: string;
    status?: string;
  }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function setInstanceWebhook(instanceName: string, url: string) {
  return evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    body: {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    },
  });
}

export async function sendTextMessage(instanceName: string, numberDigits: string, text: string) {
  return evolutionFetch<{ key?: { id?: string } }>(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      body: { number: numberDigits, text },
    }
  );
}

export type MediaMessageKey = {
  id: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  fromMe?: boolean;
};

export async function getBase64FromMediaMessage(
  instanceName: string,
  key: MediaMessageKey,
  convertToMp4 = false
) {
  return evolutionFetch<{
    mediaType?: string;
    mimetype?: string;
    base64?: string;
    fileName?: string;
  }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    body: {
      message: { key },
      convertToMp4,
    },
  });
}

export type EvolutionStoredMessage = {
  id?: string;
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
    participant?: string;
    participantAlt?: string;
  };
  pushName?: string;
  messageType?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
  };
  messageTimestamp?: number;
};

export async function findRecentMessages(
  instanceName: string,
  limit = 30
): Promise<EvolutionStoredMessage[]> {
  // Evolution ignora bem o filtro fromMe=false — paginamos e filtramos no app.
  const inbound: EvolutionStoredMessage[] = [];
  const pageSize = 50;
  let offset = 0;
  const maxPages = 8;

  for (let page = 0; page < maxPages && inbound.length < limit; page += 1) {
    const data = await evolutionFetch<{
      messages?: { records?: EvolutionStoredMessage[]; total?: number };
      records?: EvolutionStoredMessage[];
    }>(`/chat/findMessages/${encodeURIComponent(instanceName)}`, {
      body: {
        where: {},
        limit: pageSize,
        offset,
      },
    });

    const records = data.messages?.records ?? data.records ?? [];
    if (records.length === 0) break;

    for (const msg of records) {
      if (msg.key?.fromMe) continue;
      const jid = msg.key?.remoteJid ?? "";
      if (jid.startsWith("0@") || jid.includes("@g.us") || jid.includes("status@")) continue;
      inbound.push(msg);
      if (inbound.length >= limit) break;
    }

    offset += records.length;
    if (records.length < pageSize) break;
  }

  return inbound;
}


export function extractQrBase64(payload: {
  qrcode?: { base64?: string };
  base64?: string;
}): string | null {
  const raw = payload.qrcode?.base64 ?? payload.base64 ?? null;
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  return `data:image/png;base64,${raw}`;
}

export function mapConnectionStatus(state: string | null | undefined): string {
  const s = (state ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "connected";
  if (s === "connecting" || s === "qrcode") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected") return "disconnected";
  return s || "disconnected";
}
