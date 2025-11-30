// sw.js — PartsGo v15.8.8 (29 พ.ย. 2568) — แก้ comma + เพิ่มความเสถียร
const VERSION = 'v16.1.3';
const CACHE = `partgo-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-152.png',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

const SHELL_EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Itim&family=Poppins:wght@300;400;600&family=Kanit:wght@300;400;600&display=swap'
];

const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information',
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSapimage'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll([...SHELL, ...SHELL_EXTERNAL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;

  if (request.method !== 'GET' ||
      url.includes('chrome-extension') ||
      url.includes('script.google.com')) {
    return;
  }

  const requestUrl = new URL(url);
  const isSameOrigin = requestUrl.origin === location.origin;

  // 1. App Shell (ภายใน + CDN ที่กำหนด) → Cache First
  const isShellLocal = isSameOrigin && SHELL.includes(requestUrl.pathname);
  const isShellExternal = SHELL_EXTERNAL.includes(url);
  if (isShellLocal || isShellExternal) {
    event.respondWith(
      caches.match(request)
        .then(cached => cached || fetch(request)
          .then(res => {
            if (res && res.status === 200) {
              const resClone = res.clone();
              caches.open(CACHE).then(cache => cache.put(request, resClone));
            }
            return res;
          })
          .catch(() => isSameOrigin
            ? caches.match('/offline.html') || new Response('ออฟไลน์', { status: 503 })
            : new Response('ออฟไลน์', { status: 503 })
          )
        )
    );
    return;
  }

  // 2. ข้อมูล opensheet → Stale-While-Revalidate
  const isDataUrl = DATA_URLS.some(base => url.startsWith(base.split('?')[0]));
  if (isDataUrl) {
    event.respondWith(
      fetch(request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE).then(cache => cache.put(request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(request) || new Response(
          JSON.stringify({ error: 'คุณอยู่ในโหมดออฟไลน์' }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // 3. อื่นๆ → Network First + fallback offline.html
  event.respondWith(
    fetch(request).catch(() => {
      return isSameOrigin
        ? caches.match('/offline.html') || new Response('ออฟไลน์', { status: 503 })
        : new Response('ออฟไลน์', { status: 503 });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
