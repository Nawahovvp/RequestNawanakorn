// sw.js — เวอร์ชันสุดยอด สำหรับระบบขอเบิกอะไหล่ (แนะนำ 100%)
// ปรับปรุง: 24 พ.ย. 2568

const VERSION = 'v9';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;   // แยก cache ข้อมูลต่างหาก

// === App Shell (สิ่งที่ต้องโหลดทันที) ===
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

// === ข้อมูลที่ต้องการเร็ว + ออฟไลน์ได้ ===
const DATA_URLS = [
  'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
  'https://opensheet.elk.sh/1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE/Request',
  'https://opensheet.elk.sh/1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk/Call_Report',
  'https://opensheet.elk.sh/1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o/information'
];

// ============= INSTALL =============
self.addEventListener('install', e => {
  console.log('SW: ติดตั้งเวอร์ชัน', VERSION);
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ============= ACTIVATE =============
self.addEventListener('activate', e => {
  console.log('SW: เปิดใช้งานเวอร์ชัน', VERSION);
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== SHELL_CACHE && key !== DATA_CACHE) {
          console.log('SW: ลบ cache เก่า →', key);
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

// ============= FETCH (สำคัญที่สุด!) =============
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // ข้าม POST, chrome-extension, googleusercontent
  if (req.method !== 'GET' || 
      url.protocol === 'chrome-extension:' || 
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // 1. App Shell + Static files → Cache First
  if (url.origin === location.origin || APP_SHELL.some(u => url.pathname === u)) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        caches.open(SHELL_CACHE).then(c => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  // 2. ข้อมูลจาก Opensheet → Stale-While-Revalidate (เร็วสุด + ข้อมูลสดเสมอ)
  if (DATA_URLS.some(dataUrl => url.href.startsWith(dataUrl))) {
    e.respondWith(
      caches.open(DATA_CACHE).then(cache => {
        return cache.match(req).then(cached => {
          // มีแคช → ส่งทันที (เร็วสุด!)
          if (cached) {
            // อัปเดตพื้นหลังเงียบ ๆ
            fetch(req).then(fresh => {
              cache.put(req, fresh.clone());
            }).catch(() => {}); // ออฟไลน์ก็ไม่เป็นไร
            return cached;
          }
          // ไม่มีแคช → ดึงจริง แล้วเก็บ
          return fetch(req).then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 3. ทุกอย่างอื่น ๆ → Network First (เช่น GAS POST)
  e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});
