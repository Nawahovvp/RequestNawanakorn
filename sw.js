// sw.js — เวอร์ชันสุดท้าย สำหรับระบบขอเบิกอะไหล่ (PartsGo)
// ปรับปรุงล่าสุด: 25 พ.ย. 2568
// รองรับ: อัปเดตทันที + แจ้งเตือนผู้ใช้ + ออฟไลน์เต็มรูปแบบ

const VERSION = 'v10';                    // เปลี่ยนตรงนี้ทุกครั้งที่อัปเดตแอป !!
const SHELL_CACHE = `partgo-shell-${VERSION}`;
const DATA_CACHE  = `partgo-data-${VERSION}`;

// === ไฟล์ที่ต้องโหลดทันที (App Shell) ===
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html',                    // หน้าออฟไลน์ (ถ้ายังไม่มี ให้สร้างไฟล์ง่าย ๆ)
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// === URL ที่เป็นข้อมูล (opensheet) → ใช้ Stale-While-Revalidate ===
const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information'
];

// ============= INSTALL =============
self.addEventListener('install', e => {
  console.log('%cSW: ติดตั้งเวอร์ชันใหม่ → ' + VERSION, 'color: #00ff00; font-weight: bold');
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // สำคัญ: บังคับให้ SW ใหม่ active ทันที
  );
});

// ============= ACTIVATE =============
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
    .then(() => self.clients.claim())       // ควบคุมหน้าทั้งหมดทันที
  );
});

// ============= FETCH (หัวใจหลัก) =============
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // ข้าม POST, chrome-extension, googleusercontent (Drive preview)
  if (req.method !== 'GET' ||
      url.protocol === 'chrome-extension:' ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('script.google.com')) {
    return;
  }

  // 1. App Shell + CDN → Cache First + Update Background
  if (url.origin === location.origin || APP_SHELL.some(u => url.href.includes(u))) {
    e.respondWith(
      caches.match(req).then(cached => {
        const networked = fetch(req)
          .then(res => {
            if (res.ok) caches.open(SHELL_CACHE).then(c => c.put(req, res.clone()));
            return res;
          })
          .catch(() => cached || caches.match('/offline.html'));

        return cached || networked;
      })
    );
    return;
  }

  // 2. ข้อมูล opensheet → Stale-While-Revalidate (เร็ว + สดเสมอ)
  if (DATA_URLS.some(dataUrl => url.href.startsWith(dataUrl))) {
    e.respondWith(
      caches.open(DATA_CACHE).then(cache => {
        return cache.match(req).then(cached => {
          const fetchPromise = fetch(req).then(fresh => {
            if (fresh.ok) cache.put(req, fresh.clone());
            return fresh;
          });

          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. ทุกอย่างอื่น → Network First → ตกออฟไลน์ใช้ offline.html
  e.respondWith(
    fetch(req)
      .then(res => res)
      .catch(() => caches.match('/offline.html') || new Response('ออฟไลน์', { status: 503 }))
  );
});

// ============= ส่งสัญญาณไปบอกหน้าเว็บว่ามีอัปเดตใหม่ =============
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
