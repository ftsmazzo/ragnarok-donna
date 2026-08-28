import { PWA_APPLE_ICON, PWA_ICON } from "@/lib/pwa-brand";

export type HandoffPulseItem = {
  id: string;
  phoneE164: string;
  humanRequestedAt: string | null;
};

export function handoffItemKey(item: HandoffPulseItem): string {
  return `${item.id}:${item.humanRequestedAt ?? ""}`;
}

/** Normaliza Date|string vindo do server component. */
export function handoffIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

const DISMISSED_KEY = "pwa-handoff-dismissed-v3";
export const POLL_MS = 3000;

type DismissedMap = Record<string, string>;

export function loadDismissedMap(): DismissedMap {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "{}") as DismissedMap;
  } catch {
    return {};
  }
}

export function dismissHandoff(key: string) {
  try {
    const map = loadDismissedMap();
    map[key] = new Date().toISOString();
    const entries = Object.entries(map).slice(-50);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

export function wasDismissed(key: string): boolean {
  return Boolean(loadDismissedMap()[key]);
}

export async function pushHandoffNotification(
  item: HandoffPulseItem,
  brandName: string
): Promise<boolean> {
  const title = `${brandName} — pediu humano`;
  const body = `${item.phoneE164} · toque para abrir`;
  const url = `/pwa/conversas?filter=human&id=${item.id}`;
  const icon = PWA_ICON;
  const options = {
    body,
    icon,
    badge: icon,
    tag: `handoff-${item.id}`,
    data: { url },
    vibrate: [200, 120, 200],
  } as NotificationOptions & { renotify?: boolean; vibrate?: number[] };
  options.renotify = true;

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
}

export async function pushTestNotification(brandName: string): Promise<boolean> {
  return pushHandoffNotification(
    {
      id: "test",
      phoneE164: "Teste manual",
      humanRequestedAt: new Date().toISOString(),
    },
    brandName
  );
}

export function vibrateHandoff() {
  navigator.vibrate?.([200, 120, 200, 120, 200]);
}

/** Dispara banner + vibração + push (se permitido). */
export async function alertHandoff(
  item: HandoffPulseItem,
  brandName: string,
  onBanner: (item: HandoffPulseItem) => void
): Promise<void> {
  const key = handoffItemKey(item);
  if (wasDismissed(key)) return;

  vibrateHandoff();
  onBanner(item);
  await pushHandoffNotification(item, brandName);
}
