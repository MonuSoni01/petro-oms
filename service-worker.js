const CACHE_NAME = "petro-oms-v2";  // version change kar diya

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/vendor/bootstrap/css/bootstrap.min.css",
  "/vendor/bootstrap/js/bootstrap.bundle.min.js",
  "/vendor/jquery/jquery.min.js",
  "/css/style.css",
  "/css/all.css",
  "/images/logo.webp",
  "/images/whatsapp_logo.png",
  "/images/app.webp",
  "/images/app-icon.png",
];

// INSTALL
self.addEventListener("install", (event) => {
  self.skipWaiting(); // force activate new SW
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ACTIVATE
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
      self.clients.claim(), // take control immediately
    ])
  );
});

// FETCH (Network First Strategy)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});