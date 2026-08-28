/* Service worker — PWA Conversas + notificações locais */
const CACHE = "ragnarok-conversas-v5";
const ICON = "/branding/ragnarok-app-icon-192.png";
const PRECACHE = ["/pwa/conversas", ICON, "/manifest-conversas.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (!url.pathname.startsWith("/pwa/") && url.pathname !== ICON) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => hit))
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Barbearia Ragnarok — pediu humano",
    body: "Cliente pediu atendimento humano",
    url: "/pwa/conversas?filter=human",
    tag: "handoff",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: ICON,
      badge: ICON,
      tag: payload.tag || "handoff",
      renotify: true,
      data: { url: payload.url || "/pwa/conversas?filter=human" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/pwa/conversas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate?.(target);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "handoff-notify") return;
  event.waitUntil(
    self.registration.showNotification(data.title || "Atendimento humano", {
      body: data.body || "Cliente pediu falar com a equipe",
      icon: ICON,
      badge: ICON,
      tag: data.tag || "handoff",
      renotify: true,
      data: { url: data.url || "/pwa/conversas?filter=human" },
    })
  );
});
