// background.js - Service Worker
// 負責 GAS Web App 溝通、跨網域下載 Google Drive 圖片，繞過網頁端 CSP 限制

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. 與 GAS API 溝通
  if (message.action === 'call_gas') {
    const payload = message.payload || message.apiParams || {};
    callGasApi(message.gasUrl, message.apiAction, payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  // 2. 下載遠端照片（直連下載 + GAS 備援）
  if (message.action === 'fetch_remote_image') {
    fetchRemoteImage(message.photo, message.gasUrl)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  // 3. 接收來自 content.js 的刊登成功通知
  if (message.action === 'item_published_success') {
    handlePublishedSuccess(message.row, message.gasUrl)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

/**
 * 呼叫 Google Apps Script Web App API
 */
async function callGasApi(gasUrl, apiAction, payload = {}) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App 網址');

  // 清理 URL
  const cleanUrl = gasUrl.trim();
  
  if (apiAction === 'ping' || apiAction === 'getItems' || apiAction === 'getModels' || apiAction === 'getSkippedItems') {
    const url = new URL(cleanUrl);
    url.searchParams.set('action', apiAction);
    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error(`GAS 伺服器回應 HTTP ${resp.status}`);
    return await resp.json();
  }

  // POST 請求（lockItem, markPublished, markSkipped, unlockItem）
  const bodyData = { action: apiAction, ...payload };
  const resp = await fetch(cleanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS 接收 POST 最相容之格式
    body: JSON.stringify(bodyData)
  });

  if (!resp.ok) throw new Error(`GAS 伺服器回應 HTTP ${resp.status}`);
  return await resp.json();
}

// ───────────────────────────────────────────────
// 圖片記憶體快取池（按需快取，避免重複下載）
// ───────────────────────────────────────────────
const imageCache = new Map();
const MAX_CACHED_IMAGES = 15;

function getCachedImage(key) {
  if (!key) return null;
  if (imageCache.has(key)) {
    const entry = imageCache.get(key);
    imageCache.delete(key);
    imageCache.set(key, entry); // 更新為最新使用 (LRU)
    console.log(`[Background] 命中圖片記憶體快取: ${key}`);
    return entry;
  }
  return null;
}

function setCachedImage(key, data) {
  if (!key || !data) return;
  if (imageCache.has(key)) {
    imageCache.delete(key);
  } else if (imageCache.size >= MAX_CACHED_IMAGES) {
    const oldestKey = imageCache.keys().next().value;
    imageCache.delete(oldestKey);
  }
  imageCache.set(key, data);
}

/**
 * 下載遠端照片為 Base64 (具備快取與雙軌保險機制)
 */
async function fetchRemoteImage(photo, gasUrl) {
  const cacheKey = photo.fileId || photo.downloadUrl || photo.originalUrl;
  const cached = getCachedImage(cacheKey);
  if (cached) {
    return cached;
  }

  const downloadUrl = photo.downloadUrl || photo.originalUrl;

  // 策略 1：嘗試直接下載
  try {
    const resp = await fetch(downloadUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob && blob.size > 0 && blob.type.startsWith('image/')) {
        const base64 = await blobToBase64(blob);
        const imgData = {
          base64: base64,
          mimeType: blob.type || 'image/jpeg',
          filename: `goods_${photo.fileId || Date.now()}.jpg`
        };
        setCachedImage(cacheKey, imgData);
        return imgData;
      }
    }
  } catch (directErr) {
    console.warn('直連下載失敗，嘗試透過 GAS 代理下載:', directErr.message);
  }

  // 策略 2：若直連被 Google 阻擋或跳轉，改由 GAS 後端直接讀取 DriveApp 並回傳 Base64
  if (photo.fileId && gasUrl) {
    try {
      const proxyResult = await callGasApi(gasUrl, 'getImageBase64', { fileId: photo.fileId });
      if (proxyResult && proxyResult.success && proxyResult.base64) {
        const imgData = {
          base64: proxyResult.base64,
          mimeType: proxyResult.mimeType || 'image/jpeg',
          filename: proxyResult.filename || `goods_${photo.fileId}.jpg`
        };
        setCachedImage(cacheKey, imgData);
        return imgData;
      }
    } catch (proxyErr) {
      console.error('GAS 代理下載亦失敗:', proxyErr.message);
    }
  }

  throw new Error(`無法下載照片 (${photo.fileId || downloadUrl})`);
}

/**
 * 將 Blob 轉為 Base64 字串
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 處理刊登成功回寫
 */
async function handlePublishedSuccess(row, gasUrl) {
  if (!row || !gasUrl) return null;
  return await callGasApi(gasUrl, 'markPublished', { row: row });
}
