// === ระบบอัปเดตแอปทันที + แจ้งเตือนผู้ใช้ ===
let newWorker;
let isUpdateShown = false;
function showUpdateToast() {
  if (isUpdateShown) return;
  isUpdateShown = true;
  Swal.fire({
    title: 'มีอัปเดตใหม่!',
    html: 'แอปได้รับการปรับปรุงแล้ว<br><small>กดรีเฟรชเพื่อใช้งานเวอร์ชันล่าสุด</small>',
    icon: 'info',
    confirmButtonText: 'รีเฟรชเลย',
    cancelButtonText: 'ภายหลัง',
    showCancelButton: true,
    allowOutsideClick: false,
    timer: 20000,
    timerProgressBar: true,
    customClass: {
      popup: 'animated bounceIn'
    }
  }).then((result) => {
    if (result.isConfirmed) {
      if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    }
  });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => {
      console.log('SW registered');
      // บังคับเช็คอัปเดตทุกครั้งที่เปิดแอป
      reg.update();
      reg.addEventListener('updatefound', () => {
        newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
        });
      });
    })
    .catch(err => console.log('SW registration failed:', err));
  // รีโหลดอัตโนมัติเมื่อ SW เปลี่ยน
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
// === แสดงเวอร์ชันแอปในเมนูตั้งค่า (อัตโนมัติจาก sw.js) ===
function updateAppVersionDisplay() {
  // ดึงเวอร์ชันจาก sw.js โดยตรง (ถ้า Service Worker โหลดแล้ว)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
  }
  // สำรอง: ถ้ายังไม่โหลด SW → ดึงจาก cache หรือแสดง v??
  const versionElement = document.getElementById('appVersion');
  if (versionElement) {
    versionElement.textContent = 'v??';
  }
}
// รับเวอร์ชันจาก sw.js
navigator.serviceWorker.addEventListener('message', async event => {
  if (event.data && event.data.type === 'VERSION') {
    const versionElement = document.getElementById('appVersion');
    if (versionElement) {
      versionElement.textContent = event.data.version;
      versionElement.style.fontWeight = 'bold';
      versionElement.style.color = '#1e88e5'; // ใช้โทนสีน้ำเงินให้ตรงกับดีไซน์
    }
    await ensureCacheFreshForVersion(event.data.version);
  }
});
// เรียกอัปเดตเวอร์ชันทุกครั้งที่เปิดหน้า
document.addEventListener('DOMContentLoaded', updateAppVersionDisplay);
// แก้ไข showSettings() เดิมของคุณ ให้เรียกอัปเดตเวอร์ชันด้วย
const originalShowSettings = window.showSettings; // เก็บฟังก์ชันเดิมไว้
window.showSettings = function () {
  // เรียกฟังก์ชันเดิมของคุณก่อน
  if (typeof originalShowSettings === 'function') {
    originalShowSettings();
  }
  // แล้วค่อยอัปเดตเวอร์ชัน
  updateAppVersionDisplay();
};
'use strict'; // Strict mode for earlier error detection

const apiFetch = (input, init = {}) => {
  const options = { ...init };
  if (!options.credentials) {
    options.credentials = 'same-origin';
  }
  return fetch(input, options);
};
// ========== ระบบ Cache ขั้นเทพ (2025) สำหรับ Parts + Images ==========
const CACHE_VERSION = "v18";
const CACHE_NAME = `partgo-cache-${CACHE_VERSION}`;
const DATA_CACHE_PREFIX = 'partgo-cache-';
const DATA_CACHE_VERSION_KEY = 'dataCacheVersion';

async function clearDataCaches() {
  try {
    const keys = await caches.keys();
    const targets = keys.filter(name => name.startsWith(DATA_CACHE_PREFIX));
    await Promise.all(targets.map(name => caches.delete(name)));
    console.log('ล้าง cache ข้อมูลเสร็จสิ้น:', targets);
  } catch (err) {
    console.warn('ล้าง cache ข้อมูลไม่สำเร็จ', err);
  }
}

async function ensureCacheFreshForVersion(version) {
  if (!version) return;
  const storedVersion = localStorage.getItem(DATA_CACHE_VERSION_KEY);
  if (storedVersion === version) return;
  await clearDataCaches();
  localStorage.setItem(DATA_CACHE_VERSION_KEY, version);
}

async function handleClearCacheAndReload() {
  try {
    Swal.fire({
      title: 'กำลังล้างแคช...',
      text: 'โปรดรอสักครู่',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    });
    const keys = await caches.keys();
    await Promise.all(keys.map(name => caches.delete(name)));
    localStorage.removeItem(DATA_CACHE_VERSION_KEY);
    Swal.fire({
      icon: 'success',
      title: 'ล้างแคชแล้ว',
      text: 'กำลังรีโหลดข้อมูลใหม่',
      timer: 1200,
      showConfirmButton: false
    });
  } catch (err) {
    console.error('ล้างแคชไม่สำเร็จ:', err);
    Swal.fire({
      icon: 'error',
      title: 'ล้างแคชไม่สำเร็จ',
      text: 'จะรีโหลดเพื่อพยายามใหม่',
      timer: 1200,
      showConfirmButton: false
    });
  } finally {
    setTimeout(() => window.location.reload(true), 1300);
  }
}

async function getCachedData(key, fetchFn, expireHours = 1) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    if (cached) {
      const { data, timestamp } = await cached.json();
      const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
      if (ageHours < expireHours) {
        console.log("ใช้ Cache:", key);
        return data;
      }
    }
  } catch (e) {
    console.warn("Cache API ไม่พร้อม (อาจเปิดใน http หรือบางเบราว์เซอร์)", e);
  }

  console.log("ดึงข้อมูลใหม่จากเซิร์ฟเวอร์:", key);
  const freshData = await fetchFn();

  // ✅ บันทึกข้อมูล + timestamp ลง Cache
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      key,
      new Response(
        JSON.stringify({
          data: freshData,
          timestamp: Date.now()
        })
      )
    );
  } catch (e) {
    // ถ้าบันทึก cache ไม่ได้ (เช่น พื้นที่เต็ม) → ไม่ error
  }

  return freshData;
}
// Global employee data
let employeeData = [];
let employeeDataLoaded = false;        // เพิ่มบรรทัดนี้
let partsDataLoaded = false;          // เพิ่มบรรทัดนี้ (สำหรับข้อ 2)
let imagesDataLoaded = false;
let todayDataLoaded = false;
let pendingDataLoaded = false;      // เพิ่มบรรทัดนี้ (สำหรับข้อ 2)
// Global search values for syncing between parts and images tabs
let globalSearch1 = '';
let globalSearch2 = '';
// Global for today tab: toggle pending only
let showOnlyPending = true; // true = แสดงเฉพาะรอเบิก, false = แสดงทั้งหมด
let currentFilter = 'pending';
// ควบคุมการสลับแท็บเบิกวันนี้แบบไม่ต้องรีเฟรชข้อมูลทั้งก้อนหลังบันทึก
let skipTodayReloadOnce = false;
// Sort config for today tab
let sortConfigToday = { column: 'IDRow', direction: 'desc' }; // Default to descending IDRow
// Pagination config for today tab
let currentPageToday = 1;
let itemsPerPageToday = 20; // Default to 20 items per page
// API endpoint (Vercel)
const requestSheetUrl = '/api/request';
// GAS URL (ผ่าน Vercel API proxy)
const gasUrl = '/api/gas';
const bulkUpdateUrl = '/api/gas';
// Parts tab variables (moved up to avoid initialization error)
const url = '/api/main-sap';
const searchInput1 = document.getElementById("searchInput1");
const searchInput2 = document.getElementById("searchInput2");
const searchButton = document.getElementById("searchButton");
const tableBody = document.querySelector("#data-table tbody");
const tableContainerParts = document.querySelector("#parts .table-container");
const pagination = document.getElementById("pagination");
const pageNumbers = document.getElementById("pageNumbers");
const itemsPerPageSelect = document.getElementById("itemsPerPage");
const firstPageButton = document.getElementById("firstPage");
const prevPageButton = document.getElementById("prevPage");
const nextPageButton = document.getElementById("nextPage");
const lastPageButton = document.getElementById("lastPage");
const errorContainer = document.getElementById("error-container");
const retryButton = document.getElementById("retry-button");
let allData = [];
let tempFilteredData = [];
let currentPage = 1;
let itemsPerPage = 20;
let currentFilteredData = [];

