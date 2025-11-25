// sw.js — เวอร์ชันสมบูรณ์แบบ 100% (แนะนำใช้ตัวนี้เลย)
// ปรับปรุงล่าสุด: 25 พ.ย. 2568

const VERSION = 'v10.2';
const SHELL_CACHE = `partgo-shell-${VERSION}`;
const DATA_CACHE  = `partgo-data-${VERSION}`;

const APP_SHELL = [
  '/', '/index.html', '/manifest.json',
  '/icon-192.png', '/icon-512.png', '/offline.html',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information'
];

// INSTALL
self.addEventListener('install', e => {
  console.log('%cSW: ติดตั้งเวอร์ชันใหม่ → ' + VERSION, 'color: #00ff00; font-weight: bold');
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener('activate', e => {
  console.log('%cSW: เปิดใช้งานเวอร์ชัน → ' + VERSION, 'color: #0066ff; font-weight: bold');
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== SHELL_CACHE && key !== DATA_CACHE) {
          console.log('SW: ลบ Cache เก่า →', key);
          return caches.delete(key);
        }
      })
    ))
    .then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' ||
      url.protocol === 'chrome-extension:' ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('script.google.com')) {
    return;
  }

  // App Shell
  if (url.origin === location.origin || APP_SHELL.some(u => url.href.includes(u))) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) caches.open(SHELL_CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match('/offline.html')))
    );
    return;
  }

  // ข้อมูล opensheet (แก้ตรงนี้ให้สมบูรณ์)
  const cleanDataUrl = DATA_URLS.find(u => url.href.startsWith(u.split('?')[0]));
  if (cleanDataUrl) {
    const cacheKey = new Request(cleanDataUrl.split('?')[0]);
    e.respondWith(
      caches.open(DATA_CACHE).then(cache =>
        cache.match(cacheKey).then(cached =>
          cached || fetch(req).then(fresh => {
            if (fresh.ok) cache.put(cacheKey, fresh.clone());
            return fresh;
          })
        )
      )
    );
    return;
  }

  // อื่น ๆ → Network First
  e.respondWith(
    fetch(req).catch(() => caches.match('/offline.html') || new Response('ออฟไลน์', {status: 503}))
  );
});

// MESSAGE (ส่งเวอร์ชัน + SKIP_WAITING)
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
