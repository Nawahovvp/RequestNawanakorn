const CACHE_NAME = 'spare-parts-app-v1';
const urlsToCache = [
  '/',
  '/index.html',  // ชื่อไฟล์ HTML ของคุณ (สมมติว่าเป็น index.html)
  'https://fonts.googleapis.com/css2?family=Itim&display=swap',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
  // เพิ่ม URL อื่นๆ ที่สำคัญ เช่น opensheet.elk.sh ถ้าต้องการ cache ข้อมูล (แต่ข้อมูล dynamic ควร fetch ใหม่)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