// Images tab variables (moved up)
const searchInputImages1 = document.getElementById("searchInputImages1");
const searchInputImages2 = document.getElementById("searchInputImages2");
const searchButtonImages = document.getElementById("searchButtonImages");
const galleryContainer = document.getElementById("gallery-container-images");
const paginationImages = document.getElementById("paginationImages");
const pageNumbersImages = document.getElementById("pageNumbersImages");
const itemsPerPageSelectImages = document.getElementById("itemsPerPageImages");
const firstPageButtonImages = document.getElementById("firstPageImages");
const prevPageButtonImages = document.getElementById("prevPageImages");
const nextPageButtonImages = document.getElementById("nextPageImages");
const lastPageButtonImages = document.getElementById("lastPageImages");
const errorContainerImages = document.getElementById("error-container-images");
const retryButtonImages = document.getElementById("retry-button-images");
let allDataImages = [];
let tempFilteredDataImages = [];
let currentPageImages = 1;
let itemsPerPageImages = 20;
let currentFilteredDataImages = [];
let imageDatabase = {}; // { Material: ["id1", "id2", ...] }
let imageDbLoaded = false;
function extractIdFromUrlWeb(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/) || url.match(/id=([a-zA-Z0-9-_]+)/) || url.match(/uc\?id=([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}
function getStorageBinValue(row) {
  const raw =
    row["Storage bin"] ||
    row["Storage Bin"] ||
    row["storage bin"] ||
    row["Storage_bin"] ||
    "";
  return raw == null ? "" : raw;
}
let vibhavadiStockMap = {}; // { "Material": จำนวนวิภาวดี }
let vibhavadiUrlWebMap = {}; // { "Material": UrlWeb } สำหรับดึงรูปในแท็บเบิกวันนี้
let navanakornStockMap = {}; // { "Material": จำนวนสต็อกนวนคร (Unrestricted) }
// Today tab variables (moved up)
const modal = document.getElementById("detailModal");
const modalContent = document.getElementById("modalContent");
const closeModal = document.getElementById("closeModal");
const searchInputToday = document.getElementById("searchInputToday");
const tableBodyToday = document.querySelector("#data-table-today tbody");
const todayAdminActions = document.getElementById("todayAdminActions");
const exportTodayBtn = document.getElementById("exportTodayBtn");
const saveTodayBtn = document.getElementById("saveTodayBtn");
const errorContainerToday = document.getElementById("error-container-today");
const retryButtonToday = document.getElementById("retry-button-today");
const toggleAllDataBtn = document.getElementById("toggleAllDataBtn");
function isAdminUser() {
  const savedUsername = localStorage.getItem('username');
  const userAuth = localStorage.getItem('userAuth');
  return savedUsername === '7512411' || userAuth === 'Admin';
}

function getTodayRowKey(row) {
  const rowIdRaw = row.row_id || row.id || row.IDRow || row.idRow || row.IdRow || '';
  if (rowIdRaw !== '') {
    return `id:${rowIdRaw}`;
  }
  const idRow = row.IDRow || row.idRow || '';
  const timestamp = row.timestamp || row.Timestamp || '';
  const material = row.material || row.Material || '';
  return `fallback:${idRow}|${timestamp}|${material}`;
}
function getNextTodayRowId() {
  const numericIds = allDataToday
    .map(row => Number(row.IDRow || row.id || row.row_id))
    .filter(num => !Number.isNaN(num) && num > 0);
  if (!numericIds.length) return 1;
  return Math.max(...numericIds) + 1;
}
function normalizeTodayRow(rawRow, fallbackPayload = {}) {
  if (!rawRow && !fallbackPayload) return null;
  const source = rawRow || {};
  const fallback = fallbackPayload || {};
  const resolvedId =
    source.IDRow ||
    source.id ||
    source.row_id ||
    fallback.IDRow ||
    fallback.id ||
    fallback.row_id ||
    getNextTodayRowId();
  const resolvedTimestamp =
    source.Timestamp ||
    source.timestamp ||
    fallback.Timestamp ||
    fallback.timestamp ||
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const resolvedStatus = source.status || fallback.status || 'รอเบิก';

  return {
    ...fallback,
    ...source,
    IDRow: resolvedId,
    row_id: resolvedId,
    id: resolvedId,
    Timestamp: resolvedTimestamp,
    status: resolvedStatus,
    material: source.material || source.Material || fallback.material || '',
    description: source.description || source.Description || fallback.description || '',
    quantity: source.quantity ?? fallback.quantity ?? '',
    vibhavadi: source.vibhavadi ?? fallback.vibhavadi ?? '',
    navanakorn: source.navanakorn ?? fallback.navanakorn ?? '',
    employeeName: source.employeeName || source.EmployeeName || fallback.employeeName || '',
    employeeCode: source.employeeCode || source.EmployeeCode || fallback.employeeCode || '',
    team: source.team || source.Team || fallback.team || '',
    CallNumber: source.CallNumber || source.callNumber || fallback.callNumber || '',
    CallType: source.CallType || source.callType || fallback.callType || '',
    remark: source.remark || fallback.remark || ''
  };
}
function prependTodayRow(rawRow, fallbackPayload = {}) {
  const normalized = normalizeTodayRow(rawRow, fallbackPayload);
  if (!normalized) return null;
  const keyToAdd = getTodayRowKey(normalized);
  const existingIndex = allDataToday.findIndex(row => getTodayRowKey(row) === keyToAdd);
  if (existingIndex >= 0) {
    allDataToday.splice(existingIndex, 1);
  }
  allDataToday.unshift(normalized);
  return normalized;
}

function getSelectedTodayRows() {
  const checkboxes = document.querySelectorAll('#data-table-today tbody .today-select-checkbox:checked');
  if (!checkboxes.length) return [];
  const rowMap = new Map();
  allDataToday.forEach(row => {
    rowMap.set(getTodayRowKey(row), row);
  });
  return Array.from(checkboxes)
    .map(cb => rowMap.get(cb.dataset.rowKey))
    .filter(Boolean);
}
function syncTodayAdminActionsVisibility() {
  if (!todayAdminActions) return;
  todayAdminActions.style.display = isAdminUser() ? 'flex' : 'none';
}
if (exportTodayBtn) {
  exportTodayBtn.addEventListener('click', () => {
    if (isAdminUser()) {
      exportTodayData();
    }
  });
}
if (saveTodayBtn) {
  saveTodayBtn.addEventListener('click', () => {
    if (isAdminUser()) {
      saveTodayDataSnapshot();
    }
  });
}
// === ปุ่มสลับ รอเบิก ↔ ประวัติเบิก (เวอร์ชันสมบูรณ์ 100%) ===
if (toggleAllDataBtn) {
  toggleAllDataBtn.addEventListener("click", () => {
    showOnlyPending = !showOnlyPending;
    if (showOnlyPending) {
      // โหมด: แสดงเฉพาะรอเบิก
      toggleAllDataBtn.innerHTML = '<i class="fas fa-clock"></i> <span>ทั้งหมด</span>';
      toggleAllDataBtn.title = "กำลังแสดงเฉพาะรายการที่รอเบิก";
      toggleAllDataBtn.style.background = "linear-gradient(135deg, #ccd3db, #e3e7ed)";
      toggleAllDataBtn.style.color = "white";
    } else {
      // โหมด: แสดงประวัติทั้งหมด
      toggleAllDataBtn.innerHTML = '<i class="fas fa-history"></i> <span>รอเบิก</span>';
      toggleAllDataBtn.title = "กำลังแสดงประวัติเบิกทั้งหมด";
      toggleAllDataBtn.style.background = "linear-gradient(135deg, #ccd3db, #e3e7ed)";
      toggleAllDataBtn.style.color = "white";
    }
    // รีเซ็ตหน้าแรก + อัปเดตตารางทันที
    currentPageToday = 1;
    updateTableToday();
  });
}

// Pagination elements for today tab
const paginationToday = document.getElementById("paginationToday");
const pageNumbersToday = document.getElementById("pageNumbersToday");
const itemsPerPageSelectToday = document.getElementById("itemsPerPageToday");
const firstPageButtonToday = document.getElementById("firstPageToday");
const prevPageButtonToday = document.getElementById("prevPageToday");
const nextPageButtonToday = document.getElementById("nextPageToday");
const lastPageButtonToday = document.getElementById("lastPageToday");
let allDataToday = [];
let currentFilteredDataToday = [];
let todayFetchController = null;
let announcementCache = [];
// บังคับให้หัวคอลัมน์ "รูป" โผล่เสมอ (กัน cache หน้าเก่า)
function ensureTodayImageColumn() {
  const table = document.getElementById("data-table-today");
  if (!table) return;
  const headerRow = table.querySelector("thead tr");
  if (!headerRow) return;
  const hasImageHeader = Array.from(headerRow.children).some(th => th.textContent.trim() === "รูป");
  if (!hasImageHeader) {
    const th = document.createElement("th");
    th.textContent = "รูป";
    // แทรกหลังคอลัมน์ลำดับ (index 2 รวม status/idRow)
    const insertBeforeNode = headerRow.children[2] || null;
    headerRow.insertBefore(th, insertBeforeNode);
  }
}
ensureTodayImageColumn();
// บังคับให้หัวคอลัมน์ "image" (imageMIx) โผล่เสมอในแท็บ parts
function ensurePartsImageDbColumn() {
  const table = document.getElementById("data-table");
  if (!table) return;
  const headerRow = table.querySelector("thead tr");
  if (!headerRow) return;
  const headers = Array.from(headerRow.children).map(th => th.textContent.trim());
  if (!headers.includes("image")) {
    const th = document.createElement("th");
    th.textContent = "image";
    const insertBeforeNode = headerRow.children[1] || null; // ถัดจากคอลัมน์ "เบิก"
    headerRow.insertBefore(th, insertBeforeNode);
  }
}
ensurePartsImageDbColumn();
// All tab variables (moved up)
const modalAll = document.getElementById("detailModalAll");
const modalContentAll = document.getElementById("modalContentAll");
const closeModalAll = document.getElementById("closeModalAll");
const searchInputAll = document.getElementById("searchInputAll");
const tableBodyAll = document.querySelector("#data-table-all tbody");
const pageNumbersContainerAll = document.getElementById("pageNumbersAll");
const firstPageButtonAll = document.getElementById("firstPageAll");
const prevPageButtonAll = document.getElementById("prevPageAll");
const nextPageButtonAll = document.getElementById("nextPageAll");
const lastPageButtonAll = document.getElementById("lastPageAll");
const itemsPerPageSelectAll = document.getElementById("itemsPerPageAll");
let allDataAll = [];
let currentPageAll = 1;
let itemsPerPageAll = parseInt(itemsPerPageSelectAll.value);
// Pending calls tab variables (moved up)
const urlPending = '/api/pending';
const modalPending = document.getElementById("detailModalPending");
const modalContentPending = document.getElementById("modalContentPending");
const closeModalPending = document.getElementById("closeModalPending");
const teamFilterPending = document.getElementById("teamFilterPending");
const searchInputPending = document.getElementById("searchInputPending");
const searchButtonPending = document.getElementById("searchButtonPending");
const tableBodyPending = document.querySelector("#data-table-pending tbody");
const pageNumbersContainerPending = document.getElementById("pageNumbersPending");
const firstPageButtonPending = document.getElementById("firstPagePending");
const prevPageButtonPending = document.getElementById("prevPagePending");
const nextPageButtonPending = document.getElementById("nextPagePending");
const lastPageButtonPending = document.getElementById("lastPagePending");
const itemsPerPageSelectPending = document.getElementById("itemsPerPagePending");
let allDataPending = [];
let currentPagePending = 1;
let itemsPerPagePending = 20;
let sortConfigPending = { column: null, direction: 'asc' };
let employeeDataPromise = null;
// Image Modal Handling for #parts (moved up)
const imageModal = document.getElementById('imageModal');
const imageModalContent = document.getElementById('imageModalContent');
const closeImageModal = document.getElementById('closeImageModal');
closeImageModal.onclick = () => {
  imageModal.style.display = 'none';
};
// Image Modal Handling for #images (moved up)
const imageModalImages = document.getElementById('imageModalImages');
const imageModalContentImages = document.getElementById('imageModalContentImages');
const closeImageModalImages = document.getElementById('closeImageModalImages');
closeImageModalImages.onclick = () => {
  imageModalImages.style.display = 'none';
};
// Theme Management
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  document.body.classList.remove('dark-mode', 'light-mode');
  document.body.classList.add(theme + '-mode');
}
function loadTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  setTheme(theme);
  if (document.getElementById('themeSelect')) {
    document.getElementById('themeSelect').value = theme;
  }
}
function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
let settingsDragInitialized = false;
function resetSettingsPosition() {
  const modalContent = document.querySelector('.settings-modal-content');
  if (!modalContent) return;
  modalContent.style.left = '50%';
  modalContent.style.top = '50%';
  modalContent.style.transform = 'translate(-50%, -50%)';
  modalContent.classList.remove('dragging');
}
function setupSettingsDragging() {
  if (settingsDragInitialized) return;
  const modalContent = document.querySelector('.settings-modal-content');
  const dragHandle = document.querySelector('.settings-topbar');
  if (!modalContent || !dragHandle) return;
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  const startDrag = (event) => {
    if (event.target.closest('.close-settings')) return;
    const e = event.touches ? event.touches[0] : event;
    isDragging = true;
    const rect = modalContent.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    modalContent.classList.add('dragging');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
  };
  const onDrag = (event) => {
    if (!isDragging) return;
    const e = event.touches ? event.touches[0] : event;
    if (event.cancelable) {
      event.preventDefault();
    }
    const rect = modalContent.getBoundingClientRect();
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;
    const maxLeft = window.innerWidth - rect.width - 12;
    const maxTop = window.innerHeight - rect.height - 12;
    newLeft = Math.min(Math.max(newLeft, 12), Math.max(maxLeft, 12));
    newTop = Math.min(Math.max(newTop, 12), Math.max(maxTop, 12));
    modalContent.style.left = `${newLeft}px`;
    modalContent.style.top = `${newTop}px`;
    modalContent.style.transform = 'none';
  };
  const endDrag = () => {
    isDragging = false;
    modalContent.classList.remove('dragging');
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
  };
  dragHandle.addEventListener('mousedown', startDrag);
  dragHandle.addEventListener('touchstart', startDrag);
  settingsDragInitialized = true;
}
document.addEventListener('DOMContentLoaded', setupSettingsDragging);
async function showSettings() {
  setupSettingsDragging();
  resetSettingsPosition();
  const currentTheme = localStorage.getItem('theme') || 'light';
  const savedUsername = localStorage.getItem('username');
  const savedUserName = localStorage.getItem('userName') || 'ไม่พบชื่อ';
  const userAuth = localStorage.getItem('userAuth') || 'None'; // ดึงค่า Auth
  const isAdminAuth = userAuth === 'Admin';
  const isActiveAuth = userAuth === '0326';

  // แสดงข้อมูลพื้นฐาน
  document.getElementById('modalUserName').textContent = savedUserName;
  document.getElementById('modalUserID').textContent = savedUsername || '-';
  document.getElementById('modalUserTeam').textContent = 'กำลังโหลด...';
  document.getElementById('modalUserAuth').textContent = isAdminAuth ? 'Admin' : isActiveAuth ? 'Active' : 'None';
  document.getElementById('themeSelect').value = currentTheme;

  // สีสถานะ Auth
  const authElement = document.getElementById('modalUserAuth');
  if (isAdminAuth) {
    authElement.style.color = '#6c5ce7'; // สีสำหรับ Admin
    authElement.style.fontWeight = 'bold';
  } else if (isActiveAuth) {
    authElement.style.color = '#27ae60'; // สีเขียว
    authElement.style.fontWeight = 'bold';
  } else {
    authElement.style.color = '#e74c3c'; // สีแดง
    authElement.style.fontWeight = 'bold';
  }

  // ดึงหน่วยงาน
  try {
    const user = employeeData.find(e => e.IDRec?.toString().trim() === savedUsername);
    document.getElementById('modalUserTeam').textContent = user?.หน่วยงาน || 'ไม่พบข้อมูลหน่วยงาน';
    document.getElementById('modalUserTeam').style.color = user?.หน่วยงาน ? '#1976d2' : '#e74c3c';
  } catch (err) {
    document.getElementById('modalUserTeam').textContent = 'โหลดข้อมูลไม่สำเร็จ';
    document.getElementById('modalUserTeam').style.color = '#e74c3c';
  }

  // แสดงปุ่มประกาศสำหรับ admin (7512411)
  const adminSection = document.getElementById('adminAnnouncementSection');
  if (savedUsername === '7512411' && adminSection) {
    adminSection.style.display = 'flex';
  } else if (adminSection) {
    adminSection.style.display = 'none';
  }

  // เปิด Modal
  document.getElementById('settingsModal').style.display = 'block';

  // ผูก event ทุกครั้งที่เปิด Settings
  document.getElementById('themeSelect').onchange = null; // ล้าง event เก่า
  document.getElementById('themeSelect').addEventListener('change', function (e) {
    setTheme(e.target.value);
  });

  // เรียกอัปเดตเวอร์ชันแอป (ถ้ามี)
  updateAppVersionDisplay();
}
// ฟังก์ชันตรวจสอบสิทธิ์การเบิก
function checkAuthForRequisition() {
  const userAuth = localStorage.getItem('userAuth') || 'None';
  const savedUsername = localStorage.getItem('username');
  const hasPermission = savedUsername === '7512411' || userAuth === '0326' || userAuth === 'Admin';

  // ถ้าเป็น Admin ให้อนุญาตเสมอ
  if (hasPermission) {
    return true;
  }

  // ถ้าไม่ใช่ ให้แสดง Popup และ return false
  Swal.fire({
    icon: 'warning',
    title: 'Rank คุณยังไม่ถึงเกณฑ์!',
    html: `
      <div style="text-align:center; padding:10px;">
        <i class="fas fa-lock" style="font-size:60px; color:#f39c12; margin-bottom:15px;"></i>
        <p style="font-size:18px; font-weight:bold; color:#e67e22;">คุณไม่มีสิทธิ์ในการเบิกอะไหล่</p>
        <p style="color:#7f8c8d; margin-top:10px;">กรุณาติดต่อ Admin เพื่อสอบถามสิทธิ์</p>
        <div style="margin-top:20px; padding:15px; background:#fff3cd; border-radius:10px; border-left:5px solid #f39c12;">
          <p style="margin:0; font-size:14px; color:#856404;">
            <i class="fas fa-info-circle"></i> 
            ผู้ใช้ทั่วไปสามารถค้นหาข้อมูลได้เท่านั้น
          </p>
        </div>
      </div>
    `,
    confirmButtonText: 'ตกลง',
    confirmButtonColor: '#f39c12',
    width: window.innerWidth <= 480 ? '90%' : '500px'
  });

  return false;
}
// Close settings modal
document.getElementById('closeSettings').onclick = () => {
  document.getElementById('settingsModal').style.display = 'none';
};
window.addEventListener('click', (event) => {
  const settingsModal = document.getElementById('settingsModal');
  if (event.target === settingsModal) {
    settingsModal.style.display = 'none';
  }
  // Existing modals...
  if (event.target == modal) closeModal.click();
  if (event.target == modalAll) closeModalAll.click();
  if (event.target == modalPending) closeModalPending.click();
  // Image modals
  if (event.target === imageModal) {
    imageModal.style.display = 'none';
  }
  if (event.target === imageModalImages) {
    imageModalImages.style.display = 'none';
  }
});
// Login System
const loginModal = document.getElementById('loginModal');
const appContent = document.getElementById('appContent');
const logoutBtn = document.getElementById('logoutBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');
const rememberMeCheckbox = document.getElementById('rememberMe');
const togglePasswordIcon = document.getElementById('togglePassword');
const userNameSmall = document.getElementById('userNameSmall');
function togglePasswordVisibility() {
  const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
  passwordInput.setAttribute('type', type);
  togglePasswordIcon.classList.toggle('fa-eye-slash');
  togglePasswordIcon.classList.toggle('fa-eye');
}
// แทนที่ฟังก์ชัน loadEmployeeData() เดิมทั้งหมดด้วยอันนี้
async function loadEmployeeData() {
  if (employeeDataLoaded && employeeData.length > 0) {
    return employeeData;
  }
  
  if (employeeDataPromise) {
    return employeeDataPromise;
  }
  
  const employeeUrl = '/api/employee';
  
  employeeDataPromise = apiFetch(employeeUrl)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log("ข้อมูลพนักงานที่ดึงมา:", data); // เพิ่มบรรทัดนี้เพื่อ debug
      employeeData = data;
      employeeDataLoaded = true;
      
      // อัปเดต Auth ใน localStorage ถ้ามีการล็อกอินอยู่
      const savedUsername = localStorage.getItem('username');
      if (savedUsername) {
        const employee = employeeData.find(e => 
          e.IDRec && e.IDRec.toString().trim() === savedUsername
        );
        if (employee && employee.Auth) {
          localStorage.setItem('userAuth', employee.Auth);
          console.log(`ตั้งค่า Auth สำหรับ ${savedUsername}: ${employee.Auth}`); // Debug
        } else {
          localStorage.setItem('userAuth', 'None');
          console.log(`ไม่พบ Auth สำหรับ ${savedUsername}`); // Debug
        }
      }
      
      employeeDataPromise = null;
      return data;
    })
    .catch(err => {
      employeeDataPromise = null;
      throw err;
    });
    
  return employeeDataPromise;
}
async function handleLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  loginError.style.display = 'none';
  
  if (!username || !password) {
    loginError.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    loginError.style.display = 'block';
    return;
  }
  
  try {
    const response = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result || result.status !== 'success' || !result.user) {
      throw new Error('Invalid response');
    }

    const user = result.user;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('username', username);
    localStorage.setItem('userName', user.name || username);
    localStorage.setItem('userAuth', user.auth || 'None');

    console.log(`ผู้ใช้ ${username} ล็อกอินสำเร็จ, Auth = ${user.auth || 'None'}`);

    if (rememberMeCheckbox.checked) {
      localStorage.setItem('savedUsername', username);
      localStorage.setItem('rememberMe', 'true');
    } else {
      localStorage.removeItem('savedUsername');
      localStorage.removeItem('rememberMe');
    }

    checkLoginStatus();
    setTimeout(() => {
      const searchInput = document.getElementById('searchInput1');
      if (searchInput) searchInput.focus();
    }, 500);
  } catch (error) {
    const message = error.message && error.message.includes('401')
      ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!'
      : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่';
    loginError.textContent = message;
    loginError.style.display = 'block';
    passwordInput.value = '';
    console.error('Login error:', error);
  }
}
async function checkLoginStatus() {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const savedUsername = localStorage.getItem('username');
  
  if (isLoggedIn && savedUsername) {
    // เริ่มโหลดข้อมูลทันที
    loginModal.classList.remove('active');
    appContent.classList.add('logged-in');
    
    try {
      // ✅ รอให้โหลด employee data ให้เสร็จก่อน
      await loadEmployeeData();
      
      // ✅ อัปเดต Auth จาก employeeData
      const employee = employeeData.find(e => e.IDRec?.toString().trim() === savedUsername);
      if (employee && employee.Auth) {
        localStorage.setItem('userAuth', employee.Auth);
        console.log(`ตั้งค่า Auth สำหรับ ${savedUsername}: ${employee.Auth}`);
      } else {
        localStorage.setItem('userAuth', 'None');
        console.log(`ไม่พบ Auth สำหรับ ${savedUsername}`);
      }
      syncTodayAdminActionsVisibility();
      
      // โหลดฐานข้อมูลรูปภาพ
      loadImageDatabase().catch(console.error);
      
      // แสดงชื่อผู้ใช้ (ถ้ามี)
      const savedUserName = localStorage.getItem('userName') || savedUsername;
      if (userNameSmall) userNameSmall.textContent = savedUserName;
      
      // โหลดแท็บเริ่มต้น
      showTab('parts');
    } catch (err) {
      console.error("โหลดข้อมูลเริ่มต้นล้มเหลว:", err);
      // ถ้าโหลดไม่ได้ → ให้ล็อกเอาท์
      handleLogout();
    }
  } else {
    loginModal.classList.add('active');
    appContent.classList.remove('logged-in');
    // ล้าง session เท่านั้น
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('userName');
    localStorage.removeItem('userAuth');
    syncTodayAdminActionsVisibility();
  }
  
  // โหลดการตั้งค่า "Remember me"
  if (localStorage.getItem('rememberMe') === 'true') {
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername && usernameInput) {
      usernameInput.value = savedUsername;
      rememberMeCheckbox.checked = true;
    }
  }
   setTimeout(() => {
      checkNewAnnouncements();
    }, 1500);
    setupNotificationAfterLogin();
}
function handleLogout() {
  apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('username');
  localStorage.removeItem('userName');
  localStorage.removeItem('userAuth'); // เพิ่มบรรทัดนี้
  localStorage.removeItem('savedUsername');
  localStorage.removeItem('savedPassword');
  localStorage.removeItem('rememberMe');
  syncTodayAdminActionsVisibility();
  checkLoginStatus();
  // Close settings modal if open
  document.getElementById('settingsModal').style.display = 'none';
}
// Allow Enter key for login
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleLogin();
  }
});
// === showTab(tabId) เวอร์ชันสมบูรณ์ 100% (คัดลอกแทนที่ทั้งหมด) ===
function showTab(tabId) {
  let tabPromise = null;
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
  const target = document.getElementById(tabId);
  if (!target) return;
  target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");

  document.getElementById("loading").style.display = "flex";

  switch (tabId) {
    case "parts":
      searchInput1.value = globalSearch1 || '';
      searchInput2.value = globalSearch2 || '';
      loadImageDatabase();
      if (!partsDataLoaded) {
        loadData().then(() => {
          partsDataLoaded = true;
          hideLoading();
          // ไม่ต้อง apply filter เพราะ loadData() เรียก applyFilters() อยู่แล้ว
        });
      } else {
        applyFilters(); // 👈 เพิ่มบรรทัดนี้!
        hideLoading();
      }
      break;
    case "images":
      searchInputImages1.value = globalSearch1 || '';
      searchInputImages2.value = globalSearch2 || '';
      loadImageDatabase(); // ยังใช้ได้ สำหรับแสดงรูปใน modal
      // ไม่โหลดข้อมูลใหม่ → ใช้ allData เดิม
      applyFiltersImages(); // กรองจาก allData + มี id
      hideLoading();
      break;
    case "today": {
      // แสดงข้อมูลเก่าทันที (ถ้ามี) แล้วไปดึงข้อมูลสดจาก opensheet
      const hasCachedToday = allDataToday.length > 0;
      const skipAt = Number(sessionStorage.getItem('skipTodayReloadOnceAt') || '0');
      const shouldSkip = skipTodayReloadOnce && skipAt && (Date.now() - skipAt) < 30000;
      if (shouldSkip) {
        if (hasCachedToday) {
          updateTableToday();
        }
        hideLoading();
        skipTodayReloadOnce = false;
        sessionStorage.removeItem('skipTodayReloadOnceAt');
        tabPromise = Promise.resolve();
        break;
      }
      skipTodayReloadOnce = false;
      sessionStorage.removeItem('skipTodayReloadOnceAt');
      if (hasCachedToday) {
        updateTableToday();
        hideLoading();
      }
      tabPromise = loadTodayData({ silent: hasCachedToday }).then(() => {
        todayDataLoaded = true;
        hideLoading();
      }).finally(() => {
        skipTodayReloadOnce = false;
      });
      break;
    }
    case "pending-calls":
      if (!pendingDataLoaded) loadPendingCallsData().then(() => { pendingDataLoaded = true; hideLoading(); });
      else hideLoading();
      break;
    default:
      hideLoading();
  }
   if (tabId !== 'loading') {
    setTimeout(() => {
      checkNewAnnouncements();
    }, 500);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return tabPromise;
}
// ฟังก์ชันปิด Loading (ใช้ร่วมกับ showTab)
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}
function showQRCode() {
  Swal.fire({
    title: '📷 สแกน QR Code',
    html: `
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://request-nawanakorn.vercel.app/" alt="QR Code" class="swal2-qrcode" style="width: 150px; height: 150px;">
            <p>สแกนเพื่อเข้าสู่ระบบขอเบิกอะไหล่</p>
          `,
    confirmButtonText: 'ปิด',
    customClass: {
      popup: 'swal2-popup',
      title: 'swal2-title',
      confirmButton: 'swal2-confirm'
    }
  });
}
// แสดงคู่มือการใช้งานแบบย่อสำหรับผู้ใช้ใหม่
function showHelp() {
  Swal.fire({
    title: 'วิธีใช้งาน PartsGo',
    html: `
      <div style="text-align:left;font-size:15px;line-height:1.5;">
        <p><strong>วัตถุประสงค์</strong><br>ค้นหาอะไหล่ ดูรูป เช็กสต็อก และส่งคำขอเบิกได้ด้วยตัวเอง</p>
        <p><strong>เริ่มต้น</strong><br>1) ล็อกอิน User และ Password <br>2) เลือกแท็บที่ต้องการด้านล่าง (ค้นหาอะไหล่ / รูปภาพ / เบิกวันนี้ / Call)</p>
        <p><strong>ค้นหาอะไหล่</strong><br>- พิมพ์คำค้นในช่อง ค้นหา1/ค้นหา2 แล้วผลจะกรองอัตโนมัติ<br>- คลิกรูปหรือแถวเพื่อดูรายละเอียดและกด “เบิกเลย” (ถ้ามีสิทธิ์)</p>
        <p><strong>ค้นหารูป</strong><br>- ใช้คำค้นเหมือนแท็บอะไหล่ ภาพจะแสดงเป็นการ์ด<br>- คลิกรูปเพื่อเปิด popup ดูข้อมูลอะไหล่</p>
        <p><strong>เบิกวันนี้ / Call</strong><br>- ดูสถานะการเบิกวันนี้หรือรายการ Call ที่รอ<br>- ใช้ปุ่มตัวกรองและค้นหาเพื่อตรวจสอบรายละเอียด</p>
        <p><strong>ทริก</strong><br>- ปุ่ม Clear ล้างคำค้นทั้งสองช่อง<br>- ปุ่ม Update ในเมนูช่วยรีเฟรชแคชหากข้อมูลไม่อัปเดต</p>
      </div>
    `,
    confirmButtonText: 'รับทราบ',
    width: '650px'
  });
}

// ย้าย modal ออกจาก .tab-content ถ้าถูกซ่อนอยู่ เพื่อให้แสดงได้ทุกแท็บ
function getModalElement(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;
  const parent = modal.parentElement;
  if (parent && parent.classList.contains('tab-content')) {
    document.body.appendChild(modal);
  }
  return modal;
}

