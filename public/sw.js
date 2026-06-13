// Service worker — PWA installability + push notifications
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* pass-through */ });

self.addEventListener("push", (e) => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: "Habit Ledger", body: e.data.text(), url: "/" }; }
  e.waitUntil(
    self.registration.showNotification(data.title ?? "Habit Ledger", {
      body:    data.body  ?? "",
      icon:    "/icon-192.png",
      badge:   "/icon-192.png",
      tag:     "habit-reminder",
      renotify: true,
      data:    { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.endsWith(url) && "focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
