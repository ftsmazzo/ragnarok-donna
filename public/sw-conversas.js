/* Service worker — shell PWA Conversas + notificações locais */
const CACHE = "donna-conversas-v1";
const PRECACHE = ["/pwa/conversas", "/branding/ragnarok-favicon.png", "/manifest-conversas.webmanifest"];

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
  if (!url.pathname.startsWith("/pwa/") && url.pathname !== "/branding/ragnarok-favicon.png") {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => hit))
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
      icon: "/branding/ragnarok-favicon.png",
      badge: "/branding/ragnarok-favicon.png",
      tag: data.tag || "handoff",
      renotify: true,
      data: { url: data.url || "/pwa/conversas?filter=human" },
    })
  );
});
