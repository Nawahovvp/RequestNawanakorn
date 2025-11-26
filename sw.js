// sw.js — PartsGo v12.7 (26 พ.ย. 2568) — เวอร์ชันแก้บั๊ก clone แล้ว

const VERSION = 'v13.2';                     // เปลี่ยนเลขเวอร์ชันทุกครั้งที่อัปเดตไฟล์นี้
const CACHE   = `partgo-${VERSION}`;

// ไฟล์หลักของแอป (ภายในโดเมนเราเอง)
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

// ไฟล์ภายนอก (CDN, ฟอนต์, ไลบรารี)
const SHELL_EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Itim&family=Poppins:wght@300;400;600&family=Kanit:wght@300;400;600&display=swap'
];

// URL ข้อมูลจาก Google Sheet (ผ่าน opensheet)
const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information',
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSapimage'
];

// ติดตั้ง + cache shell ทั้งหมด แล้ว skipWaiting ทันที
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll([...SHELL, ...SHELL_EXTERNAL]))
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน → ลบ cache เก่า + claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ดักทุก request
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;

  // ข้าม POST, chrome-extension, และ script.google.com
  if (
    request.method !== 'GET' ||
    url.includes('chrome-extension') ||
    url.includes('script.google.com')
  ) {
    return;
  }

  const requestUrl = new URL(url);

  // เช็คว่าเป็น resource ภายในโดเมนเราไหม
  const isSameOrigin = requestUrl.origin === location.origin;

  // 1) App Shell (ไฟล์ของเราเอง + CDN ที่กำหนด) → Cache First
  const isShellLocal = isSameOrigin && SHELL.includes(requestUrl.pathname);
  const isShellExternal = SHELL_EXTERNAL.includes(url);

  if (isShellLocal || isShellExternal) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        // ถ้าไม่มีใน cache → ดึงจากเน็ตแล้วเก็บ cache (clone ก่อนใช้)
        return fetch(request).then(res => {
          if (res && res.status === 200) {
            const resClone = res.clone();          // 🔹 clone ก่อน
            caches.open(CACHE).then(cache => {
              cache.put(request, resClone);
            });
          }
          return res;
        }).catch(() => {
          // ถ้าโหลดไม่ได้เลย → ใช้ offline.html สำหรับของเราเอง
          if (isSameOrigin) {
            return caches.match('/offline.html') ||
                   new Response('Offline', { status: 503 });
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // 2) ข้อมูลจาก opensheet → Stale-While-Revalidate
  const isDataUrl = DATA_URLS.some(base => url.startsWith(base.split('?')[0]));

  if (isDataUrl) {
    event.respondWith(
      fetch(request).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();        // 🔹 clone ก่อน
          caches.open(CACHE).then(cache => {
            cache.put(request, clone);
          });
        }
        return networkRes;
      }).catch(() => {
        // ถ้าเน็ตหลุด → ใช้ข้อมูลเก่าที่ cache ไว้
        return caches.match(request) ||
               new Response(
                 JSON.stringify({ error: 'offline' }),
                 { headers: { 'Content-Type': 'application/json' } }
               );
      })
    );
    return;
  }

  // 3) อย่างอื่น → Network First + fallback เป็น offline.html
  event.respondWith(
    fetch(request).catch(() => {
      if (isSameOrigin) {
        return caches.match('/offline.html') ||
               new Response('Offline', { status: 503 });
      }
      return new Response('Offline', { status: 503 });
    })
  );
});

// รับ message จากหน้าเว็บ (เช็คเวอร์ชัน / skipWaiting)
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
