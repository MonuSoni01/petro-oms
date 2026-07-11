/* =========================================
   PETRO OMS SERVICE WORKER
   NETWORK FIRST + SAFE OFFLINE CACHE
========================================= */

const CACHE_NAME = "petro-oms-v5";

/* New service worker ko immediately activate karo */
self.addEventListener("message", function (event) {
  if (
    event.data &&
    event.data.type === "SKIP_WAITING"
  ) {
    self.skipWaiting();
  }
});

const STATIC_ASSETS = [
  "/",
  "/index.html",

  "/vendor/bootstrap/css/bootstrap.min.css",
  "/css/style.css",
  "/css/all.css",

  "/vendor/jquery/jquery.min.js",
  "/vendor/bootstrap/js/bootstrap.bundle.min.js",

  "/images/logo.webp",
  "/images/whatsapp_logo.png",
  "/images/app.webp",
  "/images/app-icon.png",

  "/offline.html"
];

/* =========================================
   INSTALL
========================================= */

self.addEventListener("install", event => {

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {

      /*
        cache.addAll() mein ek file missing hui
        to complete install fail ho jata hai.

        Isliye files individually cache kar rahe hain.
      */

      await Promise.allSettled(
        STATIC_ASSETS.map(asset =>
          cache.add(asset)
        )
      );

    })
  );

});

/* =========================================
   ACTIVATE
========================================= */

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(cacheNames => {

      return Promise.all(

        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))

      );

    }).then(() => self.clients.claim())

  );

});

/* =========================================
   FETCH
========================================= */

self.addEventListener("fetch", event => {

  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);

  if (
    requestURL.protocol !== "http:" &&
    requestURL.protocol !== "https:"
  ) {
    return;
  }

  /*
    External CDN requests ko service worker cache
    se control na karo.
  */

  if (requestURL.origin !== self.location.origin) {
    return;
  }

  /* =====================================
     HTML / PAGE NAVIGATION
     ALWAYS NETWORK FIRST
  ===================================== */

  if (request.mode === "navigate") {

    event.respondWith(

      fetch(request, {
        cache: "no-store"
      })

        .then(networkResponse => {

          if (
            networkResponse &&
            networkResponse.status === 200
          ) {

            const responseClone =
              networkResponse.clone();

            caches.open(CACHE_NAME).then(cache => {

              /*
                Navigation ko pathname key se cache karo.
              */

              cache.put(
                requestURL.pathname,
                responseClone
              );

            });

          }

          return networkResponse;

        })

        .catch(async () => {

          const cachedPage =
            await caches.match(requestURL.pathname);

          if (cachedPage) {
            return cachedPage;
          }

          return caches.match("/offline.html");

        })

    );

    return;
  }

  /* =====================================
     CSS / JS
     NETWORK FIRST
  ===================================== */

  const destination = request.destination;

  if (
    destination === "style" ||
    destination === "script"
  ) {

    event.respondWith(

      fetch(request, {
        cache: "no-store"
      })

        .then(networkResponse => {

          if (
            networkResponse &&
            networkResponse.status === 200
          ) {

            const responseClone =
              networkResponse.clone();

            caches.open(CACHE_NAME).then(cache => {

              cache.put(
                request,
                responseClone
              );

            });

          }

          return networkResponse;

        })

        .catch(() =>
          caches.match(request)
        )

    );

    return;
  }

  /* =====================================
     IMAGES / FONTS / OTHER STATIC FILES
     CACHE FIRST + NETWORK UPDATE
  ===================================== */

  event.respondWith(

    caches.match(request).then(cachedResponse => {

      const networkFetch = fetch(request)

        .then(networkResponse => {

          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type !== "opaque"
          ) {

            const responseClone =
              networkResponse.clone();

            caches.open(CACHE_NAME).then(cache => {

              cache.put(
                request,
                responseClone
              );

            });

          }

          return networkResponse;

        });

      return cachedResponse || networkFetch;

    })

  );

});