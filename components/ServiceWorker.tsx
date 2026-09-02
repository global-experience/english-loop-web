"use client";

import { useEffect } from "react";

/** localhost and private LAN addresses, i.e. the dev server. */
const DEV_HOSTS =
  /^(localhost|127\.0\.0\.1|\[?::1\]?|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // The worker serves the app shell from cache, which is what makes the PWA work
    // offline — and what makes a code change invisible in development. Never run it
    // against a dev server, and clear one that is already installed there so a stale
    // shell cannot keep shadowing new code.
    if (DEV_HOSTS.test(window.location.hostname)) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => (window.caches ? caches.keys() : []))
        .then((keys) => Promise.all(Array.from(keys).map((key) => caches.delete(key))))
        .catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
