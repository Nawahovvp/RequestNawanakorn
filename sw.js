// sw.js — เวอร์ชันกระชับสุด ๆ แต่ทรงพลัง (PartsGo)
// ปรับปรุงล่าสุด: 25 พ.ย. 2568

const VERSION = 'v10.4'; // เปลี่ยนแค่บรรทัดนี้ทุกครั้งที่อัปเดต
const CACHE = `partgo-${VERSION}`;

const SHELL = [
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
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information',
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSapimage'
];

// ติดตั้ง + ข้ามรอทันที
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน + ลบแคชเก่า + ควบคุมทันที
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ดักทุก request
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // ข้าม POST และบาง domain
  if (e.request.method !== 'GET' ||
      url.includes('googleusercontent.com') ||
      url.includes('script.google.com') ||
      url.includes('chrome-extension:')) return;

  // App Shell → Cache First
  if (SHELL.some(u => url.includes(u)) || url.startsWith(location.origin)) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => caches.match('/offline.html'))
      )
    );
    return;
  }

  // ข้อมูล opensheet → Stale-While-Revalidate (เร็วสุด)
  const dataBase = DATA_URLS.find(u => url.startsWith(u.split('?')[0]));
  if (dataBase) {
    const key = new Request(dataBase.split('?')[0]);
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(key).then(cached =>
          cached || fetch(e.request).then(res => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // อื่น ๆ → Network First
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
});

// รับคำสั่งจากหน้าเว็บ
self.addEventListener('message', e => {
  if (e.data?.type === 'GET_VERSION')
    e.source.postMessage({ type: 'VERSION', version: VERSION });
  if (e.data?.type === 'SKIP_WAITING')
    self.skipWaiting();
});
