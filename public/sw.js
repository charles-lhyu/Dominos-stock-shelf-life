/* Minimal service worker so Chromium can offer "Install app". */
/* v=20261024f — bump to nudge clients after the pineapple and olives prep date repair. */
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