// === แทนที่ฟังก์ชัน showDetailModal ทั้งหมด ===
// === showDetailModal เวอร์ชันสมบูรณ์ 100% (คัดลอกแทนที่ทั้งหมด) ===
function showDetailModal(row, modalId, contentId, options = {}) {
  const { showInfo = true } = options;
  const material = (row.Material || "").toString().trim();
  console.log("เปิด Modal รายละเอียด → Material:", material);
  
  // ตรวจสอบสิทธิ์ Auth
  const userAuth = localStorage.getItem('userAuth') || 'None';
  const savedUsername = localStorage.getItem('username');
  const hasPermission = savedUsername === '7512411' || userAuth === '0326' || userAuth === 'Admin';
  
  let galleryHtml = '';
  let imageIds = [];
  
  // 1. ลำดับความสำคัญ: ดึงจากฐานใหม่ MainSapimage ก่อน
  if (imageDbLoaded && imageDatabase[material] && imageDatabase[material].length > 0) {
    imageIds = imageDatabase[material];
    console.log(`เจอ ${imageIds.length} รูปจาก MainSapimage`);
  }
  // 2. ถ้าไม่มี → ดึงจาก UrlWeb เดิม (fallback)
  else if (row.UrlWeb && typeof row.UrlWeb === 'string') {
    const match = row.UrlWeb.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
      row.UrlWeb.match(/id=([a-zA-Z0-9-_]+)/) ||
      row.UrlWeb.match(/uc\?id=([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      imageIds = [match[1]];
      console.log("ใช้รูปจาก UrlWeb เดิม (fallback):", imageIds[0]);
    }
  }
  
  // สร้าง Gallery ตามจำนวนรูป
  if (imageIds.length === 0) {
    galleryHtml = `
    <div style="width:380px;height:380px;background:#000;display:flex;align-items:center;justify-content:center;margin:0 auto;color:#ccc;font-size:20px;">
      ไม่มีรูปภาพในระบบ
    </div>`;
  }
  // กรณีมีรูป (ไม่ว่าจะ 1 หรือหลายรูป → ใช้โครงสร้างเดียวกัน)
  else {
    galleryHtml = `
    <div class="image-swiper-container">
      <div class="image-swiper-wrapper" style="width:${imageIds.length * 100}%;">
        ${imageIds.map(id => `
          <div class="image-slide">
            <img src="https://drive.google.com/thumbnail?id=${id}&sz=w1000"
                 alt="รูปอะไหล่"
                 onerror="this.src='https://via.placeholder.com/380/111/fff?text=ไม่มีรูป';">
          </div>
        `).join('')}
      </div>
      <!-- ปุ่มลูกศร (แสดงเฉพาะตอนมีหลายรูป) -->
      ${imageIds.length > 1 ? `
        <button class="swiper-btn swiper-prev">‹</button>
        <button class="swiper-btn swiper-next">›</button>
        <div class="swiper-counter">1 / ${imageIds.length}</div>
      ` : ''}
    </div>`;
  }
  
  // สร้างปุ่ม "เบิกเลย" ตามสิทธิ์ (แสดงเฉพาะกรณี showInfo)
  let requisitionButtonHtml = '';
  if (showInfo) {
    if (hasPermission) {
      requisitionButtonHtml = `
        <button class="requisition-button header-btn" onclick="showRequisitionDialog(${JSON.stringify(row).replace(/"/g, '&quot;')})">
          เบิกเลย
        </button>
      `;
    } else {
      requisitionButtonHtml = `
        <button class="requisition-button-disabled header-btn" onclick="checkAuthForRequisition()" 
                title="ไม่มีสิทธิ์เบิกอะไหล่" style="opacity:0.7; cursor:not-allowed;">
          เบิกเลย
        </button>
      `;
    }
  }
  
  // ส่วนข้อมูลด้านล่าง (ซ่อนเมื่อ showInfo = false)
  const infoHtml = showInfo ? `
    <div class="detail-info">
      <div class="detail-header-row">
        <h2>รายละเอียดอะไหล่</h2>
        ${requisitionButtonHtml}
      </div>
      <div class="detail-row"><span class="label">Material</span><span class="value">${material}</span></div>
      <div class="detail-row"><span class="label">Description</span><span class="value">${row.Description || '-'}</span></div>
      <div class="detail-row"><span class="label">Storage bin</span><span class="value">${getStorageBinValue(row) || '-'}</span></div>
      <div class="detail-row"><span class="label">วิภาวดี</span><span class="value">${row["วิภาวดี"] ? Number(row["วิภาวดี"]).toLocaleString() + ' ชิ้น' : '0 ชิ้น'}</span></div>
      <div class="detail-row"><span class="label">นวนคร</span><span class="value">${row["Unrestricted"] ? Number(row["Unrestricted"]).toLocaleString() + ' ชิ้น' : '0 ชิ้น'}</span></div>
      ${row["Rebuilt"] ? `<div class="detail-row"><span class="label">Rebuilt</span><span class="value rebuilt-text">${row["Rebuilt"]}</span></div>` : ''}
      ${row["Product"] ? `<div class="detail-row"><span class="label">Product</span><span class="value">${row["Product"]}</span></div>` : ''}
      ${row["OCRTAXT"] ? `<div class="detail-row"><span class="label">Spec</span><span class="value spec-text">${row["OCRTAXT"]}</span></div>` : ''}
      ${row["หมายเหตุ"] ? `<div class="detail-row"><span class="label" style="color:#e74c3c;font-weight:bold;">หมายเหตุ</span><span class="value" style="color:#e74c3c;font-weight:bold;">${row["หมายเหตุ"]}</span></div>` : ''}
      
      <!-- แสดงสถานะสิทธิ์ของผู้ใช้ -->
      <div class="detail-row" style="margin-top:15px; padding-top:15px; border-top:1px dashed #ddd;">
        <span class="label" style="color:#7f8c8d;">สถานะสิทธิ์:</span>
        <span class="value" style="color:${hasPermission ? '#27ae60' : '#e74c3c'}; font-weight:bold;">
          ${hasPermission ? '✓ สามารถเบิกได้' : '✗ ไม่มีสิทธิ์เบิก'}
        </span>
      </div>
    </div>
  ` : '';
  
  // แสดง Modal
  const modal = getModalElement(modalId);
  const content = document.getElementById(contentId);
  if (!modal || !content) {
    console.error("ไม่พบ modal สำหรับแสดงรูป", modalId, contentId);
    return;
  }
  content.innerHTML = galleryHtml + infoHtml;
  modal.style.display = 'block';
  modal.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  
  // ถ้ามีหลายรูป → เริ่ม Swipe
  if (imageIds.length > 1) {
    setTimeout(() => initSwiper(modal, imageIds.length), 150); // เพิ่ม delay นิดนึงให้ DOM สร้างเสร็จ
  }
}
// === ฟังก์ชัน Swipe (ต้องมีด้วย) ===
// ตัวแปรเก็บ index ปัจจุบันของแต่ละ Modal
let currentSwiperIndex = {};
function initSwiper(modal) {
  const container = modal.querySelector('.image-swiper-container');
  if (!container) return;

  const wrapper = container.querySelector('.image-swiper-wrapper');
  const prevBtn = container.querySelector('.swiper-prev');
  const nextBtn = container.querySelector('.swiper-next');
  const counter = container.querySelector('.swiper-counter');
  const modalId = modal.id;

  currentSwiperIndex[modalId] = 0;
  const totalSlides = wrapper.children.length;

  const updateSlide = () => {
    const idx = currentSwiperIndex[modalId];
    wrapper.style.transform = `translateX(-${idx * 100}%)`;
    counter.textContent = `${idx + 1} / ${totalSlides}`;
  };

  const goPrev = () => {
    let idx = currentSwiperIndex[modalId];
    idx = idx > 0 ? idx - 1 : totalSlides - 1;
    currentSwiperIndex[modalId] = idx;
    updateSlide();
  };

  const goNext = () => {
    let idx = currentSwiperIndex[modalId];
    idx = idx < totalSlides - 1 ? idx + 1 : 0;
    currentSwiperIndex[modalId] = idx;
    updateSlide();
  };

  // ลูกศร
  if (prevBtn) prevBtn.onclick = goPrev;
  if (nextBtn) nextBtn.onclick = goNext;

  // Touch Swipe
  let startX = 0;
  container.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextBtn.click();
      else prevBtn.click();
    }
  }, { passive: true });

  // Keyboard (arrow keys)
  document.addEventListener('keydown', e => {
    if (modal.style.display !== 'block') return;
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === 'ArrowRight') goNext();
  });

  updateSlide();
}
// Global handlers สำหรับปุ่มลูกศร (ถ้าต้องการเรียกจาก onclick)
window.handleSwiperPrev = function (btn) {
  const container = btn.closest('.image-swiper-container');
  const modalId = container.closest('.image-modal, .image-modal-images').id;
  const prevIdx = (currentSwiperIndex[modalId] || 0) - 1;
  currentSwiperIndex[modalId] = prevIdx < 0 ? container.querySelector('.image-swiper-wrapper').children.length - 1 : prevIdx;
  initSwiper(document.getElementById(modalId)); // Re-init to update
};
window.handleSwiperNext = function (btn) {
  const container = btn.closest('.image-swiper-container');
  const modalId = container.closest('.image-modal, .image-modal-images').id;
  const wrapper = container.querySelector('.image-swiper-wrapper');
  const total = wrapper.children.length;
  let nextIdx = (currentSwiperIndex[modalId] || 0) + 1;
  currentSwiperIndex[modalId] = nextIdx >= total ? 0 : nextIdx;
  initSwiper(document.getElementById(modalId)); // Re-init to update
};
// ปิด modal ทุกช่องทาง → ปลดล็อกพื้นหลังทันที
function closeAllImageModals() {
  document.getElementById('imageModal').style.display = 'none';
  document.getElementById('imageModalImages').style.display = 'none';
  document.body.style.overflow = 'auto'; // ปลดล็อกพื้นหลัง
  currentSwiperIndex = {};
}
// ปุ่ม X
document.querySelectorAll('.image-close, .image-close-images').forEach(btn => {
  btn.onclick = () => {
    closeAllImageModals();
  };
});
// คลิกพื้นหลัง
window.addEventListener('click', (e) => {
  if (e.target.id === 'imageModal' || e.target.id === 'imageModalImages') {
    closeAllImageModals();
  }
});
// เพิ่มปุ่ม ESC บนคีย์บอร์ดด้วย (สะดวกมาก)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllImageModals();
  }
});
// Event listener for lightbox close on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('lightbox').style.display === 'flex') {
    closeLightbox();
  }
});
// Parts tab functions (now after variables)
itemsPerPageSelect.addEventListener("change", () => {
  itemsPerPage = parseInt(itemsPerPageSelect.value, 10);
  currentPage = 1;
  renderTableData();
  renderPagination(allData.length);
});
retryButton.addEventListener("click", () => {
  errorContainer.style.display = "none";
  loadData();
});
function renderTableToday(data) {
  if (!tableBodyToday) {
    console.error("Table body for #data-table-today not found");
    return;
  }

  const fragment = document.createDocumentFragment();

  data.forEach((row) => {
    const tr = document.createElement("tr");

    // Checkbox selection (admin only)
    const selectTd = document.createElement("td");
    if (isAdminUser()) {
      const selectCheckbox = document.createElement("input");
      selectCheckbox.type = "checkbox";
      selectCheckbox.className = "today-select-checkbox";
      selectCheckbox.dataset.rowKey = getTodayRowKey(row);
      selectTd.appendChild(selectCheckbox);
    }
    tr.appendChild(selectTd);

    // Status (สีเขียว/แดง)
    const statusTd = document.createElement("td");
    const status = row["status"] || "";
    statusTd.textContent = status;
    statusTd.className = status === "สั่งเบิกแล้ว" ? "status-green" : "status-red";
    tr.appendChild(statusTd);

    // IDRow
    const idRowTd = document.createElement("td");
    idRowTd.textContent = row["IDRow"] || "";
    tr.appendChild(idRowTd);

    // คอลัมน์หลัก
    const columns = [
      "Timestamp", "material", "description", "quantity",
      "vibhavadi", "employeeName", "team", "callNumber",
      "callType", "remark"
    ];

    columns.forEach(col => {
      const td = document.createElement("td");
      let value = row[col] || "";

      // จัดรูปแบบเวลา
      if (col === "Timestamp") {
        value = formatTimestamp(value);
      }

      // จัดรูปแบบตัวเลข
      if ((col === "quantity" || col === "vibhavadi") && value !== "") {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num.toLocaleString("en-US", { maximumFractionDigits: 0 });
        }
      }

      // จัดแนวซ้ายสำหรับบางคอลัมน์อ่านง่าย
      if (["description", "employeeName", "team"].includes(col)) {
        td.classList.add("today-left");
      }

      // ไฮไลต์ remark
      if (col === "remark" && value) {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }

      td.textContent = value;
      tr.appendChild(td);
    });

    // ปุ่ม "ดูรายละเอียด"
    const detailTd = document.createElement("td");
    const detailBtn = document.createElement("button");
    detailBtn.textContent = "ดูรายละเอียด";
    detailBtn.className = "pending-detail-button";
    detailBtn.onclick = () => {
      // สร้าง HTML สำหรับ modal
      const detailHtml = columns.map(col => {
        let label = "";
        switch (col) {
          case "Timestamp": label = "วันเวลา"; break;
          case "material": label = "Material"; break;
          case "description": label = "Description"; break;
          case "quantity": label = "จำนวน"; break;
          case "vibhavadi": label = "วิภาวดี"; break;
          case "employeeName": label = "ชื่อช่าง"; break;
          case "team": label = "หน่วยงาน"; break;
          case "callNumber": label = "เลขที่ Call"; break;
          case "callType": label = "Call Type"; break;
          case "remark": label = "หมายเหตุ"; break;
          default: label = col;
        }
        let value = row[col] || "";
        if (col === "Timestamp") {
          value = formatTimestamp(value);
        }
        if ((col === "quantity" || col === "vibhavadi") && value !== "") {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            value = num.toLocaleString("en-US");
          }
        }
        const valueHtml = col === "remark" && value
          ? `<span style="color:#d32f2f; font-weight:bold;">${value}</span>`
          : `<span>${value}</span>`;
        return `<div style="margin:6px 0;"><strong>${label}:</strong> ${valueHtml}</div>`;
      }).join("");

      modalContent.innerHTML = detailHtml;
      modal.style.display = "block";
    };
    detailTd.appendChild(detailBtn);
    tr.appendChild(detailTd);

    fragment.appendChild(tr);
  });

  tableBodyToday.innerHTML = "";
  tableBodyToday.appendChild(fragment);
}
async function showRequisitionDialog(row) {
  // ตรวจสอบสิทธิ์ก่อน
  if (!checkAuthForRequisition()) {
    return;
  }
  
  document.body.style.overflow = 'hidden';
  const vibhavadiValue = parseFloat(row["วิภาวดี"]) || 0;
  const unrestrictedValue = parseFloat(row["Unrestricted"]) || 0;
  const remark = row["หมายเหตุ"] || '';
  const hasStockVibha = vibhavadiValue > 0;
  
  // ตรวจสอบเงื่อนไขใหม่: ถ้านวนคร = 0 และหมายเหตุไม่ว่าง
  if (unrestrictedValue === 0 && remark.trim() !== '') {
    const replacementWarning = await Swal.fire({
      title: '<strong style="font-size:24px; color:#f39c12;">คำเตือน!</strong>',
      iconColor: '#f39c12',
      width: window.innerWidth <= 480 ? '90%' : '560px',
      padding: '30px 20px',
      background: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
      backdrop: 'rgba(0,0,0,0.85)',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-check"></i> ยืนยัน',
      cancelButtonText: '<i class="fas fa-times"></i> ยกเลิก',
      reverseButtons: true,
      buttonsStyling: false,
      html: `
        <div style="text-align:center; margin:20px 0;">
          <i class="fas fa-exclamation-triangle" style="font-size:60px; color:#f39c12; margin-bottom:15px; opacity:0.9;"></i>
          <div style="font-size:18px; font-weight:600; color:#e67e22;">
            ${row.Material || ''}
          </div>
          <div style="font-size:18px; font-weight:600; color:#e67e22; margin-top:10px;">
            ${row.Description || ''}
          </div>
          <div style="font-size:17px; color:#7f8c8d; margin:15px 0;">
            คลังนวนครไม่มีของเหลือแล้ว
          </div>
          <div style="
    margin-top:20px; 
    padding:18px 20px; 
    background:#f0fff4; 
    border:2px solid #2ecc71; 
    border-radius:14px; 
    font-size:17px; 
    color:#1e874b; 
    font-weight:bold;
    box-shadow:0 2px 6px rgba(0,0,0,0.05);
">
    <i class="fas fa-exclamation-circle" style="color:#2ecc71; margin-right:8px;"></i>
    อาจมีอะไหล่ทดแทน: 
    <span style="color:#0a0; font-size:18px;">${remark}</span>
</div>

          </div>
        </div>
      `,
      didOpen: () => {
        const confirmBtn = document.querySelector('.swal2-confirm');
        const cancelBtn = document.querySelector('.swal2-cancel');
        confirmBtn.style.cssText = `
          background: linear-gradient(135deg, #e74c3c, #c0392b) !important;
          color: white !important;
          padding: 14px 36px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(231,76,60,0.5) !important;
        `;
        cancelBtn.style.cssText = `
          background: linear-gradient(135deg, #95a5a6, #7f8c8d) !important;
          color: white !important;
          padding: 14px 36px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(127,140,141,0.5) !important;
        `;
      }
    });
    if (replacementWarning.isDismissed) {
      Swal.close();
      document.body.style.overflow = 'auto';
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }
  }

  // ตรวจสอบเงื่อนไขเดิม: คลังวิภาวดีมีของ
  if (hasStockVibha) {
    const warningResult = await Swal.fire({
      title: '<strong style="font-size:24px; color:#f39c12;">คำเตือน!</strong>',
      iconColor: '#f39c12',
      width: window.innerWidth <= 480 ? '90%' : '560px',
      padding: '30px 20px',
      background: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
      backdrop: 'rgba(0,0,0,0.85)',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-check"></i> ยืนยัน',
      cancelButtonText: '<i class="fas fa-times"></i> ยกเลิก',
      reverseButtons: true,
      buttonsStyling: false,
      html: `
        <div style="text-align:center; margin:20px 0;">
          <i class="fas fa-exclamation-triangle" style="font-size:60px; color:#f39c12; margin-bottom:15px; opacity:0.9;"></i>
          <div style="font-size:18px; font-weight:600; color:#e67e22;">
            คลังวิภาวดีมีของอยู่
          </div>
          <div style="font-size:32px; font-weight:bold; color:#27ae60; margin:12px 0;">
            ${vibhavadiValue.toLocaleString()} ชิ้น
          </div>
          <div style="font-size:17px; color:#7f8c8d; margin:15px 0;">
            กรุณาตรวจสอบว่าจำเป็นต้องเบิกจากนวนครจริงหรือไม่
          </div>
          <div style="
    margin-top:20px; 
    padding:16px; 
    background:#e8f5e8; 
    border-left:6px solid #27ae60; 
    border-radius:12px; 
    font-size:16px; 
    color:#1e874b;
    font-weight:bold;
    display:flex;
    align-items:center;
    gap:10px;
">
    <i class="fas fa-info-circle" style="font-size:20px;"></i>
    <span>หากยืนยัน ระบบจะดึงจากคลังนวนครแทน</span>
</div>

        </div>
      `,
      didOpen: () => {
        const confirmBtn = document.querySelector('.swal2-confirm');
        const cancelBtn = document.querySelector('.swal2-cancel');
        confirmBtn.style.cssText = `
          background: linear-gradient(135deg, #e74c3c, #c0392b) !important;
          color: white !important;
          padding: 14px 36px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(231,76,60,0.5) !important;
        `;
        cancelBtn.style.cssText = `
          background: linear-gradient(135deg, #95a5a6, #7f8c8d) !important;
          color: white !important;
          padding: 14px 36px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(127,140,141,0.5) !important;
        `;
      }
    });
    if (warningResult.isDismissed) {
      Swal.close();
      document.body.style.overflow = 'auto';
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
  }

  // ========== ส่วนฟอร์มเบิก (แก้ไขเพื่อนำรหัสพนักงานจากผู้ที่ Login) ==========
  let selectedCallType = '';
  const savedUsername = localStorage.getItem('username') || ''; // ดึงรหัสพนักงานจาก localStorage
  
  const history = {
    employeeCode: getFromLocalStorage('employeeCode'),
    team: getFromLocalStorage('team'),
    contact: getFromLocalStorage('contact'),
    callNumber: getFromLocalStorage('callNumber'),
    callType: getFromLocalStorage('callType'),
  };

Swal.fire({
  title: '📋 เบิกอะไหล่นวนคร',
  html: `
      <style>
        /* ====== ปรับหน้าตา Popup ทั้งหมด ====== */
        .custom-swal-popup {
          border-radius: 18px !important;
          padding: 18px 20px !important;
        }

        .swal2-title {
          font-size: 20px !important;
          margin-bottom: 8px !important;
        }

        /* แสดง Material + Description ตรงกลาง */
        .material-header {
          text-align: center;
          padding: 10px 12px;
          border-radius: 12px;
          background: linear-gradient(135deg, #e0f2ff, #f3e5ff);
          margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .material-code {
          font-size: 18px;
          font-weight: 700;
        }
        .material-desc {
          margin-top: 4px;
          font-size: 14px;
        }

        /* Autocomplete เดิม */
        .autocomplete-items {
          position: absolute;
          border: 1px solid #ccc;
          border-top: none;
          z-index: 9999;
          background-color: white;
          width: 100%;
          max-height: 120px;
          overflow-y: auto;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          margin-top: 2px;
          border-radius: 6px;
        }
        .autocomplete-item {
          padding: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .autocomplete-item:hover {
          background-color: #f1f1f1;
        }

        /* Label */
        .swal2-label {
          text-align: left !important;
          display: block !important;
          margin: 6px 0 4px !important;
          font-weight: 600 !important;
          width: 100% !important;
          font-size: 13px !important;
        }

        /* ช่องกรอกข้อมูล */
        .swal2-input, .swal2-select {
          width: 100% !important;
          margin: 4px 0 !important;
          padding: 8px 10px !important;
          box-sizing: border-box !important;
          font-size: 14px !important;
          height: 38px !important;
          border-radius: 8px !important;
          border: 1px solid #ddd !important;
          background-color: #fafafa !important;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .swal2-input:focus, .swal2-select:focus {
          border-color: #667eea !important;
          box-shadow: 0 0 0 2px rgba(102,126,234,0.2) !important;
          background-color: #ffffff !important;
          outline: none !important;
        }

        .error-message {
          color: red !important;
          font-size: 12px !important;
          margin-top: 2px !important;
          display: block !important;
          text-align: left !important;
        }
        .invalid-input {
          border: 2px solid red !important;
          box-shadow: 0 0 5px rgba(255, 0, 0, 0.5) !important;
        }

        #swal-employee-name-display, #swal-team-display {
          color: #4caf50 !important;
          font-weight: bold !important;
          margin: 4px 0 !important;
          padding: 4px !important;
          background: #e8f5e8 !important;
          border-radius: 4px !important;
          text-align: left !important;
        }

        /* Canva-like Call Type buttons */
        .call-type-container {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 4px 0;
          justify-content: center;
        }
        .call-type-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 25px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          color: white;
          min-width: 60px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .call-type-btn:not(.selected) {
          background: linear-gradient(135deg, #e0e0e0, #f5f5f5);
          color: #666;
        }
        .call-type-btn.selected {
          background: linear-gradient(135deg, #667eea, #764ba2);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          transform: translateY(-1px);
        }
        .call-type-btn:hover:not(.selected) {
          background: linear-gradient(135deg, #d0d0d0, #e5e5e5);
          transform: translateY(-1px);
        }
        body.dark-mode .call-type-btn:not(.selected) {
          background: linear-gradient(135deg, #555, #666);
          color: #ccc;
        }
        body.dark-mode .call-type-btn.selected {
          background: linear-gradient(135deg, #1abc9c, #16a085);
          box-shadow: 0 4px 12px rgba(26, 188, 156, 0.3);
        }
        body.dark-mode .call-type-btn:hover:not(.selected) {
          background: linear-gradient(135deg, #444, #555);
          transform: translateY(-1px);
        }

        /* ปุ่มยืนยัน/ยกเลิก */
        .swal2-actions {
          margin-top: 16px !important;
          gap: 8px !important;
        }
        .swal2-confirm-btn, .swal2-cancel-btn {
          min-width: 110px;
          padding: 8px 18px;
          border-radius: 999px;
          border: none;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .swal2-confirm-btn {
          background: linear-gradient(135deg, #4caf50, #2e7d32);
          color: #fff;
          box-shadow: 0 3px 8px rgba(76, 175, 80, 0.4);
        }
        .swal2-confirm-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 12px rgba(76, 175, 80, 0.6);
        }
        .swal2-cancel-btn {
          background: #f5f5f5;
          color: #666;
          border: 1px solid #ddd;
        }
        .swal2-cancel-btn:hover {
          background: #eeeeee;
          transform: translateY(-1px);
        }
      </style>

      <!-- แสดง Material + Description ตรงกลาง -->
      <div class="material-header">
        <div class="material-code">${row.Material || ''}</div>
        <div class="material-desc">${row.Description || ''}</div>
      </div>

      <label class="swal2-label">🔢 จำนวน</label>
      <input id="swal-quantity" class="swal2-input" type="number" value="1" min="1">
      <span id="swal-quantity-error" class="error-message"></span>

      <label class="swal2-label">🆔 รหัสพนักงาน</label>
      <div style="position:relative;">
       <input id="swal-employee-code" class="swal2-input" placeholder="7xxxxxx" value="${savedUsername}" readonly>
        <div id="employee-code-history" class="autocomplete-items" style="display:none;"></div>
      </div>
      <span id="swal-employee-code-error" class="error-message"></span>

      <label class="swal2-label">👤 ชื่อพนักงาน</label>
      <div id="swal-employee-name-display"></div>

      <label class="swal2-label">👥 ทีม</label>
      <div id="swal-team-display"></div>

      <label class="swal2-label">📞 เบอร์ติดต่อ</label>
      <div style="position:relative;">
        <input id="swal-contact" class="swal2-input" placeholder="เช่น 08xxxxxxxx">
        <div id="contact-history" class="autocomplete-items" style="display:none;"></div>
      </div>
      <span id="swal-contact-error" class="error-message"></span>

      <label class="swal2-label">📄 เลขที่ Call</label>
      <div style="position:relative;">
        <input id="swal-call-number" class="swal2-input" placeholder="2... หรือ ...">
        <div id="call-number-history" class="autocomplete-items" style="display:none;"></div>
      </div>
      <span id="swal-call-number-error" class="error-message"></span>

      <label class="swal2-label">🗳️ Call Type</label>
      <div id="call-type-container" class="call-type-container">
        <button class="call-type-btn" data-value="I">I</button>
        <button class="call-type-btn" data-value="P">P</button>
        <button class="call-type-btn" data-value="Q">Q</button>
        <button class="call-type-btn" data-value="R">R</button>
      </div>
      <span id="swal-call-type-error" class="error-message"></span>

      <label class="swal2-label">🗒️ หมายเหตุ</label>
      <input id="swal-remark" class="swal2-input" placeholder="ไม่บังคับ">
      <span id="swal-remark-error" class="error-message"></span>
    `,
  showCancelButton: true,
  confirmButtonText: '✅ ยืนยันเบิก',
  cancelButtonText: '❌ ยกเลิก',
  buttonsStyling: false,
  customClass: {
    popup: 'custom-swal-popup',
    confirmButton: 'swal2-confirm-btn',
    cancelButton: 'swal2-cancel-btn'
  },
  focusConfirm: false,
  showCancelButton: true,
  showCloseButton: true,
  closeButtonHtml: '<i class="fas fa-times"></i>',
  confirmButtonText: 'ยืนยัน',
  cancelButtonText: 'ยกเลิก',
  allowOutsideClick: false,
  allowEscapeKey: false,
  didOpen: () => {
    const swalContainer = document.querySelector('.swal2-container');
    if (swalContainer) {
      swalContainer.style.zIndex = '99998';
      swalContainer.style.position = 'fixed';
      swalContainer.style.top = '0';
      swalContainer.style.left = '0';
      swalContainer.style.width = '100vw';
      swalContainer.style.height = '100vh';
      swalContainer.style.display = 'flex';
      swalContainer.style.justifyContent = 'center';
      swalContainer.style.alignItems = 'center';
    }
    const swalBackdrop = document.querySelector('.swal2-backdrop');
    if (swalBackdrop) {
      swalBackdrop.style.zIndex = '99997';
      swalBackdrop.style.position = 'fixed';
      swalBackdrop.style.top = '0';
      swalBackdrop.style.left = '0';
      swalBackdrop.style.width = '100vw';
      swalBackdrop.style.height = '100vh';
      swalBackdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      swalBackdrop.style.backdropFilter = 'blur(8px)';
    }
    const swalPopup = document.querySelector('.swal2-popup');
    if (swalPopup) {
      swalPopup.style.zIndex = '99999';
      swalPopup.style.position = 'relative';
      swalPopup.style.margin = '0';
      swalPopup.style.transform = 'none';
      swalPopup.style.maxHeight = '90vh';
      swalPopup.style.overflowY = 'auto';
      swalPopup.style.width = 'auto';
      swalPopup.style.maxWidth = '90vw';
      if (window.innerWidth <= 768) {
        swalPopup.style.width = '95vw';
        swalPopup.style.padding = '15px';
      }
    }
    
    // ตั้งค่าช่องรหัสพนักงานให้เป็น readonly และแสดงข้อมูลอัตโนมัติ
    const employeeCodeInput = document.getElementById('swal-employee-code');
    const savedUserName = localStorage.getItem('userName');
    
    if (employeeCodeInput) {
  employeeCodeInput.value = savedUsername;
  employeeCodeInput.readOnly = true; // ทำให้อ่านอย่างเดียว ไม่สามารถแก้ไขได้
  employeeCodeInput.style.backgroundColor = '#f0f0f0'; // เปลี่ยนสีพื้นหลังเพื่อบ่งบอกว่าไม่สามารถแก้ไขได้
  employeeCodeInput.style.cursor = 'not-allowed';
  
  // แสดงชื่อพนักงานและทีมอัตโนมัติ
  const employeeCode = savedUsername;
  if (employeeCode && /^\d{7}$/.test(employeeCode) && employeeCode[0] === '7') {
    const employee = employeeData.find(e => String(e?.IDRec).trim() === employeeCode);
    if (employee && employee.Name) {
      document.getElementById('swal-employee-name-display').textContent = `${employee.Name}`;
      document.getElementById('swal-team-display').textContent = `${employee.หน่วยงาน || ''}`;
    }
  }
}
    
    const quantityInput = document.getElementById('swal-quantity');
    const contactInput = document.getElementById('swal-contact');
    const callNumberInput = document.getElementById('swal-call-number');
    const remarkInput = document.getElementById('swal-remark');
    const confirmButton = document.querySelector('.swal2-confirm');
    confirmButton.disabled = true;

    const callTypeButtons = document.querySelectorAll('.call-type-btn');
    callTypeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        callTypeButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedCallType = btn.dataset.value;
        validateInputs();
      });
    });

    function setupAutocomplete(input, key, containerId) {
      input.addEventListener('input', () => {
        const container = document.getElementById(containerId);
        const val = input.value.toLowerCase();
        const items = getFromLocalStorage(key).filter(item => item.toLowerCase().includes(val));
        container.innerHTML = '';
        items.forEach(item => {
          const div = document.createElement('div');
          div.className = 'autocomplete-item';
          div.textContent = item;
          div.onclick = () => {
            input.value = item;
            container.style.display = 'none';
            validateInputs();
          };
          container.appendChild(div);
        });
        container.style.display = items.length ? 'block' : 'none';
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          const container = document.getElementById(containerId);
          container.style.display = 'none';
        }, 200);
      });
    }
    setupAutocomplete(contactInput, 'contact', 'contact-history');
    setupAutocomplete(callNumberInput, 'callNumber', 'call-number-history');
    const lastContact = getFromLocalStorage('contact')[0];
    if (lastContact) contactInput.value = lastContact;

    function validateInputs() {
      const errors = {
        quantityError: document.getElementById('swal-quantity-error'),
        employeeCodeError: document.getElementById('swal-employee-code-error'),
        contactError: document.getElementById('swal-contact-error'),
        callNumberError: document.getElementById('swal-call-number-error'),
        callTypeError: document.getElementById('swal-call-type-error'),
        remarkError: document.getElementById('swal-remark-error')
      };
      
      const inputs = [quantityInput, contactInput, callNumberInput, remarkInput];
      inputs.forEach(input => input.classList.remove('invalid-input'));
      Object.values(errors).forEach(el => el.textContent = '');
      
      let isValid = true;
      
      // ตรวจสอบจำนวน
      if (!quantityInput.value || quantityInput.value < 1) {
        errors.quantityError.textContent = 'กรุณากรอกจำนวนที่มากกว่าหรือเท่ากับ 1';
        quantityInput.classList.add('invalid-input');
        isValid = false;
      }
      
      // ตรวจสอบเบอร์ติดต่อ
      if (!contactInput.value || !/^(0|\+66)[6-9][0-9]{7,8}$/.test(contactInput.value)) {
        errors.contactError.textContent = 'กรุณากรอกเบอร์ติดต่อที่ถูกต้อง (เช่น 08xxxxxxxx)';
        contactInput.classList.add('invalid-input');
        isValid = false;
      }
      
      const hasRemark = remarkInput.value.trim().length > 0;
      if (!hasRemark) {
        if (!callNumberInput.value) {
          errors.callNumberError.textContent = 'กรุณากรอกเลขที่ Call';
          callNumberInput.classList.add('invalid-input');
          isValid = false;
        } else if (
          (callNumberInput.value.startsWith('2') && callNumberInput.value.length !== 11) ||
          (!callNumberInput.value.startsWith('2') && callNumberInput.value.length !== 7)
        ) {
          errors.callNumberError.textContent = 'เลขที่ Call ต้องขึ้นต้นด้วย 2 (11 ตัวอักษร) หรือ (7 ตัวอักษร)';
          callNumberInput.classList.add('invalid-input');
          isValid = false;
        }
        if (!selectedCallType) {
          errors.callTypeError.textContent = 'กรุณาเลือก Call Type';
          isValid = false;
        }
      }
      
      confirmButton.disabled = !isValid;
    }
    
    quantityInput.addEventListener('input', validateInputs);
    contactInput.addEventListener('input', validateInputs);
    callNumberInput.addEventListener('input', validateInputs);
    remarkInput.addEventListener('input', validateInputs);
    
    validateInputs();
    quantityInput.focus();
  },
  didClose: () => {
    document.body.style.overflow = 'auto';
  },
  preConfirm: () => {
    const quantityInput = document.getElementById('swal-quantity');
    const employeeCodeInput = document.getElementById('swal-employee-code');
    const contactInput = document.getElementById('swal-contact');
    const callNumberInput = document.getElementById('swal-call-number');
    const remarkInput = document.getElementById('swal-remark');
    
    const errors = {
      quantityError: document.getElementById('swal-quantity-error'),
      employeeCodeError: document.getElementById('swal-employee-code-error'),
      contactError: document.getElementById('swal-contact-error'),
      callNumberError: document.getElementById('swal-call-number-error'),
      callTypeError: document.getElementById('swal-call-type-error'),
      remarkError: document.getElementById('swal-remark-error')
    };
    
    [quantityInput, contactInput, callNumberInput, remarkInput].forEach(input => {
      input.classList.remove('invalid-input');
    });
    
    Object.values(errors).forEach(el => el.textContent = '');
    let isValid = true;
    
    if (!quantityInput.value || quantityInput.value < 1) {
      errors.quantityError.textContent = 'กรุณากรอกจำนวนที่มากกว่าหรือเท่ากับ 1';
      quantityInput.classList.add('invalid-input');
      isValid = false;
    }
    
    const employeeCode = employeeCodeInput.value.trim();
    
    if (!employeeCode || !/^\d{7}$/.test(employeeCode) || employeeCode[0] !== '7') {
      errors.employeeCodeError.textContent = 'รหัสพนักงานต้องเป็นตัวเลข 7 หลัก เริ่มด้วย 7 (เช่น 7512411)';
      employeeCodeInput.classList.add('invalid-input');
      isValid = false;
    } else {
      const employee = employeeData.find(e => e.IDRec && e.IDRec.toString().trim() === employeeCode);
      if (!employee || !employee.Name) {
        errors.employeeCodeError.textContent = 'ไม่พบรหัสพนักงานนี้ในระบบ';
        employeeCodeInput.classList.add('invalid-input');
        isValid = false;
      }
    }
    
    if (!contactInput.value || !/^(0|\+66)[6-9][0-9]{7,8}$/.test(contactInput.value)) {
      errors.contactError.textContent = 'กรุณากรอกเบอร์ติดต่อที่ถูกต้อง (เช่น 08xxxxxxxx)';
      contactInput.classList.add('invalid-input');
      isValid = false;
    }
    
    const hasRemark = remarkInput.value.trim().length > 0;
    if (!hasRemark) {
      if (!callNumberInput.value) {
        errors.callNumberError.textContent = 'กรุณากรอกเลขที่ Call';
        callNumberInput.classList.add('invalid-input');
        isValid = false;
      } else if (
        (callNumberInput.value.startsWith('2') && callNumberInput.value.length !== 11) ||
        (!callNumberInput.value.startsWith('2') && callNumberInput.value.length !== 7)
      ) {
        errors.callNumberError.textContent = 'เลขที่ Call ต้องขึ้นต้นด้วย 2 (11 ตัวอักษร) หรือ (7 ตัวอักษร)';
        callNumberInput.classList.add('invalid-input');
        isValid = false;
      }
      if (!selectedCallType) {
        errors.callTypeError.textContent = 'กรุณาเลือก Call Type';
        isValid = false;
      }
    }
    
    if (isValid) {
      const employee = employeeData.find(e => e.IDRec && e.IDRec.toString().trim() === employeeCode);
      saveToLocalStorage('employeeCode', employeeCode);
      saveToLocalStorage('contact', contactInput.value);
      if (callNumberInput.value) {
        saveToLocalStorage('callNumber', callNumberInput.value);
      }
      if (selectedCallType) {
        saveToLocalStorage('callType', selectedCallType);
      }
      return {
        quantity: quantityInput.value,
        employeeCode: employeeCode,
        employeeName: employee ? employee.Name : '',
        team: employee ? (employee.หน่วยงาน || '') : '',
        contact: contactInput.value,
        callNumber: callNumberInput.value,
        callType: selectedCallType,
        remark: remarkInput.value
      };
    }
    return false;
  }
}).then(async (result) => {
  if (result.isConfirmed) {
    const formValues = result.value;
    const vibhavadiValue = parseFloat(row["วิภาวดี"]) || 0;
    const quantity = parseFloat(formValues.quantity) || 0;

    // ========== ส่วนสรุป + ส่งข้อมูล (ไม่เปลี่ยน) ==========
    let imageHtml = '';
    let imageIds = [];
    if (row.UrlWeb && row.UrlWeb.trim()) {
      const match = row.UrlWeb.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
                    row.UrlWeb.match(/id=([a-zA-Z0-9-_]+)/) ||
                    row.UrlWeb.match(/uc\?id=([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        imageIds = [match[1]];
      }
    }
    if (imageIds.length > 0) {
      const fileId = imageIds[0];
      imageHtml = `
        <img src="https://drive.google.com/thumbnail?id=${fileId}&sz=w500"
             alt="รูปอะไหล่"
             style="width:120px; height:120px; object-fit:cover; border-radius:20px;
                    border:5px solid #1877f2; box-shadow:0 10px 30px rgba(24,118,242,0.5);
                    margin-bottom:18px;"
             onerror="this.style.display='none'; this.nextSibling.style.display='block';">
        <div style="display:none; text-align:center; color:#e74c3c; font-size:14px; margin-top:10px;">โหลดรูปไม่สำเร็จ</div>
      `;
    } else {
      imageHtml = `
        <div style="width:120px; height:120px; background:linear-gradient(135deg,#e3f2fd,#bbdefb);
                    border-radius:20px; display:flex; align-items:center; justify-content:center;
                    margin:0 auto 18px; box-shadow:0 8px 25px rgba(24,118,242,0.3);">
          <i class="fas fa-box-open" style="font-size:50px; color:#1877f2;"></i>
        </div>
      `;
    }

    const summaryResult = await Swal.fire({
      title: '<strong style="font-size:22px; color:#1877f2; font-family:\'Kanit\',sans-serif;">สรุปการขอเบิกอะไหล่</strong>',
      width: window.innerWidth <= 480 ? '95%' : '650px',
      padding: '20px',
      background: document.body.classList.contains('dark-mode') ? '#1e1e1e' : '#ffffff',
      backdrop: 'rgba(0,0,0,0.8)',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-check-circle"></i> ยืนยัน',
      cancelButtonText: '<i class="fas fa-edit"></i> แก้ไข',
      reverseButtons: true,
      buttonsStyling: false,
      html: `
        <div style="text-align:center;">
          ${imageHtml}
        </div>
        <div style="background:${document.body.classList.contains('dark-mode')?'#2d2d2d':'#f8fbff'}; border-radius:18px; padding:20px; margin:10px 0; box-shadow:0 6px 20px rgba(0,0,0,0.12);">
          <table style="width:100%; border-collapse:separate; border-spacing:0 14px; font-size:15.5px; line-height:1.5;">
            <tr><td style="color:#555; font-weight:600; width:40%;">Material</td>
                <td style="font-weight:bold; text-align:right; color:#1a1a1a;">${row.Material || '-'}</td></tr>
            <tr><td style="color:#555; font-weight:600;">Description</td>
                <td style="text-align:right;">${row.Description || '-'}</td></tr>
            <tr><td style="color:#555; font-weight:600;">จำนวนขอเบิก</td>
                <td style="font-weight:bold; color:#e74c3c; font-size:20px; text-align:right;">${formValues.quantity} ชิ้น</td></tr>
            <tr><td style="color:#555; font-weight:600;">คลังวิภาวดีมี</td>
                <td style="color:#27ae60; font-weight:bold; text-align:right;">${vibhavadiValue.toLocaleString()} ชิ้น</td></tr>
            <tr><td style="color:#555; font-weight:600;">รหัสพนักงาน</td>
                <td style="text-align:right;">${formValues.employeeCode}</td></tr>
            <tr><td style="color:#555; font-weight:600;">ชื่อช่าง</td>
                <td style="color:#2980b9; font-weight:bold; text-align:right;">${formValues.employeeName}</td></tr>
            <tr><td style="color:#555; font-weight:600;">ทีม / หน่วยงาน</td>
                <td style="text-align:right;">${formValues.team || '-'}</td></tr>
            <tr><td style="color:#555; font-weight:600;">เบอร์ติดต่อ</td>
                <td style="text-align:right;">${formValues.contact}</td></tr>
            <tr><td style="color:#555; font-weight:600;">เลขที่ Call</td>
                <td style="text-align:right;">${formValues.callNumber || '<span style="color:#999;">ไม่มี</span>'}</td></tr>
            <tr><td style="color:#555; font-weight:600;">Call Type</td>
                <td style="text-align:right;">
                  ${formValues.callType
                    ? `<span style="background:#667eea;color:white;padding:6px 18px;border-radius:30px;font-weight:bold;font-size:15px;">${formValues.callType}</span>`
                    : '<span style="color:#999;">ไม่มี</span>'}
                </td></tr>
            ${formValues.remark ?
              `<tr><td style="color:#555; font-weight:600; vertical-align:top; padding-top:10px;">หมายเหตุ</td>
               <td style="color:#e74c3c; font-weight:bold; text-align:right; padding-top:10px;">${formValues.remark}</td></tr>` : ''}
          </table>
        </div>
        <div style="margin-top:20px; padding:15px; background:#fff3cd; border-left:6px solid #f39c12; border-radius:12px; font-size:14.5px; color:#856404; text-align:center;">
          <i class="fas fa-exclamation-triangle" style="margin-right:8px; font-size:18px;"></i>
          กรุณาตรวจสอบข้อมูลให้ครบถ้วนก่อนกดยืนยัน
        </div>
      `,
      didOpen: () => {
        const confirmBtn = document.querySelector('.swal2-confirm');
        const cancelBtn = document.querySelector('.swal2-cancel');
        confirmBtn.style.cssText = `
          background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
          color: white !important;
          padding: 14px 34px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(39,174,96,0.5) !important;
        `;
        cancelBtn.style.cssText = `
          background: linear-gradient(135deg, #95a5a6, #7f8c8d) !important;
          color: white !important;
          padding: 14px 34px !important;
          border-radius: 30px !important;
          font-size: 17px !important;
          font-weight: bold !important;
          box-shadow: 0 6px 20px rgba(127,140,141,0.5) !important;
        `;
      }
    });

    if (summaryResult.isConfirmed) {
      const detailModal = document.getElementById('imageModal');
      const imageModalImages = document.getElementById('imageModalImages');
      if (detailModal) detailModal.style.display = 'none';
      if (imageModalImages) imageModalImages.style.display = 'none';

      const jsonPayload = {
        material: row.Material || '',
        description: row.Description || '',
        quantity: parseInt(formValues.quantity, 10),
        contact: formValues.contact,
        employeeCode: formValues.employeeCode,
        team: formValues.team,
        employeeName: formValues.employeeName,
        CallNumber: formValues.callNumber || '',
        CallType: formValues.callType || '',
        remark: formValues.remark || '',
        status: 'รอเบิก',
        vibhavadi: '0',
        // สำรองเพื่อให้ UI ที่ใช้ camelCase ยังแสดงได้
        callNumber: formValues.callNumber || '',
        callType: formValues.callType || ''
      };
      const baseTodayRow = {
        ...jsonPayload,
        Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
        status: 'รอเบิก'
      };
      let newTodayRowPayload = null;

      Swal.fire({
        title: 'กำลังบันทึกข้อมูล...',
        html: `
          <div class="swal2-spinner-container">
            <div class="swal2-spinner"></div>
            <p>กรุณารอสักครู่...</p>
          </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          const swalContainer = document.querySelector('.swal2-container');
          if (swalContainer) {
            swalContainer.style.zIndex = '99998';
            swalContainer.style.position = 'fixed';
            swalContainer.style.top = '0';
            swalContainer.style.left = '0';
            swalContainer.style.width = '100vw';
            swalContainer.style.height = '100vh';
            swalContainer.style.display = 'flex';
            swalContainer.style.justifyContent = 'center';
            swalContainer.style.alignItems = 'center';
          }
          const swalBackdrop = document.querySelector('.swal2-backdrop');
          if (swalBackdrop) {
            swalBackdrop.style.zIndex = '99997';
            swalBackdrop.style.position = 'fixed';
            swalBackdrop.style.top = '0';
            swalBackdrop.style.left = '0';
            swalBackdrop.style.width = '100vw';
            swalBackdrop.style.height = '100vh';
            swalBackdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            swalBackdrop.style.backdropFilter = 'blur(8px)';
          }
          const swalPopup = document.querySelector('.swal2-popup');
          if (swalPopup) {
            swalPopup.style.zIndex = '99999';
            swalPopup.style.position = 'relative';
            swalPopup.style.margin = '0';
            swalPopup.style.transform = 'none';
            swalPopup.style.maxHeight = '90vh';
            swalPopup.style.overflowY = 'auto';
            swalPopup.style.width = 'auto';
            swalPopup.style.maxWidth = '90vw';
            if (window.innerWidth <= 768) {
              swalPopup.style.width = '95vw';
              swalPopup.style.padding = '15px';
            }
          }
        }
      });

      const handleSuccessUI = (icon, title, text, newRowData = null) => {
        if (newRowData) {
          newTodayRowPayload = newRowData;
        }
        Swal.fire({
          icon,
          title,
          text,
          confirmButtonText: 'OK'
        }).then((result) => {
          if (result.isConfirmed) {
            const imageModal = document.getElementById('imageModal');
            const imageModalImages = document.getElementById('imageModalImages');
            if (imageModal && imageModal.style.display === 'block') imageModal.style.display = 'none';
            if (imageModalImages && imageModalImages.style.display === 'block') imageModalImages.style.display = 'none';

            const rowForToday = newTodayRowPayload || newRowData || baseTodayRow;
            const normalizedRow = prependTodayRow(rowForToday, baseTodayRow);
            if (normalizedRow) {
              todayDataLoaded = true;
              currentPageToday = 1;
              updateTableToday();
              skipTodayReloadOnce = true;
              sessionStorage.setItem('skipTodayReloadOnceAt', Date.now().toString());
            }

            Swal.fire({
              title: 'กำลังเปลี่ยนหน้าไปยังข้อมูลที่ท่านบันทึก...',
              html: `
                <div class="swal2-spinner-container">
                  <div class="swal2-spinner"></div>
                  <p>กรุณารอสักครู่...</p>
                </div>
              `,
              showConfirmButton: false,
              allowOutsideClick: false,
              allowEscapeKey: false
            });

            const todayPromise = showTab('today');

            // โฟกัสช่องค้นหาเมื่อโหลดเสร็จ (รองรับ touch)
            Promise.resolve(todayPromise).finally(() => {
              document.body.style.overflow = 'auto';
              const searchInputToday = document.getElementById('searchInputToday');
              if (searchInputToday) {
                searchInputToday.focus();
                searchInputToday.blur();
              }
              if ('ontouchstart' in window) {
                const event = new Event('touchstart', { bubbles: true });
                document.body.dispatchEvent(event);
              }
              Swal.close();
            });
          }
        });
      };

      try {
        const response = await apiFetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `action=insertRequest&payload=${encodeURIComponent(JSON.stringify(jsonPayload))}`
        });
        const rawText = await response.text();
        let gasResult = null;
        try {
          gasResult = JSON.parse(rawText);
        } catch (parseErr) {
          console.warn('GAS response is not JSON:', rawText);
        }

        if (gasResult && gasResult.status === 'success') {
          newTodayRowPayload = gasResult.data || null;
          handleSuccessUI('success', 'ส่งข้อมูลสำเร็จ!', gasResult.data?.message || 'ข้อมูลได้ถูกบันทึกเรียบร้อยแล้ว', gasResult.data);
        } else if (response.ok) {
          // ตอบกลับไม่เป็น JSON แต่สถานะ HTTP ปกติ → ถือว่าบันทึกสำเร็จ
          handleSuccessUI(
            'success',
            'ส่งข้อมูลสำเร็จ!',
            'ข้อมูลถูกบันทึกลงแล้ว',
            baseTodayRow
          );
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('เกิดข้อผิดพลาดในการส่งข้อมูลไป GAS:', error);
        const isMaybeCORS = error && (
          error.name === 'TypeError' ||
          (typeof error.message === 'string' && error.message.toLowerCase().includes('fetch'))
        );

        if (isMaybeCORS) {
          handleSuccessUI(
            'success',
            'ส่งข้อมูลสำเร็จ!',
            'ข้อมูลถูกบันทึกลงแล้ว',
            baseTodayRow
          );
        } else {
          Swal.fire({
            icon: 'error',
            title: 'ส่งข้อมูลไม่สำเร็จ',
            html: `
              <p>กรุณาลองใหม่อีกครั้ง</p>
              <p style="font-size:13px; color:#666;">หากไม่แน่ใจว่าได้บันทึกไปแล้วหรือไม่ ให้ตรวจในแท็บ "เบิกวันนี้" ก่อนกดส่งซ้ำ</p>
            `,
            confirmButtonText: 'ตกลง'
          });
        }
      }
    }
  }
});
}
function saveToLocalStorage(key, value) {
  let items = JSON.parse(localStorage.getItem(key)) || [];
  if (!items.includes(value)) {
    items.unshift(value);
    if (items.length > 5) items.pop();
    localStorage.setItem(key, JSON.stringify(items));
  }
}
function getFromLocalStorage(key) {
  return JSON.parse(localStorage.getItem(key)) || [];
}
function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  pageNumbers.innerHTML = "";
  if (totalPages === 0) {
    firstPageButton.disabled = true;
    prevPageButton.disabled = true;
    nextPageButton.disabled = true;
    lastPageButton.disabled = true;
    return;
  }
  // แสดงเฉพาะหน้าปัจจุบัน
  const button = document.createElement("button");
  button.textContent = currentPage;
  button.className = "active";
  button.disabled = true; // ไม่ให้คลิกได้เพราะเป็นหน้าปัจจุบัน
  pageNumbers.appendChild(button);
  firstPageButton.disabled = currentPage === 1;
  prevPageButton.disabled = currentPage === 1;
  nextPageButton.disabled = currentPage === totalPages;
  lastPageButton.disabled = currentPage === totalPages;
}
function changePage(page) {
  currentPage = page;
  renderTableData();
  renderPagination(currentFilteredData.length);
}
function getPreferredImageId(row) {
  const material = (row.Material || "").toString().trim();
  if (material && imageDatabase[material] && imageDatabase[material].length > 0) {
    return imageDatabase[material][0]; // ใช้รูปแรกใน imageMIx ตาม Material
  }
  return extractIdFromUrlWeb(row.UrlWeb); // fallback ถ้าไม่มีใน imageMIx
}
// ✅ ประกาศ renderTable แบบ function declaration (hoist ได้)
function renderTable(data) {
  const tableBody = document.querySelector("#data-table tbody");
  if (!tableBody) {
    console.error("Table body for #data-table not found");
    return;
  }

  const fragment = document.createDocumentFragment();
  const userAuth = localStorage.getItem('userAuth') || 'None';
  const savedUsername = localStorage.getItem('username');
  const hasPermission = savedUsername === '7512411' || userAuth === '0326' || userAuth === 'Admin';

  data.forEach(row => {
    const tr = document.createElement("tr");

    // ปุ่มเบิก
    const requisitionTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "เบิก";

    if (hasPermission) {
      btn.className = "requisition-button";
      btn.onclick = () => showRequisitionDialog(row);
    } else {
      btn.className = "requisition-button-disabled";
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "ไม่มีสิทธิ์เบิกอะไหล่";
      btn.onclick = () => checkAuthForRequisition();
    }

    requisitionTd.appendChild(btn);
    tr.appendChild(requisitionTd);

    // คอลัมน์หลัก
    const columns = [
      "ImageDb", "Material", "Description", "Storage bin", "วิภาวดี", "Unrestricted",
      "Rebuilt", "หมายเหตุ", "Product", "OCRTAXT"
    ];

    const vibhavadiValue = parseFloat(row["วิภาวดี"]) || 0;
    const unrestrictedValue = parseFloat(row["Unrestricted"]) || 0;
    let textColor = "";
    let fontWeight = "";
    if (vibhavadiValue > 0) {
      textColor = "#4caf50";
      fontWeight = "bold";
    } else if (vibhavadiValue === 0 && unrestrictedValue > 0) {
      textColor = "#2196f3";
      fontWeight = "bold";
    }

    columns.forEach(col => {
      const td = document.createElement("td");
      let value = col === "Storage bin" ? getStorageBinValue(row) : (row[col] || "");

      if ((col === "วิภาวดี" || col === "Unrestricted") && value !== "") {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num.toLocaleString("en-US");
        }
      }

      if ((col === "หมายเหตุ" || col === "Rebuilt") && value) {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }

      if (["Material", "Description", "Storage bin", "วิภาวดี", "Unrestricted"].includes(col)) {
        if (textColor) td.style.color = textColor;
        if (fontWeight) td.style.fontWeight = fontWeight;
      }

      if ((col === "วิภาวดี" || col === "Unrestricted") && value !== "") {
        const numericValue = parseFloat(value.toString().replace(/,/g, ""));
        if (!isNaN(numericValue) && numericValue === 0) {
          td.innerHTML = `<span class="stock-zero-chip">0</span>`;
          tr.appendChild(td);
          return;
        }
      }

      if (col === "ImageDb") {
        const fileIdDb = (() => {
          const material = (row.Material || "").toString().trim();
          const ids = imageDatabase[material];
          if (ids && ids.length > 0) return ids[0]; // ใช้รูปแรกใน imageMIx
          return "";
        })();
        if (fileIdDb) {
          const imgContainer = document.createElement("div");
          imgContainer.style.cursor = "pointer";
          imgContainer.title = "คลิกเพื่อดูรายละเอียด";
          const img = document.createElement("img");
          img.src = `https://drive.google.com/thumbnail?id=${fileIdDb}&sz=w100-h100`;
          img.alt = "รูป (imageMIx)";
          img.style.width = "60px";
          img.style.height = "60px";
          img.style.objectFit = "cover";
          img.style.borderRadius = "6px";
          img.loading = "lazy";
          img.onerror = () => {
            img.src = 'https://via.placeholder.com/60/ccc/999?text=NOIMG';
          };
          imgContainer.onclick = () => {
            showDetailModal(row, "imageModal", "imageModalContent");
          };
          imgContainer.appendChild(img);
          td.appendChild(imgContainer);
        } else {
          td.textContent = "-";
        }
        tr.appendChild(td);
        return;
      }

      td.textContent = value;
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  tableBody.innerHTML = "";
  tableBody.appendChild(fragment);
}
function renderTableData() {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  renderTable(currentFilteredData.slice(startIndex, endIndex));
}
function applyFilters() {
  const keyword1 = (globalSearch1 || "").trim().toLowerCase();
  const keyword2 = (globalSearch2 || "").trim().toLowerCase();
  const fieldsToSearch = ["Material", "Description", "Product", "OCRTAXT", "หมายเหตุ", "Rebuilt", "วิภาวดี", "Unrestricted"];
  const matchesKeyword = (row, keyword) => {
    const storageBin = getStorageBinValue(row).toString().toLowerCase();
    const baseMatch = fieldsToSearch.some(field => (row[field] || "").toString().toLowerCase().includes(keyword));
    return baseMatch || storageBin.includes(keyword);
  };

  let filtered = allData;

  if (keyword1) {
    filtered = filtered.filter(row => matchesKeyword(row, keyword1));
  }

  if (keyword2) {
    filtered = filtered.filter(row => matchesKeyword(row, keyword2));
  }

  currentFilteredData = filtered;
  currentPage = 1;
  renderTableData();
  renderPagination(filtered.length);
}
searchInput1.addEventListener("input", debounce(e => {
  globalSearch1 = e.target.value;
  document.getElementById("searchInputImages1").value = globalSearch1;
  applyFilters();
}));

searchInput2.addEventListener("input", debounce(e => {
  globalSearch2 = e.target.value;
  document.getElementById("searchInputImages2").value = globalSearch2;
  applyFilters();
}));
// ปุ่มแว่นตาใกล้ searchInput2 -> เคลียร์เฉพาะช่องของแท็บอะไหล่
searchButton.addEventListener("click", () => {
  // เคลียร์ช่องค้นหาแท็บอะไหล่
  searchInput1.value = "";
  searchInput2.value = "";
  // เคลียร์ตัวแปร global ของฝั่งอะไหล่
  globalSearch1 = "";
  globalSearch2 = "";
  // คำนวณใหม่ (จะแสดงข้อมูลทั้งหมดเพราะช่องว่าง)
  triggerFadeAndFilter(tableContainerParts, applyFilters);
});
searchInput1.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    applyFilters();
    searchInput1.blur();
  }
});
searchInput2.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    applyFilters();
    searchInput2.blur();
  }
});
firstPageButton.addEventListener("click", () => {
  currentPage = 1;
  renderTableData();
  renderPagination(currentFilteredData.length);
});
prevPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTableData();
    renderPagination(currentFilteredData.length);
  }
});
nextPageButton.addEventListener("click", () => {
  const totalPages = Math.ceil(currentFilteredData.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTableData();
    renderPagination(currentFilteredData.length);
  }
});
lastPageButton.addEventListener("click", () => {
  const totalPages = Math.ceil(currentFilteredData.length / itemsPerPage);
  currentPage = totalPages;
  renderTableData();
  renderPagination(currentFilteredData.length);
});
async function loadData() {
  document.getElementById("loading").style.display = "flex";
  errorContainer.style.display = "none";
  const cacheKey = "parts-data-main-sap";
  try {
    allData = await getCachedData(cacheKey, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await apiFetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    }, 6); // Cache 6 ชม.

    tempFilteredData = [...allData];
    currentFilteredData = [...allData];
    applyFilters();
    hideLoading();
    partsDataLoaded = true;
  } catch (err) {
    console.error("โหลดข้อมูลอะไหล่ล้มเหลว:", err);
    errorContainer.style.display = "block";
    hideLoading();
  }
}
// Images tab functions (now after variables)
itemsPerPageSelectImages.addEventListener("change", () => {
  itemsPerPageImages = parseInt(itemsPerPageSelectImages.value, 10);
  currentPageImages = 1;
  renderTableDataImages();
  renderPaginationImages(currentFilteredDataImages.length);
});
retryButtonImages.addEventListener("click", () => {
  errorContainerImages.style.display = "none";
  loadImagesData();
});
// Updated render function for gallery
function renderGalleryDataImages(data) {
  if (!galleryContainer) {
    console.error("Gallery container not found");
    Swal.fire({
      icon: "error",
      title: "ข้อผิดพลาด",
      text: "ไม่พบ container สำหรับแสดง gallery กรุณาตรวจสอบโครงสร้างหน้าเว็บ",
      confirmButtonText: "ตกลง",
    });
    return;
  }
  galleryContainer.innerHTML = "";
  data.forEach((row) => {
    const galleryItem = document.createElement("div");
    galleryItem.className = "gallery-item";
    // Convert values to numbers for comparison
    const vibhavadiValue = parseFloat(row["วิภาวดี"]) || 0;
    const unrestrictedValue = parseFloat(row["Unrestricted"]) || 0;
    // Determine styling based on conditions
    let textColor = "";
    let fontWeight = "";
    if (vibhavadiValue > 0) {
      textColor = "#4caf50"; // Green
      fontWeight = "bold";
    } else if (vibhavadiValue === 0 && unrestrictedValue > 0) {
      textColor = "#2196f3"; // Blue
      fontWeight = "bold";
    }
    // Fix: Get ID from imageDatabase first, fallback to UrlWeb
    const material = row.Material || '';
    const idsFromDb = imageDatabase[material] || [];
    const id = idsFromDb[0] || extractIdFromUrlWeb(row.UrlWeb);
    const thumbnailSrc = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w300-h300` : '';
    galleryItem.innerHTML = `
      <img src="${thumbnailSrc}" alt="${row.Description || 'Image'}" class="gallery-thumbnail"
        style="color: ${textColor}; font-weight: ${fontWeight};"
        onclick="showDetailModal(${JSON.stringify(row).replace(/"/g, '&quot;')}, 'imageModalImages', 'imageModalContentImages')" // Use unified function
        onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='; this.onclick=null;">
      <div class="gallery-info">
        <div class="gallery-material" style="color: ${textColor}; font-weight: ${fontWeight}; font-size: 18px;">${row.Material || ''}</div>
        <div class="gallery-description">${row.Description || ''}</div>
      </div>
    `;
    galleryContainer.appendChild(galleryItem);
  });
}
function renderPaginationImages(totalItems) {
  const totalPages = Math.ceil(totalItems / itemsPerPageImages);
  pageNumbersImages.innerHTML = "";
  if (totalPages === 0) {
    firstPageButtonImages.disabled = true;
    prevPageButtonImages.disabled = true;
    nextPageButtonImages.disabled = true;
    lastPageButtonImages.disabled = true;
    return;
  }
  // แสดงเฉพาะหน้าปัจจุบัน
  const button = document.createElement("button");
  button.textContent = currentPageImages;
  button.className = "active";
  button.disabled = true; // ไม่ให้คลิกได้เพราะเป็นหน้าปัจจุบัน
  pageNumbersImages.appendChild(button);
  firstPageButtonImages.disabled = currentPageImages === 1;
  prevPageButtonImages.disabled = currentPageImages === 1;
  nextPageButtonImages.disabled = currentPageImages === totalPages;
  lastPageButtonImages.disabled = currentPageImages === totalPages;
}
function changePageImages(page) {
  currentPageImages = page;
  renderTableDataImages();
  renderPaginationImages(currentFilteredDataImages.length);
}
function renderTableDataImages() {
  const startIndex = (currentPageImages - 1) * itemsPerPageImages;
  const endIndex = startIndex + itemsPerPageImages;
  renderGalleryDataImages(currentFilteredDataImages.slice(startIndex, endIndex));
}
function applyFiltersImages() {
  // เริ่มจาก allData ของแท็บอะไหล่
  let filtered = allData.filter(row => {
    // ต้องมี id (จาก MainSap หรือ MainSapimage ก็ได้)
    const hasId = (row.id && row.id.trim() !== "") ||
      (row.Material && imageDatabase[row.Material] && imageDatabase[row.Material].length > 0);
    return hasId;
  });

  const keyword1 = searchInputImages1.value.trim().toLowerCase();
  if (keyword1) {
    filtered = filtered.filter(row =>
      ["Material", "Description", "Product", "OCRTAXT", "หมายเหตุ", "Rebuilt", "วิภาวดี", "Unrestricted"]
        .some(field => (row[field] || "").toString().toLowerCase().includes(keyword1))
    );
  }

  const keyword2 = searchInputImages2.value.trim().toLowerCase();
  if (keyword2) {
    filtered = filtered.filter(row =>
      ["Material", "Description", "Product", "OCRTAXT", "หมายเหตุ", "Rebuilt", "วิภาวดี", "Unrestricted"]
        .some(field => (row[field] || "").toString().toLowerCase().includes(keyword2))
    );
  }

  currentFilteredDataImages = filtered;
  currentPageImages = 1;
  renderTableDataImages();
  renderPaginationImages(filtered.length);
}
searchInputImages1.addEventListener("input", debounce(e => {
  globalSearch1 = e.target.value;
  document.getElementById("searchInput1").value = globalSearch1;
  applyFiltersImages();
}));

searchInputImages2.addEventListener("input", debounce(e => {
  globalSearch2 = e.target.value;
  document.getElementById("searchInput2").value = globalSearch2;
  applyFiltersImages();
}));
// ปุ่มแว่นตาใกล้ searchInputImages2 -> เคลียร์ทั้งคู่ + เคลียร์ฝั่งอะไหล่ด้วย ให้ค้นใหม่แบบว่าง
searchButtonImages.addEventListener("click", () => {
  // เคลียร์ช่องค้นหาแท็บรูปภาพ
  searchInputImages1.value = "";
  searchInputImages2.value = "";
  // เคลียร์ค่าที่ sync ไปแท็บอะไหล่ด้วย (ให้สองแท็บตรงกัน)
  searchInput1.value = "";
  searchInput2.value = "";
  // เคลียร์ตัวแปร global
  globalSearch1 = "";
  globalSearch2 = "";
  // เรียก filter อีกรอบ (จะกลายเป็นแสดงข้อมูลทั้งหมด เพราะช่องค้นหาว่าง)
  triggerFadeAndFilter(galleryContainer, applyFiltersImages);
});
searchInputImages1.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    applyFiltersImages();
    searchInputImages1.blur();
  }
});
searchInputImages2.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    applyFiltersImages();
    searchInputImages2.blur();
  }
});
firstPageButtonImages.addEventListener("click", () => {
  currentPageImages = 1;
  renderTableDataImages();
  renderPaginationImages(currentFilteredDataImages.length);
});
prevPageButtonImages.addEventListener("click", () => {
  if (currentPageImages > 1) {
    currentPageImages--;
    renderTableDataImages();
    renderPaginationImages(currentFilteredDataImages.length);
  }
});
nextPageButtonImages.addEventListener("click", () => {
  const totalPages = Math.ceil(currentFilteredDataImages.length / itemsPerPageImages);
  if (currentPageImages < totalPages) {
    currentPageImages++;
    renderTableDataImages();
    renderPaginationImages(currentFilteredDataImages.length);
  }
});
lastPageButtonImages.addEventListener("click", () => {
  const totalPages = Math.ceil(currentFilteredDataImages.length / itemsPerPageImages);
  currentPageImages = totalPages;
  renderTableDataImages();
  renderPaginationImages(currentFilteredDataImages.length);
});

// === แทนที่ฟังก์ชัน loadImageDatabase ด้วยเวอร์ชันนี้ ===
async function loadImageDatabase() {
  if (imageDbLoaded) {
    console.log("ใช้ Cache ฐานข้อมูลรูปภาพ");
    return imageDatabase;
  }
  const cacheKey = "image-database-mainsapimage";
  try {
    imageDatabase = await getCachedData(cacheKey, async () => {
      const res = await apiFetch('/api/image-db');
      const data = await res.json();
      const db = {};
      let count = 0;
      data.forEach(row => {
        const material = (row.Material || "").toString().trim();
        const fileId = (
          row.idchack || row.Idchack || row.IDchack ||
          row.idChack || row.IdChack || ""
        ).toString().trim();
        if (material && fileId && fileId.length > 20) {
          if (!db[material]) db[material] = [];
          if (!db[material].includes(fileId)) {
            db[material].push(fileId);
            count++;
          }
        }
      });
      console.log(`โหลดฐานข้อมูลรูปใหม่สำเร็จ: ${count} รูป`);
      return db;
    }, 6); // Cache 6 ชั่วโมง

    imageDbLoaded = true;
    if (partsDataLoaded && typeof applyFilters === "function") {
      applyFilters();
    }
    if (allData.length > 0 && typeof applyFiltersImages === "function") {
      applyFiltersImages();
    }
  } catch (err) {
    console.error("โหลดฐานข้อมูลรูปภาพล้มเหลว:", err);
    imageDbLoaded = false;
  }
}
// Function to sort data by column (for sortable headers)
// แก้ไขใน sortByColumn (ในส่วน if (column === 'Timestamp')) เพื่อ parse ถูกต้อง
function sortByColumn(a, b, column, direction) {
  let valueA = a[column] || "";
  let valueB = b[column] || "";
  if (column === 'IDRow' || column === 'Timestamp') {
    // Custom sort for IDRow (descending by default) and Timestamp
    const parseDateOrId = (value) => {
      if (!value) return 0;
      if (column === 'IDRow') {
        return parseInt(value, 10) || 0;
      }
      // For Timestamp (assume input is MM/DD/YYYY HH:MM:SS)
      const [datePart, timePart] = value.split(' ');
      const parts = datePart.split('/'); // ['MM', 'DD', 'YYYY']
      const month = parseInt(parts[0]) - 1; // 0-based
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      if (!timePart) return new Date(year, month, day).getTime();
      const [hour, minute, second] = timePart.split(':').map(Number);
      return new Date(year, month, day, hour || 0, minute || 0, second || 0).getTime();
    };
    const numA = parseDateOrId(valueA);
    const numB = parseDateOrId(valueB);
    return direction === 'asc' ? numA - numB : numB - numA;
  } else {
    // Default string/numeric sort
    if (!isNaN(valueA) && !isNaN(valueB)) {
      valueA = parseFloat(valueA);
      valueB = parseFloat(valueB);
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    }
    valueA = valueA.toString().toLowerCase();
    valueB = valueB.toString().toLowerCase();
    return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
  }
}
// Add sort listeners for today tab
function addSortListenersToday() {
  const sortableHeaders = document.querySelectorAll("#today th.sortable");
  sortableHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const column = header.getAttribute("data-column");
      if (sortConfigToday.column === column) {
        sortConfigToday.direction = sortConfigToday.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfigToday.column = column;
        sortConfigToday.direction = column === 'IDRow' ? 'desc' : 'asc'; // Default descending for IDRow
      }
      updateSortArrowsToday();
      updateTableToday();
    });
  });
}
function updateSortArrowsToday() {
  const sortableHeaders = document.querySelectorAll("#today th.sortable");
  sortableHeaders.forEach(header => {
    const arrow = header.querySelector(".today-arrow");
    const column = header.getAttribute("data-column");
    if (column === sortConfigToday.column) {
      arrow.textContent = sortConfigToday.direction === 'asc' ? '↑' : '↓';
    } else {
      arrow.textContent = '';
    }
  });
}
// Initial call to add listeners after load
document.addEventListener('DOMContentLoaded', () => {
  addSortListenersToday();
});
// ฟังก์ชัน fade-out ก่อน refresh
function triggerFadeAndFilter(container, filterFn) {
  if (!container) {
    filterFn();
    return;
  }
  container.classList.add("fade-out");
  setTimeout(() => {
    filterFn();
    container.classList.remove("fade-out");
  }, 200);
}
function filterByStatus(data) {
  let filtered = data;
  if (currentFilter === 'pending') {
    filtered = data.filter(row => row["status"] === "รอเบิก");
  } else if (currentFilter === 'history') {
    filtered = data;
  }
  // Apply sort based on config
  if (sortConfigToday.column) {
    filtered.sort((a, b) => sortByColumn(a, b, sortConfigToday.column, sortConfigToday.direction));
  }
  return filtered;
}
// ฟังก์ชันกรองข้อมูลตามโหมด + คำค้นหา + การเรียงลำดับ
function filterDataToday(data) {
  let filtered = data;
  // 1. กรองตามโหมดปุ่ม (รอเบิก หรือ ทั้งหมด)
  if (showOnlyPending) {
    filtered = data.filter(row =>
      row["status"] && row["status"].trim() === "รอเบิก"
    );
  }
  // ถ้าเป็น false → แสดงทั้งหมด (ไม่กรอง)
  // 2. กรองตามคำค้นหา
  const keyword = searchInputToday.value.trim().toLowerCase();
  if (keyword) {
    filtered = filtered.filter(row => {
      return (
        (row["IDRow"] || "").toString().toLowerCase().includes(keyword) ||
        (row["material"] || "").toString().toLowerCase().includes(keyword) ||
        (row["description"] || "").toString().toLowerCase().includes(keyword) ||
        (row["employeeName"] || "").toString().toLowerCase().includes(keyword) ||
        (row["team"] || "").toString().toLowerCase().includes(keyword) ||
        (row["CallNumber"] || "").toString().toLowerCase().includes(keyword) ||
        (row["CallType"] || "").toString().toLowerCase().includes(keyword)
      );
    });
  }
  // 3. เรียงลำดับตามที่ผู้ใช้กดหัวคอลัมน์
  if (sortConfigToday.column) {
    filtered.sort((a, b) =>
      sortByColumn(a, b, sortConfigToday.column, sortConfigToday.direction)
    );
  }
  return filtered;
}
function exportTodayData() {
  const data = (currentFilteredDataToday && currentFilteredDataToday.length > 0)
    ? currentFilteredDataToday
    : allDataToday;
  if (!data || data.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'ไม่มีข้อมูลสำหรับ Export',
      text: 'ยังไม่มีข้อมูลในแท็บเบิกวันนี้',
      timer: 1600,
      showConfirmButton: false
    });
    return;
  }
  const materialMap = new Map();
  data.forEach(row => {
    const material = (row.material || row.Material || '').toString().trim();
    if (!material) return;
    const description = (row.description || row.Description || '').toString().trim();
    const quantityValue = parseFloat(row.quantity || row.Quantity || 0);
    const entry = materialMap.get(material);
    if (!entry) {
      materialMap.set(material, {
        material,
        description,
        quantity: isNaN(quantityValue) ? 0 : quantityValue
      });
    } else {
      entry.quantity += isNaN(quantityValue) ? 0 : quantityValue;
      if (!entry.description && description) {
        entry.description = description;
      }
    }
  });
  const columns = [
    { key: "material", label: "material" },
    { key: "description", label: "description" },
    { key: "quantity", label: "quantity" },
    { key: "storage", label: "Stroage" }
  ];
  const csvRows = [];
  csvRows.push(columns.map(col => `"${col.label}"`).join(','));
  Array.from(materialMap.values()).forEach(item => {
    const values = columns.map(col => {
      let value = '';
      if (col.key === 'storage') {
        value = 'S001';
      } else if (col.key === 'quantity') {
        value = item.quantity;
      } else {
        value = item[col.key] || '';
      }
      const safeValue = value.toString().replace(/"/g, '""').replace(/\r?\n/g, ' ');
      return `"${safeValue}"`;
    });
    csvRows.push(values.join(','));
  });
  const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM เพื่อให้ Excel/ภาษาไทยอ่านได้
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `today-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
function sendUpdateByIdBeacon(item) {
  const payload = {
    row_id: item.row_id || item.id || item.IDRow || '',
    IDRow: item.IDRow || '',
    material: item.material || item.Material || '',
    timestamp: item.timestamp || item.Timestamp || '',
    status: item.status || 'สั่งเบิกแล้ว'
  };
  const url = `${bulkUpdateUrl}?action=updateById&payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const img = new Image();
  img.src = url;
}
async function saveTodayDataSnapshot() {
  const selectedRows = getSelectedTodayRows();
  const data = selectedRows.length > 0
    ? selectedRows
    : (currentFilteredDataToday && currentFilteredDataToday.length > 0)
      ? currentFilteredDataToday
      : allDataToday;
  const pendingRows = data.filter(row => (row.status || '').trim() === 'รอเบิก');
  if (pendingRows.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'ไม่มีรายการรอเบิก',
      text: 'ไม่พบสถานะ "รอเบิก" สำหรับปรับเป็น "สั่งเบิกแล้ว"',
      timer: 1600,
      showConfirmButton: false
    });
    return;
  }

  Swal.fire({
    title: 'ยืนยันเปลี่ยนสถานะ?',
    html: `จะส่ง ${pendingRows.length} รายการไปอัปเดตเป็น "สั่งเบิกแล้ว"`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน',
    cancelButtonText: 'ยกเลิก'
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      Swal.fire({
        title: 'กำลังอัปเดต...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });

      const payload = pendingRows.map(row => {
        const rowIdRaw = row.row_id || row.id || row.IDRow || row.idRow || '';
        const rowId = Number(rowIdRaw) || '';
        return {
          row_id: rowId,
          IDRow: row.IDRow || row.idRow || row.IdRow || '',
          material: row.material || row.Material || '',
          timestamp: row.timestamp || row.Timestamp || row["Timestamp"] || '',
          status: 'สั่งเบิกแล้ว'
        };
      });

      let json = null;
      try {
        const res = await apiFetch(bulkUpdateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `action=bulkUpdateStatus&payload=${encodeURIComponent(JSON.stringify(payload))}`
        });
        json = await res.json();
        if (!res.ok || json.status !== 'success') {
          throw new Error(json.data || `HTTP ${res.status}`);
        }
      } catch (fetchError) {
        await apiFetch(bulkUpdateUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `action=bulkUpdateStatus&payload=${encodeURIComponent(JSON.stringify(payload))}`
        });
        payload.forEach(sendUpdateByIdBeacon);
      }

      pendingRows.forEach(row => {
        row.status = 'สั่งเบิกแล้ว';
        if (row.Status) row.Status = 'สั่งเบิกแล้ว'; // เผื่อ key อื่น
      });
      updateTableToday();
      Swal.fire({
        icon: 'success',
        title: 'อัปเดตแล้ว',
        text: `ปรับ ${pendingRows.length} รายการเป็น "สั่งเบิกแล้ว"`,
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('อัปเดตสถานะไม่สำเร็จ:', err);
      Swal.fire({
        icon: 'error',
        title: 'อัปเดตไม่สำเร็จ',
        text: err.message || 'กรุณาลองใหม่อีกครั้ง'
      });
    }
  });
}
// อัปเดตตาราง (เรียกใช้ทุกครั้งที่มีการเปลี่ยนแปลง)
// อัปเดตตาราง (เรียกใช้ทุกครั้งที่มีการเปลี่ยนแปลง)
function updateTableToday() {
  const filteredData = filterDataToday(allDataToday);
  currentFilteredDataToday = filteredData;

  const todayEmptyMessage = document.getElementById("todayEmptyMessage");
  const keyword = searchInputToday.value.trim();

  // ถ้าอยู่โหมด "รอเบิก" และไม่มีคำค้นหา และไม่พบข้อมูลเลย → แสดงข้อความ "ทำเบิกหมดแล้ว"
  if (filteredData.length === 0 && showOnlyPending && !keyword) {
    tableBodyToday.innerHTML = "";
    renderPaginationToday(0);          // ปิดปุ่ม pagination
    if (todayEmptyMessage) {
      todayEmptyMessage.style.display = "block";
    }
    return; // ไม่ต้อง render ตารางต่อ
  } else {
    // ถ้ามีข้อมูล หรือไม่ใช่โหมดรอเบิก → ซ่อนข้อความ
    if (todayEmptyMessage) {
      todayEmptyMessage.style.display = "none";
    }
  }

  const startIndex = (currentPageToday - 1) * itemsPerPageToday;
  const endIndex = startIndex + itemsPerPageToday;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  renderTableToday(paginatedData);
  renderPaginationToday(filteredData.length);
}

// ดึงไอดีรูปที่ใช้ในแท็บเบิกวันนี้ (รองรับทั้ง UrlWeb และฐานรูป imageDatabase)
function getTodayImageId(row) {
  const directId = (row.imageId || row.ImageId || row.image || row.Image || "").toString().trim();
  if (directId.length > 10) return directId;

  const material = (row.material || row.Material || "").toString().trim();
  if (material && imageDatabase[material] && imageDatabase[material].length > 0) {
    return imageDatabase[material][0];
  }

  const urlCandidate =
    row.UrlWeb ||
    row.urlWeb ||
    row.urlweb ||
    row.Url ||
    row.url ||
    vibhavadiUrlWebMap[material] ||
    "";
  const parsedId = extractIdFromUrlWeb(urlCandidate);
  return parsedId || "";
}

// สร้างเซลล์รูป (ใช้ thumbnail และ fallback เมื่อไม่มีรูป)
function createTodayImageCell(row) {
  const td = document.createElement("td");
  td.style.textAlign = "center";

  const fileId = getTodayImageId(row);
  if (!fileId) {
    td.textContent = "-";
    td.style.color = "#999";
    return td;
  }

  const wrapper = document.createElement("div");
  wrapper.style.display = "inline-flex";
  wrapper.style.cursor = "pointer";
  wrapper.title = "คลิกเพื่อดูรายละเอียด";

  const img = document.createElement("img");
  img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w100-h100`;
  img.alt = "รูปอะไหล่";
  img.loading = "lazy";
  img.style.width = "60px";
  img.style.height = "60px";
  img.style.objectFit = "cover";
  img.style.borderRadius = "6px";
  img.onerror = () => {
    img.src = "https://via.placeholder.com/60/ccc/999?text=NOIMG";
  };

  wrapper.appendChild(img);
  wrapper.onclick = async () => {
    // โหลดฐานรูปให้พร้อมก่อนเปิด
    try {
      await loadImageDatabase();
    } catch (e) {
      console.warn("โหลดฐานรูปไม่สำเร็จแต่จะพยายามเปิดรูปต่อ", e);
    }
    openTodayImageViewer(row);
  };

  td.appendChild(wrapper);
  return td;
}

