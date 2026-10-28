/**
 * Service Worker — Meu Edital GCM Santana 2026
 *
 * Responsável por:
 * 1. Cachear todos os arquivos essenciais do aplicativo e do edital na primeira visita
 * 2. Permitir funcionamento 100% offline (incluindo leitura do edital, busca e marcação de tópicos)
 * 3. Atualizar caches antigos automaticamente sem deixar o usuário preso em versão antiga
 * 4. Preservar integralmente o progresso do estudante (armazenado no IndexedDB/localStorage)
 */

const CACHE_VERSION = "v2026.1.0";
const STATIC_CACHE_NAME = `meu-edital-gcm-santana-${CACHE_VERSION}`;

const ESSENTIAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/edital-data.js",
  "./js/db.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(ESSENTIAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName.startsWith("meu-edital-gcm-santana-") &&
              cacheName !== STATIC_CACHE_NAME
            ) {
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  // Apenas intercepta requisições da mesma origem do aplicativo
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Navegação de página (ex: index.html ou index.html?filter=pending)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put("./index.html", responseClone);
          });
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match("./index.html");
          if (cachedIndex) return cachedIndex;
          return caches.match("./");
        })
    );
    return;
  }

  // Demais ativos locais: Stale-While-Revalidate (responde rápido do cache e atualiza em segundo plano quando online)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
