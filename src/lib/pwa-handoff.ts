import { PWA_APPLE_ICON, PWA_ICON } from "@/lib/pwa-brand";

export type HandoffPulseItem = {
  id: string;
  phoneE164: string;
  humanRequestedAt: string | null;
};

export function handoffItemKey(item: HandoffPulseItem): string {
  return `${item.id}:${item.humanRequestedAt ?? ""}`;
}

const NOTIFIED_KEY = "pwa-handoff-notified-v2";
const POLL_MS = 3000;
export { POLL_MS };

type NotifiedMap = Record<string, string>;

export function loadNotifiedMap(): NotifiedMap {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "{}") as NotifiedMap;
  } catch {
    return {};
  }
}

export function saveNotified(key: string) {
  try {
    const map = loadNotifiedMap();
    map[key] = new Date().toISOString();
    const entries = Object.entries(map).slice(-100);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

export function wasNotified(key: string): boolean {
  return Boolean(loadNotifiedMap()[key]);
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
      phoneE164: "+55 teste",
      humanRequestedAt: new Date().toISOString(),
    },
    brandName
  );
}

export function vibrateHandoff() {
  navigator.vibrate?.([200, 120, 200, 120, 200]);
}
