/* Minimal service worker so Chromium can offer "Install app". */
/* v=20261024o — bump to nudge clients after desk UX and PDF import updates. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* A fetch handler is required for installability criteria. */
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
