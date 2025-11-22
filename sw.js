// 📱 Service Worker สำหรับระบบขอสั่งอะไหล่คลังสินค้านวนคร
// เวอร์ชัน: 1.0.0
// อัปเดตล่าสุด: 2024

// ==================== CONFIGURATION ====================
const CACHE_CONFIG = {
  app: {
    name: 'spare-parts-app-v4',
    urls: [
      '/',
      '/index.html',
      '/manifest.json',
      '/icon-192.png',
      '/icon-512.png',
      '/icon-180.png',
      '/icon-152.png',
      '/offline.html'
    ]
  },
  data: {
    name: 'spare-parts-data-v2',
    maxAge: 2 * 60 * 60 * 1000, // 2 ชั่วโมง
    urls: [
      'https://opensheet.elk.sh/',
      'https://script.google.com/'
    ]
  },
  cdn: {
    name: 'spare-parts-cdn-v2',
    urls: [
      'https://fonts.googleapis.com/css2?family=Itim&display=swap',
      'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap',
      'https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap',
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
      'https://cdn.jsdelivr.net/npm/sweetalert2@11',
      'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js'
    ]
  }
};

const NETWORK_TIMEOUT = 10000; // 10 seconds
const CACHE_TIMEOUT = 8000;    // 8 seconds for CDN

// ==================== INSTALL EVENT ====================
self.addEventListener('install', (event) => {
  console.log('🔄 Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      precacheAppShell(),
      precacheCDNResources(),
      self.skipWaiting() // บังคับให้ใช้งานทันที
    ]).then(() => {
      console.log('✅ Service Worker installed successfully');
    }).catch(error => {
      console.error('❌ Service Worker installation failed:', error);
    })
  );
});

// ==================== ACTIVATE EVENT ====================
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      cleanupOldCaches(),
      self.clients.claim(), // ควบคุม clients ทันที
      enableNavigationPreload()
    ]).then(() => {
      console.log('✅ Service Worker activated successfully');
      // แจ้ง client ว่า SW พร้อมใช้งาน
      sendMessageToClients({ type: 'SW_ACTIVATED' });
    }).catch(error => {
      console.error('❌ Service Worker activation failed:', error);
    })
  );
});

// ==================== FETCH EVENT ====================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ข้าม non-GET requests
  if (request.method !== 'GET') return;

  // ข้าม chrome-extension และอื่นๆ
  if (url.protocol === 'chrome-extension:') return;

  try {
    // กำหนด strategy ตามประเภทของ request
    const strategy = getCacheStrategy(request, url);
    
    switch (strategy) {
      case 'NETWORK_FIRST':
        event.respondWith(networkFirst(request));
        break;
        
      case 'CACHE_FIRST':
        event.respondWith(cacheFirst(request));
        break;
        
      case 'STALE_WHILE_REVALIDATE':
        event.respondWith(staleWhileRevalidate(request));
        break;
        
      case 'CDN_CACHE_FIRST':
        event.respondWith(cdnCacheFirst(request));
        break;
        
      default:
        event.respondWith(networkFirst(request));
    }
  } catch (error) {
    console.error('❌ Fetch handler error:', error);
    event.respondWith(offlineResponse(request));
  }
});

// ==================== MESSAGE EVENT ====================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({
        type: 'VERSION_INFO',
        payload: CACHE_CONFIG.app.name
      });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0]?.postMessage({
          type: 'CACHE_CLEARED'
        });
      });
      break;
      
    case 'UPDATE_DATA':
      updateDataCache(payload?.urls).then(() => {
        event.ports[0]?.postMessage({
          type: 'DATA_UPDATED'
        });
      });
      break;
  }
});

// ==================== SYNC EVENT ====================
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'background-data-sync') {
    event.waitUntil(performBackgroundSync());
  }
});

