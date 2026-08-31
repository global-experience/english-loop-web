const SHELL_CACHE = "loopine-shell-v2";
const OFFLINE_CACHE = "loopine-offline-content-v1";
const SHELL = ["/", "/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, OFFLINE_CACHE].includes(key)).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // API calls use their own authenticated origin and must retain the browser's
  // normal CORS and cookie behavior. Only opt-in audio may use cross-origin cache.
  if (url.origin !== self.location.origin && event.request.destination !== "audio") return;
  if (url.pathname.startsWith("/backend/") || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)).catch(() => fetch(event.request)));
});

self.addEventListener("message", (event) => {
  const { type, urls = [] } = event.data || {};
  if (type === "CACHE_CONTENT") {
    event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(urls)));
  }
  if (type === "REMOVE_CONTENT") {
    event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => Promise.all(urls.map((url) => cache.delete(url)))));
  }
  if (type === "CLEAR_OFFLINE_CONTENT") {
    event.waitUntil(caches.delete(OFFLINE_CACHE).then(() => caches.open(OFFLINE_CACHE)));
  }
});