// เปิด modal รูปใหญ่พร้อมเลื่อนซ้ายขวา (ใช้โครงสร้างเดียวกับแท็บรูปภาพ)
function openTodayImageViewer(row) {
  const material = (row.material || row.Material || "").toString().trim();
  const urlWeb =
    row.UrlWeb ||
    row.urlWeb ||
    row.url ||
    row.urlweb ||
    vibhavadiUrlWebMap[material] ||
    "";

  const mappedRow = {
    Material: material,
    Description: row.description || row.Description || "",
    UrlWeb: urlWeb,
    "วิภาวดี": row.vibhavadi || vibhavadiStockMap[material] || 0,
    Unrestricted: row.Unrestricted || row.unrestricted || 0,
    Rebuilt: row.Rebuilt || row.rebuilt || "",
    หมายเหตุ: row.remark || row["หมายเหตุ"] || "",
    Product: row.Product || "",
    OCRTAXT: row.OCRTAXT || "",
  };

  showDetailModal(mappedRow, "imageModalImages", "imageModalContentImages", { showInfo: false });
}

function renderTableToday(data) {
  tableBodyToday.innerHTML = "";
  data.forEach((row) => {
    const tr = document.createElement("tr");
    const selectTd = document.createElement("td");
    if (isAdminUser()) {
      const selectCheckbox = document.createElement("input");
      selectCheckbox.type = "checkbox";
      selectCheckbox.className = "today-select-checkbox";
      selectCheckbox.dataset.rowKey = getTodayRowKey(row);
      selectTd.appendChild(selectCheckbox);
    }
    tr.appendChild(selectTd);
    const statusTd = document.createElement("td");
    const status = row["status"] || "";
    statusTd.textContent = status;
    statusTd.className = status === "สั่งเบิกแล้ว" ? "status-green" : "status-red";
    tr.appendChild(statusTd);

    // IDRow
    const idRowTd = document.createElement("td");
    idRowTd.textContent = row["IDRow"] || "";
    tr.appendChild(idRowTd);

    // Image (thumbnail)
    tr.appendChild(createTodayImageCell(row));

    const columns = [
      "Timestamp",
      "material",
      "description",
      "quantity",
      "vibhavadi",        // ← เราจะแทนที่ค่านี้ใหม่
      "navanakorn",
      "employeeName",
      "team",
      "CallNumber",
      "CallType",
      "remark",
    ];

    columns.forEach((col) => {
      const td = document.createElement("td");
      let value = row[col] || "";

      // === ส่วนสำคัญ: แทนที่ค่าคอลัมน์ "vibhavadi" ด้วยข้อมูลจริงจาก MainSap ===
      if (col === "vibhavadi") {
        const material = (row["material"] || "").toString().trim();
        const realStock = vibhavadiStockMap[material];
        value = typeof realStock === 'number' ? realStock.toLocaleString() : "0";
        td.style.color = realStock > 0 ? "#27ae60" : "#e74c3c";
        td.style.fontWeight = "bold";
      }
      if (col === "navanakorn") {
        const material = (row["material"] || "").toString().trim();
        const realStockNava = navanakornStockMap[material];
        value = typeof realStockNava === 'number' ? realStockNava.toLocaleString() : "0";
        td.style.color = realStockNava > 0 ? "#2196f3" : "#e74c3c";
        td.style.fontWeight = "bold";
      }
      if (col === "Timestamp") {
        value = formatTimestamp(value); // เพิ่มบรรทัดนี้
      }
      if (col === "quantity" || col === "vibhavadi" || col === "navanakorn") {
        if (value && !isNaN(value)) {
          value = Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
        } else if (value === "0" || value === 0) {
          value = "";
        }
      }
      if (col === "remark" && value) {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }
      if (col === "material" && (row["remark"] || "").trim() !== "") {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }
      if (col === "description" && (row["remark"] || "").trim() !== "") {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }
      if (col === "Timestamp" && (row["remark"] || "").trim() !== "") {
        td.style.color = "#d32f2f";
        td.style.fontWeight = "bold";
      }
      if (col === "vibhavadi" && value) {
        td.style.color = "#4caf50"; // Green color
        td.style.fontWeight = "bold";
      }
      td.textContent = value;
      tr.appendChild(td);
    });
    const detailTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "ดูรายละเอียด";
    btn.className = "detail-button";
    btn.onclick = () => {
      modalContent.innerHTML = ["IDRow", ...columns]
        .map((col) => {
          let label = "";
          switch (col) {
            case "IDRow": label = "🆔 ลำดับ"; break;
            case "Timestamp": label = "📅 วันเวลา"; break;
            case "material": label = "🔢 Material"; break;
            case "description": label = "🛠️ Description"; break;
            case "quantity": label = "🔢 จำนวน"; break;
            case "employeeName": label = "👷‍♂️ ชื่อช่าง"; break;
            case "team": label = "🏢 หน่วยงาน"; break;
            case "CallNumber": label = "📄 Call"; break;
            case "CallType": label = "🗳️ CallType"; break;
            case "vibhavadi": label = "📦 คลังวิภาวดี"; break;
            case "navanakorn": label = "🏭 คลังนวนคร"; break;
            case "remark": label = "📝 หมายเหตุ"; break;
            default: label = col;
          }
          let value = row[col] || "";
          if (col === "Timestamp") {
            value = formatTimestamp(value); // เพิ่มบรรทัดนี้
          }
          const valueHtml = col === "remark" && value
            ? `<span class='value' style='color:#d32f2f'>${value}</span>`
            : `<span class='value'>${value}</span>`;
          return `<div><span class='label'>${label}:</span> ${valueHtml}</div>`;
        })
        .join("");
      modal.style.display = "block";
      setTimeout(() => {
        modal.style.opacity = "1";
        modal.style.transform = "scale(1)";
      }, 10);
    };
    detailTd.appendChild(btn);
    tr.appendChild(detailTd);
    tableBodyToday.appendChild(tr);
  });
}
function renderPaginationToday(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPageToday));

  pageNumbersToday.innerHTML = "";

  if (totalItems === 0) {
    firstPageButtonToday.disabled = true;
    prevPageButtonToday.disabled = true;
    nextPageButtonToday.disabled = true;
    lastPageButtonToday.disabled = true;
    return;
  }

  const currentPageBtn = document.createElement("button");
  currentPageBtn.textContent = currentPageToday;
  currentPageBtn.className = "active";
  currentPageBtn.disabled = true;
  pageNumbersToday.appendChild(currentPageBtn);

  const isFirst = currentPageToday === 1;
  const isLast = currentPageToday >= totalPages;

  firstPageButtonToday.disabled = isFirst;
  prevPageButtonToday.disabled = isFirst;
  nextPageButtonToday.disabled = isLast;
  lastPageButtonToday.disabled = isLast;
}
searchInputToday.addEventListener("input", debounce(() => {
  currentPageToday = 1;
  updateTableToday();
}));
firstPageButtonToday.onclick = () => {
  currentPageToday = 1;
  updateTableToday();
};