// ==================== PUSH EVENT ====================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'มีการอัปเดตข้อมูลใหม่',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: data.url || '/',
    actions: [
      {
        action: 'open',
        title: 'เปิดดู'
      },
      {
        action: 'close',
        title: 'ปิด'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'ระบบอะไหล่', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({
            type: 'NAVIGATE_TO',
            payload: event.notification.data
          });
        } else {
          self.clients.openWindow(event.notification.data);
        }
      })
    );
  }
});

// ==================== CORE STRATEGIES ====================

/**
 * Network First Strategy - สำหรับ HTML และ navigation
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_CONFIG.app.name);
  
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    
    // Cache ถ้า response ใช้ได้
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('🌐 Network failed, trying cache:', request.url);
    
    // ลองหาใน cache
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    
    // Fallback ไปที่ offline page สำหรับ navigation
    if (request.mode === 'navigate') {
      const offlinePage = await cache.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
      
      // หรือ fallback ไปที่ index.html
      const indexPage = await cache.match('/index.html');
      if (indexPage) {
        return indexPage;
      }
    }
    
    return offlineResponse(request);
  }
}

/**
 * Cache First Strategy - สำหรับ static resources
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_CONFIG.app.name);
  const cached = await cache.match(request);
  
  if (cached) {
    // ตรวจสอบอายุของ cache
    if (isCacheFresh(cached)) {
      return cached;
    }
  }
  
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // ถ้าไม่มี cache และ network ล้มเหลว
    if (cached) {
      return cached; // ใช้ cache เก่าแทน
    }
    
    return offlineResponse(request);
  }
}

/**
 * Stale While Revalidate - สำหรับข้อมูลที่อัปเดตบ่อย
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_CONFIG.data.name);
  const cached = await cache.match(request);
  
  // ส่ง cached response ก่อน (ถ้ามี)
  if (cached) {
    // อัปเดต cache ในเบื้องหลัง
    updateCacheInBackground(request, cache);
    return cached;
  }
  
  // ถ้าไม่มี cache ให้พยายามโหลดจาก network
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    return offlineResponse(request);
  }
}

/**
 * CDN Cache First - สำหรับ CDN resources
 */
