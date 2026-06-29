/* =========================
   PETRO OMS SERVICE WORKER
   PWA + CACHE + OFFLINE
========================= */

const CACHE_NAME = "petro-oms-v3";

const STATIC_ASSETS = [
  "/",
  "/index.html",

  // CSS
  "/vendor/bootstrap/css/bootstrap.min.css",
  "/css/style.css",
  "/css/all.css",

  // JS
  "/vendor/jquery/jquery.min.js",
  "/vendor/bootstrap/js/bootstrap.bundle.min.js",

  // Images
  "/images/logo.webp",
  "/images/whatsapp_logo.png",
  "/images/app.webp",
  "/images/app-icon.png",

  // Offline page optional
  "/offline.html"
];

/* INSTALL */
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

/* ACTIVATE */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

/* FETCH */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestURL = new URL(event.request.url);

  // Ignore chrome-extension / unsupported requests
  if (requestURL.protocol !== "http:" && requestURL.protocol !== "https:") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Invalid response ko cache mat karo
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type === "opaque"
        ) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // HTML page fail ho to offline page dikhao
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/offline.html");
          }
        });
      })
  );
});