prevPageButtonToday.onclick = () => {
  if (currentPageToday > 1) {
    currentPageToday--;
    updateTableToday();
  }
};

nextPageButtonToday.onclick = () => {
  const totalPages = Math.ceil(currentFilteredDataToday.length / itemsPerPageToday);
  if (currentPageToday < totalPages) {
    currentPageToday++;
    updateTableToday();
  }
};

lastPageButtonToday.onclick = () => {
  const totalPages = Math.ceil(currentFilteredDataToday.length / itemsPerPageToday) || 1;
  currentPageToday = totalPages;
  updateTableToday();
};
async function loadVibhavadiStockMap() {
  if (Object.keys(vibhavadiStockMap).length > 0) {
    console.log("ใช้ Cache คลังวิภาวดี");
    return;
  }

  const mainSapUrl = '/api/main-sap';

  try {
    const res = await apiFetch(mainSapUrl);
    const data = await res.json();

    data.forEach(row => {
      const material = (row.Material || "").toString().trim();
      const vibhavadi = parseInt(row["วิภาวดี"] || 0, 10);
      const navanakorn = parseInt(row["Unrestricted"] || 0, 10);
      if (material) {
        vibhavadiStockMap[material] = vibhavadi;
        if (row.UrlWeb) {
          vibhavadiUrlWebMap[material] = row.UrlWeb;
        }
        navanakornStockMap[material] = isNaN(navanakorn) ? 0 : navanakorn;
      }
    });

    console.log(`โหลดข้อมูลคลังวิภาวดีสำเร็จ: ${Object.keys(vibhavadiStockMap).length} รายการ`);
  } catch (err) {
    console.error("โหลดข้อมูลคลังวิภาวดีล้มเหลว:", err);
    // ถ้าโหลดไม่ได้ ให้ใช้ค่าเดิมต่อไป
  }
}
async function loadTodayData(options = {}) {
  const { silent = false } = options;
  // ถ้ามีการโหลดค้างอยู่ให้ยกเลิกก่อน แล้วโหลดรอบใหม่
  if (todayFetchController) {
    todayFetchController.abort();
  }

  const controller = new AbortController();
  todayFetchController = controller;
  let timeoutId = null;

  // แสดง Loading (แบบเบาๆ ถ้ามีข้อมูลเดิมให้ดูทันที)
  if (!silent) {
    document.getElementById("loading").style.display = "flex";
  }
  document.getElementById("loadingToday").style.display = "block";
  errorContainerToday.style.display = "none";

  try {
    timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout 30 วินาที
    const imageDbPromise = loadImageDatabase().catch(err => {
      console.error("โหลดฐานข้อมูลรูปภาพไม่สำเร็จ:", err);
      return null;
    });

    // โหลดข้อมูลคลังวิภาวดี (MainSap) ก่อนเสมอ แต่โหลดแค่ครั้งเดียว
    if (Object.keys(vibhavadiStockMap).length === 0) {
      console.log("กำลังโหลดข้อมูลสต็อกจากคลังวิภาวดี (MainSap)...");
      await loadVibhavadiStockMap(); // ดึงข้อมูลจริงจาก Sheet
    } else {
      console.log("ใช้ Cache สต็อกวิภาวดีแล้ว (เร็วมาก!)");
    }

    // ดึงข้อมูลรายการเบิกวันนี้ (Request Sheet)
    const response = await apiFetch(requestSheetUrl, {
      signal: controller.signal,
      cache: 'no-store' // บังคับดึงข้อมูลใหม่ทุกครั้ง และไม่เก็บ cache เดิม
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const normalizedData = (Array.isArray(data) ? data : []).map((row, index) => {
      const rowId = row.row_id || row.id || (index + 2);
      return {
        ...row,
        row_id: rowId,
        id: row.id || rowId
      };
    });

    if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
      throw new Error("ไม่พบข้อมูลการเบิกวันนี้");
    }

    // บันทึกข้อมูลลงตัวแปร global
    allDataToday = normalizedData;
    currentPageToday = 1;
    todayDataLoaded = true;

    await imageDbPromise;
    // อัปเดตตาราง (จะดึงสต็อกวิภาวดีจริงมาแสดงอัตโนมัติ)
    updateTableToday();

    console.log("โหลดข้อมูลวันนี้สำเร็จ!", data.length, "รายการ");

  } catch (error) {
    console.error("โหลดข้อมูลวันนี้ล้มเหลว:", error);

    // ถ้า abort เพราะมีคำขอใหม่ ไม่ต้องแจ้ง Error ซ้ำ
    if (error.name === 'AbortError' && todayFetchController !== controller) {
      return;
    }

    errorContainerToday.style.display = "block";

    // ข้อความแจ้งเตือนผู้ใช้
    let msg = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    if (error.name === 'AbortError') {
      msg = "การเชื่อมต่อช้าเกินไป กรุณาลองใหม่";
    } else if (error.message.includes('403') || error.message.includes('CORS')) {
      msg = "ไม่สามารถเข้าถึง Google Sheets ได้ (ตรวจสอบการแชร์เป็น Public)";
    } else if (error.message.includes('Failed to fetch')) {
      msg = "ไม่มีการเชื่อมต่ออินเทอร์เน็ต";
    }

    document.getElementById("error-message-today").textContent = msg;

    // แจ้งเตือนด้วย SweetAlert
    Swal.fire({
      icon: "error",
      title: "โหลดข้อมูลไม่สำเร็จ",
      text: msg,
      confirmButtonText: "ตกลง"
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (todayFetchController === controller) {
      todayFetchController = null;
    }
    document.getElementById("loadingToday").style.display = "none";
    if (!silent) {
      document.getElementById("loading").style.display = "none";
    }
  }
}
// All tab functions (now after variables)
closeModalAll.onclick = () => modalAll.style.display = "none";
itemsPerPageSelectAll.addEventListener("change", (e) => {
  itemsPerPageAll = parseInt(e.target.value);
  currentPageAll = 1;
  renderTableAll(allDataAll);
});
function renderTableAll(data) {
  tableBodyAll.innerHTML = '';
  const startIdx = (currentPageAll - 1) * itemsPerPageAll;
  const endIdx = startIdx + itemsPerPageAll;
  const paginatedData = data.slice(startIdx, endIdx);
  paginatedData.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${i * 0.05}s`; // Fade-in ทีละแถว
    const status = row["status"] || "";
    const statusTd = document.createElement("td");
    statusTd.textContent = status;
    statusTd.className = status === "สั่งเบิกแล้ว" ? "status-green" : "status-red";
    tr.appendChild(statusTd);
    const columns = ["timestamp", "material", "description", "quantity", "employeeName", "team", "callNumber", "callType", "remark"];
    columns.forEach(col => {
      const td = document.createElement("td");
      td.textContent = row[col] || "";
      tr.appendChild(td);
    });
    const detailTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "ดูรายละเอียด";
    btn.className = "detail-button";
    btn.onclick = () => {
      modalContentAll.innerHTML = columns.map(col => {
        const label = col === "timestamp" ? "วันเวลา" : col;
        return `<div><span class='label'>${label}:</span> <span class='value'>${row[col] || ''}</span></div>`;
      }).join('');
      modalAll.style.display = "block";
    };
    detailTd.appendChild(btn);
    tr.appendChild(detailTd);
    tableBodyAll.appendChild(tr);
  });
  updatePaginationAll(data);
}
function updatePaginationAll(data) {
  const totalPages = Math.ceil(data.length / itemsPerPageAll);
  pageNumbersContainerAll.innerHTML = '';
  if (totalPages === 0) {
    firstPageButtonAll.disabled = true;
    prevPageButtonAll.disabled = true;
    nextPageButtonAll.disabled = true;
    lastPageButtonAll.disabled = true;
    return;
  }
  // แสดงเฉพาะหน้าปัจจุบัน
  const pageNumberButton = document.createElement("button");
  pageNumberButton.className = `all-page-number active`;
  pageNumberButton.textContent = currentPageAll;
  pageNumberButton.disabled = true; // ไม่ให้คลิกได้เพราะเป็นหน้าปัจจุบัน
  pageNumbersContainerAll.appendChild(pageNumberButton);
  firstPageButtonAll.disabled = currentPageAll === 1;
  prevPageButtonAll.disabled = currentPageAll === 1;
  nextPageButtonAll.disabled = currentPageAll === totalPages;
  lastPageButtonAll.disabled = currentPageAll === totalPages;
}
// ปุ่มเลื่อนไปหน้าแรก
firstPageButtonAll.onclick = () => {
  currentPageAll = 1;
  renderTableAll(allDataAll);
};
// ปุ่มย้อนกลับ
prevPageButtonAll.onclick = () => {
  if (currentPageAll > 1) {
    currentPageAll--;
    renderTableAll(allDataAll);
  }
};
// ปุ่มไปหน้า next
nextPageButtonAll.onclick = () => {
  const totalPages = Math.ceil(allDataAll.length / itemsPerPageAll);
  if (currentPageAll < totalPages) {
    currentPageAll++;
    renderTableAll(allDataAll);
  }
};
// ปุ่มไปหน้าสุดท้าย
lastPageButtonAll.onclick = () => {
  currentPageAll = Math.ceil(allDataAll.length / itemsPerPageAll);
  renderTableAll(allDataAll);
};
searchInputAll.addEventListener("input", e => {
  const keyword = e.target.value.toLowerCase();
  const filtered = allDataAll.filter(row => {
    return (
      (row["material"] || "").toLowerCase().includes(keyword) ||
      (row["description"] || "").toLowerCase().includes(keyword) ||
      (row["employeeName"] || "").toLowerCase().includes(keyword) ||
      (row["team"] || "").toLowerCase().includes(keyword) ||
      (row["remark"] || "").toLowerCase().includes(keyword)
    );
  });
  renderTableAll(filtered);
});
async function loadAllData() {
  try {
    const response = await apiFetch(`${gasUrl}?action=getRequests`);
    const res = await response.json();
    if (res.status === 'success') {
      allDataAll = res.data;
      renderTableAll(allDataAll);
    } else {
      throw new Error(res.data || 'GAS error');
    }
  } catch (error) {
    console.error("ไม่สามารถโหลดข้อมูลได้:", error);
    tableBodyAll.innerHTML = '<tr><td colspan="11">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
  }
}
// Pending-calls tab functions (now after variables)
closeModalPending.onclick = () => modalPending.style.display = "none";
window.addEventListener('click', event => {
  if (event.target == modalPending) modalPending.style.display = "none";
});
itemsPerPageSelectPending.addEventListener("change", (e) => {
  itemsPerPagePending = parseInt(e.target.value);
  currentPagePending = 1; // รีเซ็ตหน้าเมื่อเปลี่ยนจำนวนรายการต่อหน้า
  filterAndRenderTablePending();
});
searchInputPending.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    currentPagePending = 1; // รีเซ็ตหน้าเมื่อค้นหาใหม่
    filterAndRenderTablePending();
  }
});
searchButtonPending.addEventListener("click", () => {
  currentPagePending = 1; // รีเซ็ตหน้าเมื่อค้นหาใหม่
  filterAndRenderTablePending();
});
function populateTeamFilterPending(data) {
  const filteredData = data.filter(row => {
    const vipa = Number(row["Vipa"] || 0);
    const pendingDept = (row["ค้างหน่วยงาน"] || "").toLowerCase();
    return vipa > 0 &&
      !pendingDept.includes("stock วิภาวดี 62") &&
      !pendingDept.includes("nec_ยกเลิกผลิต");
  });
  const teams = [...new Set(filteredData.map(row => row["Team"]).filter(team => team && team.trim() !== ""))].sort();
  teamFilterPending.innerHTML = '<option value="">ทั้งหมด</option>';
  if (teams.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "ไม่มีทีมที่ตรงตามเงื่อนไข";
    option.disabled = true;
    teamFilterPending.appendChild(option);
  } else {
    teams.forEach(team => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      teamFilterPending.appendChild(option);
    });
  }
}
function addSortListenersPending() {
  const sortableHeaders = document.querySelectorAll("#pending-calls th.sortable");
  sortableHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const column = header.getAttribute("data-column");
      if (sortConfigPending.column === column) {
        sortConfigPending.direction = sortConfigPending.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfigPending.column = column;
        sortConfigPending.direction = 'asc';
      }
      updateSortArrowsPending();
      filterAndRenderTablePending();
    });
  });
}
function updateSortArrowsPending() {
  const sortableHeaders = document.querySelectorAll("#pending-calls th.sortable");
  sortableHeaders.forEach(header => {
    const arrow = header.querySelector(".pending-arrow");
    const column = header.getAttribute("data-column");
    if (column === sortConfigPending.column) {
      arrow.textContent = sortConfigPending.direction === 'asc' ? '↑' : '↓';
    } else {
      arrow.textContent = '';
    }
  });
}
function filterAndRenderTablePending() {
  const selectedTeam = teamFilterPending.value;
  const keyword = searchInputPending.value.toLowerCase().trim();
  let filteredData = allDataPending.filter(row => {
    const pendingDept = (row["ค้างหน่วยงาน"] || "").toLowerCase();
    return Number(row["Vipa"] || 0) > 0 &&
      !pendingDept.includes("stock วิภาวดี 62") &&
      !pendingDept.includes("nec_ยกเลิกผลิต") &&
      (!selectedTeam || row["Team"] === selectedTeam) &&
      (!keyword ||
        (row["DateTime"] || "").toLowerCase().includes(keyword) ||
        (row["Ticket Number"] || "").toLowerCase().includes(keyword) ||
        (row["Team"] || "").toLowerCase().includes(keyword) ||
        (row["Brand"] || "").toLowerCase().includes(keyword) ||
        (row["ค้างหน่วยงาน"] || "").toLowerCase().includes(keyword) ||
        (row["Material"] || "").toLowerCase().includes(keyword) ||
        (row["Description"] || "").toLowerCase().includes(keyword) ||
        (row["Vipa"] || "").toLowerCase().includes(keyword) ||
        (row["DayRepair"] || "").toLowerCase().includes(keyword)
      );
  });
  if (sortConfigPending.column) {
    filteredData.sort((a, b) => {
      let valueA = a[sortConfigPending.column] || "";
      let valueB = b[sortConfigPending.column] || "";
      if (sortConfigPending.column === 'DayRepair' || sortConfigPending.column === 'Vipa') {
        valueA = Number(valueA) || 0;
        valueB = Number(valueB) || 0;
        return sortConfigPending.direction === 'asc' ? valueA - valueB : valueB - valueA;
      } else {
        valueA = valueA.toString().toLowerCase();
        valueB = valueB.toString().toLowerCase();
        return sortConfigPending.direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }
    });
  }
  // ตรวจสอบว่า currentPage อยู่ในช่วงที่ถูกต้อง
  const totalPages = Math.ceil(filteredData.length / itemsPerPagePending);
  if (currentPagePending > totalPages) {
    currentPagePending = totalPages || 1;
  }
  renderTablePending(filteredData);
  updateCallCountPending(filteredData);
}
teamFilterPending.addEventListener("change", () => {
  currentPagePending = 1; // รีเซ็ตหน้าเมื่อเปลี่ยนทีม
  filterAndRenderTablePending();
});
function updateCallCountPending(data) {
  const uniqueTickets = [...new Set(data.map(row => row["Ticket Number"]))];
  const count = uniqueTickets.length;
  const callCountValue = document.getElementById("callCountValuePending");
  callCountValue.textContent = count;
}
function formatDateTimePending(dateTime) {
  if (!dateTime) return "";
  const datePart = dateTime.split(" ")[0];
  return datePart;
}
function renderTablePending(data) {
  tableBodyPending.innerHTML = '';
  const startIdx = (currentPagePending - 1) * itemsPerPagePending;
  const endIdx = startIdx + itemsPerPagePending;
  const paginatedData = data.slice(startIdx, endIdx);
  if (paginatedData.length === 0) {
    tableBodyPending.innerHTML = '<tr><td colspan="10" class="pending-text-center">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
    updatePaginationPending(data);
    return;
  }
  const ticketGroups = {};
  data.forEach(row => {
    const ticket = row["Ticket Number"];
    if (!ticketGroups[ticket]) {
      ticketGroups[ticket] = [];
    }
    ticketGroups[ticket].push(row);
  });
  const uniqueTickets = Object.keys(ticketGroups).sort();
  const colorMap = {};
  uniqueTickets.forEach((ticket, index) => {
    if (ticket === "24103102058") {
      colorMap[ticket] = "pending-yellow-light";
    } else if (ticket === "25011101274") {
      colorMap[ticket] = "pending-pink-pastel";
    } else {
      colorMap[ticket] = index % 2 === 0 ? "pending-yellow-light" : "pending-pink-pastel";
    }
  });
  paginatedData.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${i * 0.05}s`;
    const ticket = row["Ticket Number"];
    tr.className = colorMap[ticket];
    const columns = ["DateTime", "Ticket Number", "Team", "Brand", "ค้างหน่วยงาน", "Material", "Description", "Vipa", "DayRepair"];
    columns.forEach(col => {
      const td = document.createElement("td");
      let cellValue = row[col] || "";
      if (col === "DateTime") {
        cellValue = formatDateTimePending(cellValue);
      } else if (col === "DayRepair" || col === "Vipa") {
        const numValue = Number(cellValue);
        cellValue = isNaN(numValue) ? "" : numValue.toString();
      }
      td.textContent = cellValue;
      if (col === "Description") {
        td.classList.add("pending-text-left");
      } else if (col === "Vipa" || col === "DayRepair") {
        td.classList.add("pending-text-center");
      }
      if ((col === "Material" || col === "Description") && row["Description"] === "Code ผิด") {
        td.className = "pending-highlight-red";
      }
      tr.appendChild(td);
    });
    const detailTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "ดูรายละเอียด";
    btn.className = "pending-detail-button";
    btn.onclick = () => {
      modalContentPending.innerHTML = columns.map(col => {
        let value = row[col] || "";
        if (col === "DateTime") {
          value = formatDateTimePending(value);
        } else if (col === "DayRepair" || col === "Vipa") {
          const numValue = Number(value);
          value = isNaN(numValue) ? "" : numValue.toString();
        }
        let valueClass = (col === "Material" || col === "Description") && row["Description"] === "Code ผิด" ? "pending-highlight-red" : "value";
        return `<div><span class='label'>${col}:</span> <span class='${valueClass}'>${value}</span></div>`;
      }).join('');
      modalPending.style.display = "block";
    };
    detailTd.appendChild(btn);
    tr.appendChild(detailTd);
    tableBodyPending.appendChild(tr);
  });
  updatePaginationPending(data);
}
function updatePaginationPending(data) {
  const totalPages = Math.ceil(data.length / itemsPerPagePending);
  pageNumbersContainerPending.innerHTML = '';
  if (totalPages === 0) {
    firstPageButtonPending.disabled = true;
    prevPageButtonPending.disabled = true;
    nextPageButtonPending.disabled = true;
    lastPageButtonPending.disabled = true;
    return;
  }
  // แสดงเฉพาะหน้าปัจจุบัน
  const pageNumberButton = document.createElement("button");
  pageNumberButton.className = `pending-page-number active`;
  pageNumberButton.textContent = currentPagePending;
  pageNumberButton.disabled = true; // ไม่ให้คลิกได้เพราะเป็นหน้าปัจจุบัน
  pageNumbersContainerPending.appendChild(pageNumberButton);
  firstPageButtonPending.disabled = currentPagePending === 1;
  prevPageButtonPending.disabled = currentPagePending === 1;
  nextPageButtonPending.disabled = currentPagePending === totalPages;
  lastPageButtonPending.disabled = currentPagePending === totalPages;
}
firstPageButtonPending.onclick = () => {
  currentPagePending = 1;
  filterAndRenderTablePending();
};
prevPageButtonPending.onclick = () => {
  if (currentPagePending > 1) {
    currentPagePending--;
    filterAndRenderTablePending();
  }
};
nextPageButtonPending.onclick = () => {
  const totalPages = Math.ceil(allDataPending.filter(row => {
    const pendingDept = (row["ค้างหน่วยงาน"] || "").toLowerCase();
    return Number(row["Vipa"] || 0) > 0 &&
      !pendingDept.includes("stock วิภาวดี 62") &&
      !pendingDept.includes("nec_ยกเลิกผลิต");
  }).length / itemsPerPagePending);
  if (currentPagePending < totalPages) {
    currentPagePending++;
    filterAndRenderTablePending();
  }
};
lastPageButtonPending.onclick = () => {
  currentPagePending = Math.ceil(allDataPending.filter(row => {
    const pendingDept = (row["ค้างหน่วยงาน"] || "").toLowerCase();
    return Number(row["Vipa"] || 0) > 0 &&
      !pendingDept.includes("stock วิภาวดี 62") &&
      !pendingDept.includes("nec_ยกเลิกผลิต");
  }).length / itemsPerPagePending);
  filterAndRenderTablePending();
};
async function loadPendingCallsData() {
  console.log("กำลังโหลดข้อมูล Pending Calls...");
  const cacheKey = "pending-calls-data-v3";
  try {
    allDataPending = await getCachedData(cacheKey, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await apiFetch(urlPending, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }, 6);

    populateTeamFilterPending(allDataPending);
    addSortListenersPending();
    filterAndRenderTablePending();
    pendingDataLoaded = true;
    hideLoading();
  } catch (error) {
    console.error("โหลด Pending Calls ล้มเหลว:", error);
    tableBodyPending.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#e74c3c;">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</td></tr>';
    hideLoading();
  }
}
// Add sort listeners for pending calls
document.addEventListener('DOMContentLoaded', () => {
  addSortListenersPending();
});
// Auto-load default data if logged in
if (appContent.classList.contains('logged-in')) {
  loadData();
}
// เพิ่มฟังก์ชัน formatTimestamp หลังจากตัวแปร global (เช่น หลัง let sortConfigToday = { ... };)
function formatTimestamp(dateTimeStr) {
  if (!dateTimeStr) return "";
  const trimmed = dateTimeStr.trim();
  const parts = trimmed.split(' ');
  const datePart = parts[0] || "";
  const timePart = parts[1] || "";
  const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) return trimmed;

  const a = parseInt(dateMatch[1], 10);
  const b = parseInt(dateMatch[2], 10);
  const y = parseInt(dateMatch[3], 10);
  if (!a || !b || !y) return trimmed;

  // รองรับทั้ง MM/DD/YYYY และ DD/MM/YYYY
  const isMonthFirst = a <= 12 && b > 12;
  const day = isMonthFirst ? b : a;
  const month = isMonthFirst ? a : b;
  const yearBE = y + 543;
  const formattedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${yearBE}`;
  const formattedTime = timePart ? ` ${timePart}` : '';
  return `${formattedDate}${formattedTime}`;
}
// ========== ฟังก์ชันช่วยสำหรับการจัดการวันที่ไทย ==========
// ========== ฟังก์ชันช่วยสำหรับการแปลงวันที่ค.ศ. ที่มีเวลา ==========
function parseDateTimeToJSDate(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;
  // รองรับรูปแบบ: "DD/MM/YYYY, HH:mm:ss"
  const match = dateTimeStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10) - 1; // JS เดือนนับจาก 0
  const y = parseInt(year, 10);
  if (y < 2000 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
  return new Date(y, m, d, parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10));
}

function formatDateTimeToThai(dateTimeStr) {
  const dateObj = parseDateTimeToJSDate(dateTimeStr);
  if (!dateObj) return "ไม่ระบุวันที่";
  const d = dateObj.getDate();
  const m = dateObj.getMonth() + 1; // แปลงกลับเป็น 1–12
  const yBE = dateObj.getFullYear() + 543;
  const h = dateObj.getHours().toString().padStart(2, '0');
  const min = dateObj.getMinutes().toString().padStart(2, '0');
  const sec = dateObj.getSeconds().toString().padStart(2, '0');
  const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d} ${months[m]} ${yBE}, ${h}:${min}:${sec}`;
}

