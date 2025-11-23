// sw.js — Service Worker สำหรับระบบขอเบิกอะไหล่คลังนวนคร
// เวอร์ชัน: 2.0.0 (แก้ไขสมบูรณ์แล้ว)
// วันที่: 23 พ.ย. 2568

const CACHE_NAME = 'spare-parts-app-v8';
const OFFLINE_URL = '/offline.html';

// รายการไฟล์ที่ต้อง cache (App Shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/icon-152.png'
];

// CDN ที่ใช้บ่อย (cache แยกเพื่อความเร็ว)
const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&family=Itim&family=Poppins:wght@300;400;600&display=swap'
];

// ============= INSTALL =============
self.addEventListener('install', event => {
  console.log('Service Worker: กำลังติดตั้ง...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: ทำการ cache App Shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('Service Worker: ติดตั้งสำเร็จ');
        return self.skipWaiting(); // บังคับให้ SW ใหม่ใช้งานทันที
      })
      .catch(err => console.error('Service Worker: ติดตั้งล้มเหลว', err))
  );
});

// ============= ACTIVATE =============
self.addEventListener('activate', event => {
  console.log('Service Worker: กำลังเปิดใช้งาน...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('Service Worker: ลบ cache เก่า →', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: เปิดใช้งานสำเร็จ');
      return self.clients.claim(); // ควบคุมทุกแท็บทันที
    })
  );
});

// ============= FETCH =============
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // ข้าม request ที่ไม่ใช่ GET
  if (request.method !== 'GET') return;

  // ข้าม chrome-extension และ admin.google.com
  if (url.protocol === 'chrome-extension:' || url.hostname.includes('googleusercontent.com')) return;

  // === 1. หน้าเว็บหลัก + Navigation ===
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // ถ้าโหลดได้ → เก็บลง cache ใหม่
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // ถ้าเน็ตล่ม → แสดง offline.html
          return caches.match('/offline.html') ||
                 caches.match('/index.html');
        })
    );
    return;
  }

  // === 2. ไฟล์ static (js, css, รูป, font) ===
  if (url.origin === self.location.origin ||
      CDN_RESOURCES.some(cdn => url.href.startsWith(cdn))) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          // มีใน cache → ใช้เลย (เร็วสุด)
          if (cached) return cached;

          // ไม่มี → โหลดจากเน็ต แล้วเก็บลง cache
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          }).catch(() => {
            // ถ้าโหลดไม่ได้ → แสดง fallback (ถ้ามี)
            if (request.destination === 'image') {
              return new Response(
                '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" font-family="sans-serif" font-size="14" text-anchor="middle" dy=".3em">ไม่พบรูป</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
          });
        })
    );
    return;
  }

  // === 3. ข้อมูลจาก Opensheet / Google Apps Script ===
  if (url.hostname.includes('opensheet.elk.sh') || 
      url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // เก็บข้อมูลใหม่ลง cache
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // ถ้าเน็ตล่ม → ใช้ข้อมูลเก่าใน cache
          return caches.match(request);
        })
    );
    return;
  }

  // === 4. อื่น ๆ (ปล่อยให้ fetch ปกติ) ===
  event.respondWith(fetch(request));
});

// ============= หน้า Offline (สร้างไฟล์นี้ด้วยนะ) =============
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && !navigator.onLine) {
    event.respondWith(
      caches.match('/offline.html')
    );
  }
});