async function cdnCacheFirst(request) {
  const cache = await caches.open(CACHE_CONFIG.cdn.name);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetchWithTimeout(request, CACHE_TIMEOUT);
    
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // สำหรับ CDN failure ให้พยายามโหลดจาก network ใหม่
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (retryError) {
      return offlineResponse(request);
    }
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * กำหนด cache strategy ตามประเภทของ request
 */
function getCacheStrategy(request, url) {
  // Navigation requests
  if (request.mode === 'navigate') {
    return 'NETWORK_FIRST';
  }
  
  // Data from opensheet (Google Sheets)
  if (url.hostname === 'opensheet.elk.sh') {
    return 'STALE_WHILE_REVALIDATE';
  }
  
  // GAS URLs
  if (url.hostname === 'script.google.com') {
    return 'NETWORK_FIRST';
  }
  
  // CDN resources
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    return 'CDN_CACHE_FIRST';
  }
  
  // Same-origin static resources
  if (url.origin === self.location.origin) {
    if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
      return 'CACHE_FIRST';
    }
  }
  
  // Default strategy
  return 'NETWORK_FIRST';
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(request, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(request, {
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * ตรวจสอบว่า cache ยัง fresh อยู่หรือไม่
 */
function isCacheFresh(cachedResponse) {
  const dateHeader = cachedResponse.headers.get('date');
  if (!dateHeader) return true;
  
  const cachedTime = new Date(dateHeader).getTime();
  const now = Date.now();
  const age = now - cachedTime;
  
  // Cache ใช้ได้ไม่เกิน 24 ชั่วโมง
  return age < (24 * 60 * 60 * 1000);
}

/**
 * อัปเดต cache ในเบื้องหลัง
 */
async function updateCacheInBackground(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    console.log('Background cache update failed:', error);
  }
}

/**
 * สร้าง offline response
 */
function offlineResponse(request) {
  if (request.mode === 'navigate') {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Offline - ระบบอะไหล่</title>
          <style>
            body { 
              font-family: 'Kanit', sans-serif; 
              text-align: center; 
              padding: 50px; 
              background: #f5f5f5;
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 10px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📡 ไม่สามารถเชื่อมต่อได้</h1>
            <p>กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองใหม่</p>
            <button onclick="location.reload()">ลองอีกครั้ง</button>
          </div>
        </body>
      </html>
      `,
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
  
  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// ==================== CACHE MANAGEMENT ====================

/**
 * Precache App Shell
 */
async function precacheAppShell() {
  const cache = await caches.open(CACHE_CONFIG.app.name);
  const urlsToCache = CACHE_CONFIG.app.urls;
  
  console.log('📦 Precaching app shell...');
  
  try {
    await cache.addAll(urlsToCache);
    console.log('✅ App shell precached successfully');
  } catch (error) {
    console.error('❌ App shell precaching failed:', error);
    // พยายาม cache แต่ละไฟล์แยกกัน
    for (const url of urlsToCache) {
      try {
        await cache.add(url);
      } catch (err) {
        console.error(`Failed to cache: ${url}`, err);
      }
    }
  }
}

/**
 * Precache CDN Resources
 */
async function precacheCDNResources() {
  const cache = await caches.open(CACHE_CONFIG.cdn.name);
  const urlsToCache = CACHE_CONFIG.cdn.urls;
  
  console.log('📦 Precaching CDN resources...');
  
  for (const url of urlsToCache) {
    try {
      await cache.add(url);
    } catch (error) {
      console.warn(`⚠️ Could not cache CDN resource: ${url}`, error);
    }
  }
}

/**
 * Cleanup old caches
 */
async function cleanupOldCaches() {
  const currentCaches = new Set(Object.values(CACHE_CONFIG).map(config => config.name));
  const cacheNames = await caches.keys();
  
  const deletePromises = cacheNames.map(cacheName => {
    if (!currentCaches.has(cacheName)) {
      console.log('🗑️ Deleting old cache:', cacheName);
      return caches.delete(cacheName);
    }
  });
  
  await Promise.all(deletePromises);
  console.log('✅ Cache cleanup completed');
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('🧹 All caches cleared');
}

/**
 * Update data cache
 */
async function updateDataCache(urls = []) {
  const cache = await caches.open(CACHE_CONFIG.data.name);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        console.log('✅ Updated data cache for:', url);
      }
    } catch (error) {
      console.error('❌ Failed to update data cache for:', url, error);
    }
  }
}

/**
 * Enable navigation preload
 */
async function enableNavigationPreload() {
  if (self.registration.navigationPreload) {
    await self.registration.navigationPreload.enable();
    console.log('✅ Navigation preload enabled');
  }
}

/**
 * Send message to all clients
 */
async function sendMessageToClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage(message);
  });
}

/**
 * Perform background sync
 */
async function performBackgroundSync() {
  console.log('🔄 Performing background sync...');
  
  try {
    // Sync ข้อมูลสำคัญ
    const dataUrls = [
      'https://opensheet.elk.sh/1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw/MainSap',
      'https://opensheet.elk.sh/1eqVoLsZxGguEbRCC5rdI4iMVtQ7CK4T3uXRdx8zE3uw/Employee'
    ];
    
    await updateDataCache(dataUrls);
    console.log('✅ Background sync completed');
    
    // แจ้งเตือนถ้าออนไลน์
    sendMessageToClients({
      type: 'BACKGROUND_SYNC_COMPLETED',
      payload: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('❌ Background sync failed:', error);
  }
}

// ==================== ERROR HANDLING ====================
self.addEventListener('error', (event) => {
  console.error('🛑 Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('🛑 Unhandled promise rejection:', event.reason);
});

console.log('🚀 Service Worker loaded successfully');