// === จัดการสถานะอ่านข้อความแจ้งเตือน (นับ badge แบบคลิกอ่านทีละข้อความ) ===
function getReadAnnouncements() {
  try {
    const stored = JSON.parse(localStorage.getItem('readAnnouncements') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (e) {
    return [];
  }
}
function saveReadAnnouncements(list) {
  const unique = Array.from(new Set(list));
  // เก็บล่าสุดไม่ให้โตเกิน
  const trimmed = unique.slice(-200);
  localStorage.setItem('readAnnouncements', JSON.stringify(trimmed));
}
function markAnnouncementAsRead(updatedAt) {
  if (!updatedAt) return;
  const read = getReadAnnouncements();
  if (read.includes(updatedAt)) return;
  read.push(updatedAt);
  saveReadAnnouncements(read);
  updateAnnouncementBadgeFromCache();
}
function updateAnnouncementBadgeFromCache() {
  if (!announcementCache || announcementCache.length === 0) {
    updateNotificationBadge(false, 0);
    return;
  }
  const readSet = new Set(getReadAnnouncements());
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  const unreadCount = announcementCache.filter(item => {
    const d = parseDateTimeToJSDate(item.updatedAt);
    return d && d.getTime() > twoDaysAgo && !readSet.has(item.updatedAt);
  }).length;
  updateNotificationBadge(unreadCount > 0, unreadCount);
}

// ========== แสดงข้อความแจ้งเตือน ==========
// ฟังก์ชันเปิดดูประกาศ
async function openAnnouncementDeck() {
  console.log('เปิดหน้าต่างประกาศ...');
  
  // แสดง Loading
  Swal.fire({
    title: 'กำลังโหลดประกาศ...',
    text: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });
  
  try {
    // ดึงข้อมูลประกาศจาก Google Sheet
    const res = await apiFetch('/api/announcement', {
      cache: 'no-cache'
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ไม่สามารถโหลดข้อมูลได้`);
    }
    
    const data = await res.json();
    
    if (!data || data.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'ยังไม่มีประกาศ',
        html: `
          <div style="text-align:center; padding:20px;">
            <i class="fas fa-inbox" style="font-size:60px; color:#95a5a6; margin-bottom:20px;"></i>
            <p style="font-size:18px; color:#7f8c8d; font-weight:600;">คลังวิภาวดี 62 ยังไม่ได้ส่งประกาศล่าสุด</p>
            <p style="color:#bdc3c7; margin-top:10px;">กรุณาตรวจสอบอีกครั้งในภายหลัง</p>
          </div>
        `,
        confirmButtonText: 'ปิด',
        width: window.innerWidth <= 480 ? '90%' : '400px',
        customClass: {
          popup: 'animated fadeIn'
        }
      });
      return;
    }

    // กรองและเรียงลำดับประกาศ
    const sorted = data
      .filter(r => r.message && r.message.trim() !== "")
      .sort((a, b) => {
        const dateA = parseDateTimeToJSDate(a.updatedAt);
        const dateB = parseDateTimeToJSDate(b.updatedAt);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA; // เรียงจากใหม่ไปเก่า
      });

    console.log(`พบ ${sorted.length} ประกาศ`);
    announcementCache = sorted;

    // สร้าง HTML สำหรับแสดงประกาศ
    let html = `
      <div style="max-height:65vh; overflow-y:auto; padding:5px; margin:-10px -10px 0 -10px;">
        <div style="margin-bottom:15px; padding:12px; background:linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius:12px; text-align:center;">
          <i class="fas fa-bullhorn" style="color:#e74c3c; margin-right:8px;"></i>
          <span style="font-weight:bold; color:#2c3e50;">มี ${sorted.length} ประกาศ</span>
        </div>
    `;
    
    let unreadCount = 0;
    const readSet = new Set(getReadAnnouncements());
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);

    sorted.forEach((item, idx) => {
      const subject = (item.subject || "ประกาศ").trim();
      const message = (item.message || "").trim().replace(/\n/g, '<br>');
      const rawDate = item.updatedAt || "";
      const by = item.updatedBy || "Admin";
      const niceDate = formatDateTimeToThai(rawDate);
      const itemDate = parseDateTimeToJSDate(rawDate);

      // ใช้สถานะอ่าน/ยังไม่อ่าน ตามการคลิกจริง
      const isRecent = itemDate && itemDate.getTime() > twoDaysAgo;
      const isUnread = isRecent && !readSet.has(rawDate);
      if (isUnread) unreadCount++;

      html += `
        <div class="announcement-item" data-updated-at="${rawDate}" 
             style="background:#fff; border-radius:16px; margin:0 0 15px 0; overflow:hidden;
                     box-shadow:0 4px 15px rgba(0,0,0,0.08); border-left:6px solid ${isUnread ? '#e74c3c' : (isRecent ? '#3498db' : '#95a5a6')};
                     cursor:pointer; transition:all 0.3s ease;"
             onclick="toggleAnnouncementBody(this)">
          <div class="announcement-header" style="padding:16px; background:${isUnread ? 'linear-gradient(135deg,#e74c3c,#c0392b)' : (isRecent ? 'linear-gradient(135deg,#3498db,#2980b9)' : 'linear-gradient(135deg,#95a5a6,#7f8c8d)')};
                      color:white; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
              <div style="font-size:16px; margin-bottom:4px;">
                <i class="fas ${isUnread ? 'fa-exclamation-circle' : 'fa-info-circle'}" style="margin-right:8px;"></i>
                ${subject}
              </div>
              <div style="font-size:12px; opacity:0.9; display:flex; align-items:center; gap:10px;">
                <span><i class="far fa-calendar-alt"></i> ${niceDate}</span>
                ${by !== "Admin" ? `<span><i class="fas fa-user"></i> ${by}</span>` : ''}
              </div>
            </div>
            ${isUnread ? '<span class="announcement-new-pill" style="background:#fff; color:#e74c3c; padding:4px 10px; border-radius:15px; font-size:11px; font-weight:bold; white-space:nowrap;">NEW</span>' : ''}
          </div>
          <div class="announcement-body" style="display:none; padding:16px; font-size:15px; color:#2c3e50; line-height:1.6; border-top:1px solid #eee;">
            <div style="white-space:pre-line;">${message}</div>
            ${itemDate ? `
              <div style="margin-top:15px; padding-top:15px; border-top:1px dashed #ddd; color:#7f8c8d; font-size:13px; text-align:right;">
                <i class="far fa-clock"></i> โพสต์เมื่อ ${formatDateTimeToThai(rawDate)}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    html += `
      </div>
      <div style="margin-top:20px; padding-top:15px; border-top:1px solid #eee; text-align:center;">
        <div style="margin-bottom:10px; color:#7f8c8d; font-size:14px;">
          <i class="fas fa-info-circle"></i> คลิกที่แต่ละประกาศเพื่อดูรายละเอียด
        </div>
      </div>
    `;

    updateAnnouncementBadgeFromCache();

    // แสดงหน้าต่างประกาศ
    Swal.fire({
      title: `<div style="display:flex; align-items:center; gap:10px; color:#2c3e50;">
                <i class="fas fa-bullhorn" style="color:#e74c3c; font-size:24px;"></i>
                <span style="font-size:22px; font-weight:700;">ประกาศจากคลังวิภาวดี 62</span>
                ${unreadCount > 0 ? `<span style="background:#e74c3c; color:white; padding:2px 10px; border-radius:15px; font-size:14px;">${unreadCount} ใหม่</span>` : ''}
              </div>`,
      html: html,
      width: window.innerWidth <= 480 ? '95%' : '550px',
      padding: '20px',
      showConfirmButton: false,
      showCloseButton: true,
      closeButtonHtml: '<i class="fas fa-times"></i>',
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: 'animated fadeInDown faster',
        closeButton: 'swal2-close-custom'
      },
      didOpen: (popup) => {
        console.log('เปิดหน้าต่างประกาศแล้ว');
        // Scroll to top
        const content = popup.querySelector('.swal2-html-container');
        if (content) {
          content.scrollTop = 0;
        }
      }
    });
    
  } catch (err) {
    console.error("โหลดประกาศล้มเหลว:", err);
    
    // ปิด Loading
    Swal.close();
    
    Swal.fire({
      icon: 'error',
      title: 'โหลดประกาศไม่สำเร็จ',
      html: `
        <div style="text-align:center; padding:20px;">
          <i class="fas fa-exclamation-triangle" style="font-size:60px; color:#e74c3c; margin-bottom:20px;"></i>
          <p style="font-size:18px; color:#e67e22; font-weight:600;">ไม่สามารถโหลดข้อมูลประกาศได้</p>
          <p style="color:#95a5a6; margin-top:10px;">${err.message || 'กรุณาลองใหม่ในภายหลัง'}</p>
          <div style="margin-top:20px; padding:15px; background:#fff8e1; border-radius:10px; border-left:5px solid #ffb300;">
            <p style="margin:0; font-size:14px; color:#5d4037;">
              <i class="fas fa-lightbulb"></i> 
              ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองใหม่อีกครั้ง
            </p>
          </div>
        </div>
      `,
      confirmButtonText: 'ลองอีกครั้ง',
      confirmButtonColor: '#e74c3c',
      showCancelButton: true,
      cancelButtonText: 'ปิด',
      width: window.innerWidth <= 480 ? '90%' : '500px'
    }).then((result) => {
      if (result.isConfirmed) {
        openAnnouncementDeck();
      }
    });
  }
}

// ฟังก์ชันช่วยสำหรับเปิด/ปิดรายละเอียดประกาศ
function toggleAnnouncementBody(element) {
  const body = element.querySelector('.announcement-body');
  const icon = element.querySelector('.fa-info-circle, .fa-exclamation-circle');
  
  if (body.style.display === 'none' || !body.style.display) {
    body.style.display = 'block';
    // เมื่อเปิดอ่านถือว่าอ่านแล้ว → ลด badge
    const updatedAt = element.dataset.updatedAt || '';
    markAnnouncementAsRead(updatedAt);
    const newPill = element.querySelector('.announcement-new-pill');
    if (newPill) newPill.remove();
    element.style.borderLeftColor = '#3498db';
    const header = element.querySelector('.announcement-header');
    if (header) header.style.background = 'linear-gradient(135deg,#3498db,#2980b9)';
    if (icon) {
      icon.classList.remove('fa-info-circle', 'fa-exclamation-circle');
      icon.classList.add('fa-chevron-up');
    }
    element.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
  } else {
    body.style.display = 'none';
    if (icon) {
      icon.classList.remove('fa-chevron-up');
      const isNew = element.style.borderLeftColor.includes('e74c3c');
      icon.classList.add(isNew ? 'fa-exclamation-circle' : 'fa-info-circle');
    }
    element.style.boxShadow = '0 4px 15px rgba(0,0,0,0.08)';
  }
}

// สำหรับการ์ดแจ้งเตือนอีกชุดหนึ่ง (โค้ด legacy)
function handleLegacyAnnouncementClick(el, updatedAt) {
  const body = el.querySelector('.ann-body');
  if (body) {
    body.style.display = body.style.display === 'block' ? 'none' : 'block';
  }
  markAnnouncementAsRead(updatedAt);
  const newPill = el.querySelector('.announcement-new-pill');
  if (newPill) newPill.remove();
  el.style.borderLeft = '6px solid #3498db';
  const header = el.querySelector('div');
  if (header) header.style.background = 'linear-gradient(135deg,#3498db,#2980b9)';
}

// ฟังก์ชันเปิดประกาศและเคลียร์ badge โดยอัตโนมัติ
async function openAnnouncementDeckAndClear() {
  console.log('เปิดประกาศและเคลียร์ badge');
  await openAnnouncementDeck();
}

// ฟังก์ชันเปิดประกาศแบบไม่เคลียร์ badge (สำหรับการตรวจสอบ)
async function openAnnouncementDeckPreview() {
  console.log('เปิดประกาศแบบดูเฉยๆ (ไม่เคลียร์ badge)');
  await openAnnouncementDeck();
}

// ฟังก์ชันตรวจสอบประกาศใหม่
async function checkNewAnnouncements() {
  console.log('เริ่มตรวจสอบประกาศใหม่...');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const savedUsername = localStorage.getItem('username');
  if (!isLoggedIn || !savedUsername) {
    console.log('ยังไม่ล็อกอิน ข้ามการตรวจสอบประกาศ');
    updateNotificationBadge(false, 0);
    return;
  }
  try {
    const res = await apiFetch('/api/announcement', {
      cache: 'no-store'
    });
    if (res.status === 401) {
      console.warn('session หมดอายุหรือไม่ได้รับอนุญาต → บังคับให้ออกจากระบบ');
      handleLogout();
      return;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data || data.length === 0) {
      console.log('ไม่มีประกาศในระบบ');
      updateNotificationBadge(false, 0);
      return;
    }
    const sorted = data
      .filter(r => r.message && r.message.trim() !== "")
      .sort((a, b) => {
        const dateA = parseDateTimeToJSDate(a.updatedAt);
        const dateB = parseDateTimeToJSDate(b.updatedAt);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
      });
    if (sorted.length === 0) {
      console.log('ไม่มีประกาศที่กรองแล้ว');
      updateNotificationBadge(false, 0);
      return;
    }
    announcementCache = sorted;
    const readSet = new Set(getReadAnnouncements());
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const unreadCount = sorted.filter(item => {
      const itemDate = parseDateTimeToJSDate(item.updatedAt);
      return itemDate && itemDate.getTime() > twoDaysAgo && !readSet.has(item.updatedAt);
    }).length;
    console.log('จำนวนประกาศใหม่ (ยังไม่อ่าน):', unreadCount);
    updateNotificationBadge(unreadCount > 0, unreadCount);
  } catch (err) {
    console.error("ตรวจสอบประกาศล้มเหลว:", err);
    updateNotificationBadge(false, 0);
  }
}

// ฟังก์ชันอัปเดต badge แจ้งเตือน
function updateNotificationBadge(show, count = 0) {
  const badge = document.getElementById('notificationBadge');
  if (!badge) {
    console.warn('ไม่พบ element notificationBadge');
    return;
  }
  if (!document.getElementById('notificationBadgeStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationBadgeStyles';
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(231, 76, 60, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
      }
      .notification-badge {
        position: absolute;
        top: 5px;
        right: 5px;
        background-color: #e74c3c;
        color: white;
        border-radius: 10px;
        min-width: 20px;
        height: 20px;
        font-size: 12px;
        font-weight: bold;
        display: none;
        justify-content: center;
        align-items: center;
        animation: pulse 2s infinite;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        border: 2px solid white;
      }
      .notification-badge.small {
        width: 12px;
        height: 12px;
        min-width: 12px;
        font-size: 0;
        top: 8px;
        right: 8px;
      }
    `;
    document.head.appendChild(style);
  }
  if (show && count > 0) {
    badge.style.display = 'flex';
    if (count > 9) {
      badge.textContent = '9+';
      badge.style.width = '24px';
      badge.style.height = '20px';
      badge.style.fontSize = '11px';
      badge.classList.remove('small');
    } else if (count === 1) {
      badge.textContent = '';
      badge.style.width = '12px';
      badge.style.height = '12px';
      badge.classList.add('small');
    } else {
      badge.textContent = count.toString();
      badge.style.width = '20px';
      badge.style.height = '20px';
      badge.style.fontSize = '12px';
      badge.classList.remove('small');
    }
    badge.style.justifyContent = 'center';
    badge.style.alignItems = 'center';
    badge.style.animation = 'pulse 2s infinite';
    console.log(`แสดง badge: ${count} ประกาศใหม่`);
  } else {
    badge.style.display = 'none';
    console.log('ซ่อน badge');
  }
}

// ฟังก์ชันเคลียร์การแจ้งเตือน
function clearNotificationBadge() {
  console.log('เคลียร์การแจ้งเตือน');
  const read = getReadAnnouncements();
  const allIds = [
    ...read,
    ...((announcementCache || []).map(item => item.updatedAt).filter(Boolean))
  ];
  saveReadAnnouncements(allIds);
  updateAnnouncementBadgeFromCache();
  Swal.fire({
    icon: 'success',
    title: 'เคลียร์การแจ้งเตือนแล้ว',
    text: 'ปุ่มกระดิ่งจะไม่แสดงสัญลักษณ์จนกว่าจะมีประกาศใหม่',
    timer: 2000,
    showConfirmButton: false
  });
}

// ฟังก์ชันตั้งค่าการตรวจสอบอัตโนมัติ
function setupAnnouncementChecker() {
  console.log('ตั้งค่าการตรวจสอบประกาศอัตโนมัติ');
  setTimeout(() => {
    checkNewAnnouncements();
  }, 2000);
  const checkInterval = setInterval(() => {
    checkNewAnnouncements();
  }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('ผู้ใช้กลับมาที่หน้าเว็บ → ตรวจสอบประกาศใหม่');
      checkNewAnnouncements();
    }
  });
  window.addEventListener('focus', () => {
    console.log('ผู้ใช้กลับมาที่หน้าต่าง → ตรวจสอบประกาศใหม่');
    checkNewAnnouncements();
  });
  return checkInterval;
}

// เรียกใช้เมื่อ DOM โหลดเสร็จ
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM โหลดเสร็จ → ตั้งค่าการตรวจสอบประกาศ');
  
  // ตั้งค่าการตรวจสอบประกาศอัตโนมัติ
  setTimeout(() => {
    setupAnnouncementChecker();
  }, 1000);
  
  // อัปเดตปุ่ม notification ให้เรียกฟังก์ชันที่เคลียร์ badge ด้วย
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    const savedUsername = localStorage.getItem('username');
    if (savedUsername === '7512411') {
      notificationBtn.onclick = openAnnouncementEditor;
      notificationBtn.title = "จัดการ/สร้างประกาศ";
    } else {
      notificationBtn.onclick = openAnnouncementDeckAndClear;
    }
  }
});

