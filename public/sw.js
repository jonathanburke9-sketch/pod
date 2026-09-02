const CACHE_NAME = 'pod-pulse-v9';
const APP_SHELL = [
  '/',
  '/index.html',
  '/capture.html',
  '/admin.html',
  '/css/styles.css?v=20260724a',
  '/js/app.js?v=20260724e',
  '/js/home.js?v=20260724a',
  '/js/admin.js?v=20260902a',
  '/settings/app_settings.json',
  '/manifest.json',
  '/icons/scanhive-logo.png',
  '/icons/scanhive-icon.svg',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) {
        return cached;
      }

      if (isSameOrigin && requestUrl.pathname === '/capture.html') {
        const capturePage = await caches.match('/capture.html');
        if (capturePage) {
          return capturePage;
        }
      }

      if (isNavigation) {
        return caches.match('/index.html');
      }

      return Response.error();
    })
  );
});
