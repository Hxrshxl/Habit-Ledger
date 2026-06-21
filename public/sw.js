// Service worker — PWA installability, offline cache, push notifications

const CACHE = "hl-v2";
const SHELL = ["/", "/tracker", "/focus", "/insights", "/calendar", "/journal", "/goals", "/review"];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ),
  ]));
});

// ── Fetch: network-first for HTML/pages, skip API calls ──────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache API routes or Next.js internals
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.status < 400) {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ── Push: show notification ───────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { data = { title: "Habit Ledger", body: e.data.text(), url: "/" }; }

  e.waitUntil(
    self.registration.showNotification(data.title ?? "Habit Ledger", {
      body:      data.body  ?? "",
      icon:      "/icon-192.png",
      badge:     "/icon-192.png",
      tag:       "habit-reminder",
      renotify:  true,
      data: {
        url:      data.url      ?? "/",
        habit_id: data.habit_id ?? null,
        api_key:  data.api_key  ?? null,
      },
      actions: data.actions ?? [],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { url, habit_id, api_key } = e.notification.data ?? {};

  if (e.action === "mark-done" && habit_id && api_key) {
    // Fire-and-forget: mark the habit done without opening the app
    e.waitUntil(
      fetch("/api/v1/complete", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${api_key}` },
        body:    JSON.stringify({ habitId: habit_id }),
      }).catch(() => {})
    );
    return;
  }

  // Default: open / focus the app
  const target = url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.endsWith(target) && "focus" in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