// เรียกใช้เมื่อผู้ใช้ล็อกอิน
function setupNotificationAfterLogin() {
  console.log('ผู้ใช้ล็อกอิน → ตั้งค่าการตรวจสอบประกาศ');
  
  setTimeout(() => {
    checkNewAnnouncements();
    setupAnnouncementChecker();
  }, 2000);
}

// เพิ่ม animation CSS สำหรับ badge
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  
  #notificationBadge {
    animation: pulse 2s infinite;
  }
`;
document.head.appendChild(style);

function showImageDetailModal(row) {
  // 1. ดึง File ID จาก row.UrlWeb
  let fileId = "";
  const urlWeb = row.UrlWeb || "";
  if (urlWeb.includes("/d/")) {
    fileId = urlWeb.split("/d/")[1].split("/")[0];
  } else if (urlWeb.includes("id=")) {
    fileId = urlWeb.split("id=")[1].split("&")[0];
  } else if (urlWeb.match(/^[a-zA-Z0-9-_]+$/)) {
    fileId = urlWeb;
  }

  // 2. สร้าง HTML
  const imageHtml = fileId ? `
    <div style="text-align:center; margin-bottom:20px;">
      <img src="https://drive.google.com/thumbnail?id=${fileId}&sz=w500"
           alt="รูปใหญ่"
           style="max-width:100%; max-height:300px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.2);">
    </div>
  ` : '';

  const detailHtml = `
    ${imageHtml}
    <div style="font-size:16px; line-height:1.6;">
      <div><strong>Material:</strong> ${row.Material || '-'}</div>
      <div><strong>Description:</strong> ${row.Description || '-'}</div>
      <div><strong>Storage bin:</strong> ${getStorageBinValue(row) || '-'}</div>
      <div><strong>วิภาวดี:</strong> ${(parseFloat(row.วิภาวดี) || 0).toLocaleString()} ชิ้น</div>
      <div><strong>Unrestricted:</strong> ${(parseFloat(row.Unrestricted) || 0).toLocaleString()} ชิ้น</div>
      <div><strong>Rebuilt:</strong> ${row.Rebuilt || '-'}</div>
      <div><strong>หมายเหตุ:</strong> <span style="color:#d32f2f; font-weight:bold;">${row.หมายเหตุ || '-'}</span></div>
      <div><strong>Product:</strong> ${row.Product || '-'}</div>
      <div><strong>OCRTAXT:</strong> ${row.OCRTAXT || '-'}</div>
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button class="requisition-button" style="padding:8px 24px;" 
              onclick="showRequisitionDialog(${JSON.stringify(row).replace(/"/g, '&quot;')})">
        เบิกเลย
      </button>
    </div>
  `;

  // 3. แสดง modal
  const imageModal = document.getElementById("imageModal");
  const imageModalContent = document.getElementById("imageModalContent");
  if (imageModal && imageModalContent) {
    imageModalContent.innerHTML = detailHtml;
    imageModal.style.display = "block";
  }
}
// ===== PWA ติดตั้ง – เวอร์ชันแก้หายขาด 100% (2025) =====
let deferredPrompt = null;
// ฟังก์ชันเช็ค + ลบปุ่มทิ้งถาวร
function permanentlyHideInstallButton() {
  const btn = document.getElementById('install-btn');
  if (btn) {
    btn.remove(); // ลบออกจาก DOM เลย
    console.log('ปุ่มติดตั้งถูกลบถาวร');
  }
}
// 1. เช็คทันทีตอนโหลดหน้า
if (localStorage.getItem('partgo-installed') === 'true') {
  permanentlyHideInstallButton();
}
// 2. ดัก beforeinstallprompt – ป้องกันไม่ให้โผล่ถ้าติดตั้งแล้ว
window.addEventListener('beforeinstallprompt', (e) => {
  // ถ้าเคยติดตั้งแล้ว → บล็อกเหตุการณ์นี้ทันที
  if (localStorage.getItem('partgo-installed') === 'true') {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  deferredPrompt = e;
  // แสดงปุ่ม (เฉพาะครั้งแรก)
  const btn = document.getElementById('install-btn');
  if (btn) {
    btn.style.display = 'flex';
  }
});
// 3. เมื่อผู้ใช้กดปุ่มติดตั้ง
document.getElementById('install-btn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('partgo-installed', 'true');
    permanentlyHideInstallButton();
    Swal.fire({
      icon: 'success',
      title: 'ติดตั้งสำเร็จ!',
      text: 'PartsGo ถูกเพิ่มในหน้าจอหลักแล้ว',
      timer: 3000,
      showConfirmButton: false
    });
  }
  deferredPrompt = null;
});
// 4. ดักเหตุการณ์เมื่อติดตั้งจริง ๆ (Chrome ยิง event นี้)
window.addEventListener('appinstalled', () => {
  localStorage.setItem('partgo-installed', 'true');
  permanentlyHideInstallButton();
  console.log('PWA ติดตั้งสำเร็จโดยสมบูรณ์');
});
// 5. ป้องกันกรณีรีเฟรชเร็ว / เปิดแท็บใหม่
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('partgo-installed') === 'true') {
    permanentlyHideInstallButton();
  }
});
// สำรองเผื่อ Chrome โหลดช้า
setTimeout(() => {
  if (localStorage.getItem('partgo-installed') === 'true') {
    permanentlyHideInstallButton();
  }
}, 500);
// ฟังก์ชันเปิดหน้าต่างแก้ไขประกาศ (เฉพาะ 7512411)
function openAnnouncementEditor() {
  Swal.fire({
    title: '<i class="fas fa-bullhorn"></i> บันทึกข้อความแจ้งเตือน',
    html: `
      <!-- ช่องกรอกหัวเรื่อง -->
      <div style="text-align:left; margin-bottom:8px;">
        <label style="font-weight:bold; color:#333; font-size:16px;">
          <i class="fas fa-tag"></i> หัวเรื่องประกาศ <span style="color:red;">*</span>
        </label>
      </div>
      <input
        id="announcementSubject"
        class="swal2-input"
        placeholder="เช่น: ตัดรอบเบิก 14:50 น., ระบบปิดปรับปรุง, หยุดทำการพรุ่งนี้"
        maxlength="120"
        style="font-size:16px; padding:12px;"
      >
      <!-- ช่องกรอกข้อความ -->
      <div style="text-align:left; margin:16px 0 8px;">
        <label style="font-weight:bold; color:#333; font-size:16px;">
          <i class="fas fa-align-left"></i> ข้อความประกาศ <span style="color:red;">*</span>
        </label>
      </div>
      <textarea
        id="announcementText"
        class="swal2-textarea"
        rows="6"
        placeholder="พิมพ์รายละเอียดประกาศที่นี่...&#10;(กด Enter เพื่อขึ้นบรรทัดใหม่)"
        style="font-size:16px; resize:vertical; min-height:160px;"
      ></textarea>
      <!-- ข้อความแจ้ง -->
      <div style="margin-top:16px; padding:14px; background:#e3f2fd; border-radius:12px; font-size:14px; color:#1565c0; text-align:center;">
        <i class="fas fa-info-circle"></i>
        ประกาศจะแสดงให้ทุกคนเห็นทันทีที่เปิดแอป และซ่อนอัตโนมัติหลัง 2 วัน
      </div>
    `,
    width: '700px',
    padding: '20px',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-paper-plane"></i> บันทึก',
    cancelButtonText: 'ยกเลิก',
    allowOutsideClick: false,
    allowEscapeKey: false,
    focusConfirm: false,
    customClass: {
      confirmButton: 'swal2-confirm-btn'
    },
    preConfirm: () => {
      const subject = document.getElementById('announcementSubject').value.trim();
      const message = document.getElementById('announcementText').value.trim();
      if (!subject) {
        Swal.showValidationMessage('<i class="fas fa-exclamation-triangle"></i> กรุณากรอกหัวเรื่องประกาศ');
        return false;
      }
      if (!message) {
        Swal.showValidationMessage('<i class="fas fa-exclamation-triangle"></i> กรุณากรอกข้อความประกาศ');
        return false;
      }
      return { subject, message };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { subject, message } = result.value;
      // แสดง Loading
      Swal.fire({
        title: 'กำลังบันทึกประกาศ...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      // ส่งไป GAS (เปลี่ยน URL เป็นของคุณ)
      apiFetch('/api/gas-announcement', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'action': 'updateAnnouncement',
          'subject': subject,
          'message': message
        })
      })
        .then(() => {
          Swal.fire({
            icon: 'success',
            title: 'บันทึกประกาศสำเร็จ!',
            html: `
            <div style="text-align:center;">
              <h3 style="color:#27ae60; margin:10px 0;">${subject}</h3>
              <p style="font-size:17px; color:#333;">ทุกคนจะเห็นประกาศนี้ทันทีที่เปิดแอป</p>
            </div>
          `,
            confirmButtonText: 'เสร็จสิ้น',
            timer: 4000,
            timerProgressBar: true
          });
        })
        .catch(err => {
          console.error('บันทึกประกาศล้มเหลว:', err);
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถบันทึกได้ กรุณาลองใหม่',
            confirmButtonText: 'ตกลง'
          });
        });
    }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  // Close modals by clicking 'X'
  closeModal.addEventListener('click', () => modal.style.display = 'none');
  closeModalAll.addEventListener('click', () => modalAll.style.display = 'none');
  closeModalPending.addEventListener('click', () => modalPending.style.display = 'none');
  ensurePartsImageDbColumn();

  // Close modals by clicking backdrop
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  modalAll.addEventListener('click', (e) => { if (e.target === modalAll) modalAll.style.display = 'none'; });
  modalPending.addEventListener('click', (e) => { if (e.target === modalPending) modalPending.style.display = 'none'; });
});
// ลบปุ่มออกจาก DOM ถาวรทันทีที่ติดตั้ง
window.addEventListener('appinstalled', () => {
  localStorage.setItem('partgo-installed', 'true');
  const btn = document.getElementById('install-btn');
  if (btn) {
    btn.remove(); // ลบออกเลย ไม่มีทางกลับมา
  }
  deferredPrompt = null;
});
// ป้องกันรีเฟรชแล้วปุ่มกลับมา
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('partgo-installed') === 'true') {
    const btn = document.getElementById('install-btn');
    if (btn) btn.remove();
  }
});
 setTimeout(() => {
    checkNewAnnouncements();
  }, 1000);
  
  // ตรวจสอบประกาศใหม่ทุก 5 นาที
  setInterval(() => {
    checkNewAnnouncements();
  }, 5 * 60 * 1000);
// Initial calls (now safe after all variables defined)
loadTheme();
checkLoginStatus();
syncTodayAdminActionsVisibility();
