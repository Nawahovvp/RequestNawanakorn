// เวอร์ชัน cache (เปลี่ยนชื่อทุกครั้งที่อัปเดตไฟล์สำคัญ)
const CACHE_NAME = 'spare-parts-app-v3';
const DATA_CACHE_NAME = 'spare-parts-data-v1';

// ไฟล์พื้นฐานที่ต้องใช้ทุกครั้ง (App Shell)
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // ฟอนต์ / CSS / JS จาก CDN ที่ใช้บ่อยและอยากให้โหลดไว
  'https://fonts.googleapis.com/css2?family=Itim&display=swap',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js'
];

// บังคับให้ SW ตัวใหม่ทำงานทันที
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

// ลบ cache เก่าออก เหลือเฉพาะเวอร์ชันล่าสุด
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME && name !== DATA_CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  clients.claim();
});

// กลยุทธ์ตอบสนองเวลา fetch
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) จัดการกับข้อมูลจาก Google Sheet (opensheet.elk.sh)
  if (url.hostname === 'opensheet.elk.sh') {
    event.respondWith(handleDataRequest(req));
    return;
  }

  // 2) ถ้าเป็นหน้า HTML (เช่น เปิด / ตรง ๆ) → network-first (จะได้เวอร์ชันใหม่เสมอถ้าเน็ตได้)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) อื่น ๆ (CSS, JS, รูป, ฟอนต์ ฯลฯ) → cache-first (โหลดไวสุด)
  event.respondWith(cacheFirst(req));
});

// 🔹 กลยุทธ์ cache-first (ไวมาก)
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // เก็บลง cache ถ้าเป็น GET และมาจากโปรโตคอลปกติ
  if (request.method === 'GET' && (request.url.startsWith('http://') || request.url.startsWith('https://'))) {
    cache.put(request, response.clone());
  }
  return response;
}

// 🔹 กลยุทธ์ network-first สำหรับหน้า HTML
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // ถ้าไม่มีอะไรเลยจริง ๆ
    return new Response('Offline และไม่มีข้อมูลใน cache', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// 🔹 จัดการข้อมูลจาก opensheet.elk.sh → stale-while-revalidate
async function handleDataRequest(request) {
  const cache = await caches.open(DATA_CACHE_NAME);

  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // ถ้ามี cache → ส่ง cache ก่อน (โหลดไว) แล้วค่อยอัปเดตเบื้องหลัง
  if (cached) {
    // fire and forget network update
    networkPromise;
    return cached;
  }

  // ถ้าไม่มี cache เลย → รอ network
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  // ไม่มีทั้งเน็ตและ cache เลย
  return new Response('ไม่สามารถโหลดข้อมูลจาก Google Sheet ได้ และไม่มีข้อมูลเก่าใน cache', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
