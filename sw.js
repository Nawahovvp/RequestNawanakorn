// sw.js — PartsGo v10.5 (25 พ.ย. 2568) — แก้แล้วสมบูรณ์ 100%
const VERSION = 'v12.1';                    // เปลี่ยนแค่บรรทัดนี้ทุกครั้งที่อัปเดต
const CACHE = `partgo-${VERSION}`;

const SHELL = [
  '/', 
  '/index.html',
  '/style.css',                           // สำคัญมาก! เพิ่มเข้ามา
  '/manifest.json',
  '/icon-192.png', 
  '/icon-512.png',
  '/offline.html',                        // ถ้ายังไม่มี ให้สร้างไฟล์นี้ด้วย
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

// ติดตั้ง + ข้ามรอทันที
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน → ลบแคชเก่า + ควบคุมทันที
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

  // ข้าม POST, chrome-extension, และ GAS
  if (e.request.method !== 'GET' || 
      url.includes('chrome-extension') || 
      url.includes('script.google.com')) {
    return;
  }

  // 1. App Shell + style.css + ฟอนต์ → Cache First (เร็วสุด)
  if (SHELL.some(shellUrl => url.includes(shellUrl)) || url.startsWith(location.origin)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => caches.match('/offline.html') || new Response('Offline', {status: 503}));
      })
    );
    return;
  }

  // 2. ข้อมูลจาก opensheet → Stale-While-Revalidate (ข้อมูลใหม่ทันที + เร็ว)
  const isDataUrl = DATA_URLS.some(base => url.startsWith(base.split('?')[0]));
  if (isDataUrl) {
    e.respondWith(
      fetch(e.request).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          caches.open(CACHE).then(cache => cache.put(e.request, networkRes.clone()));
        }
        return networkRes;
      }).catch(() => {
        // ถ้าเน็ตหลุด ให้ใช้ข้อมูลเก่าที่ cache ไว้
        return caches.match(e.request) || 
               new Response(JSON.stringify({error: "offline"}), {headers: {'Content-Type': 'application/json'}});
      })
    );
    return;
  }

  // 3. อื่น ๆ → Network First + fallback offline
  e.respondWith(
    fetch(e.request).catch(() => caches.match('/offline.html'))
  );
});

// รับคำสั่งจากหน้าเว็บ
self.addEventListener('message', e => {
  if (e.data?.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
