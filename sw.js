// sw.js — PartsGo v12.9.1 (29 พ.ย. 2568) — เวอร์ชันสุดท้ายที่ถูกต้อง 100%

const VERSION = 'v12.9.3';
const CACHE   = `partgo-${VERSION}`;

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
  'https://fonts.googleapis.com/css2?family=Itim&family=Poppins:wght@300;400;600&family=Kanit:wght@300;400;600&display=swap',
  'https://fonts.gstatic.com'  // เพิ่มทั้งโดเมนเลย ดีกว่า
];

const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information',
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSapimage'
];

// ติดตั้ง
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll([...SHELL, ...SHELL_EXTERNAL]))
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน → ลบ cache เก่าทั้งหมด
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ดักทุก request
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // ข้าม POST และ GAS (ส่งข้อมูลเบิก)
  if (req.method !== 'GET' || url.origin.includes('script.google.com')) {
    return;
  }

  // 1. App Shell + CDN (Cache First + Update Background)
  if (
    url.origin === self.location.origin ||
    SHELL_EXTERNAL.some(u => url.href.startsWith(u))
  ) {
    e.respondWith(
      caches.match(req).then(cached => {
        // มีใน cache → ใช้เลย
        if (cached) return cached;

        // ไม่มี → ดึงจากเน็ต แล้วเก็บ cache
        return fetch(req).then(netRes => {
          if (netRes && netRes.status === 200) {
            const resClone = netRes.clone();  // Clone ที่นี่ถูกต้องแล้ว
            caches.open(CACHE).then(c => c.put(req, resClone));
          }
          return netRes;
        }).catch(() => caches.match('/offline.html'));
      })
    );
    return;
  }

  // 2. ข้อมูลจาก opensheet → Stale-While-Revalidate (ดีที่สุดสำหรับข้อมูล)
  const isData = DATA_URLS.some(base => url.href.startsWith(base));
  if (isData) {
    e.respondWith(
      caches.match(req).then(cached => {
        // ดึงจากเน็ตก่อนเสมอ (สดใหม่) แต่ใช้ cache ถ้าเน็ตหลุด
        const fetchPromise = fetch(req).then(netRes => {
          if (netRes && netRes.status === 200) {
            const resClone = netRes.clone();
            caches.open(CACHE).then(c => c.put(req, resClone));
          }
          return netRes;
        }).catch(() => cached || new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' }
        }));

        // ถ้ามี cache เก่า → ใช้ทันที (เร็วสุด)
        return cached ? cached : fetchPromise;
      })
    );
    return;
  }

  // 3. อื่น ๆ (เช่น รูปจาก drive.google.com) → Network Only
  // ไม่ cache เพราะใช้ Cache API ใน index.html อยู่แล้ว เร็วกว่า
  // ไม่ทำอะไร = ปล่อยให้ browser จัดการเอง
});

// รับข้อความจากหน้าเว็บ (เวอร์ชัน + skip waiting)
self.addEventListener('message', e => {
  if (e.data?.type === 'GET_VERSION') {
    e.source?.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
