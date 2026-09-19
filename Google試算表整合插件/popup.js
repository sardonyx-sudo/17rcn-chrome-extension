// popup.js - Google 試算表整合版

const STORAGE_KEYS = {
  gasUrl: 'rcn_gas_url',
  cachedItems: 'rcn_cached_items',
  cachedTime: 'rcn_cached_time',
  cachedSkippedItems: 'rcn_cached_skipped_items',
  currentIndex: 'rcn_current_index',
  defaultAddress: 'rcn_default_address',
  model: 'rcn_model',
  antiDoubleSubmit: 'rcn_anti_double_submit'
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 快取有效期限：5 分鐘

const GOODS_ADD_PATTERNS = ['17rcn.org/member/goods_add.php', '17rcn.org/goods/goods_add.php'];

// DOM 元素
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const notOnPageWarning = document.getElementById('notOnPageWarning');

const toggleGasConfig = document.getElementById('toggleGasConfig');
const configArrow = document.getElementById('configArrow');
const gasConfigBody = document.getElementById('gasConfigBody');
const gasUrlInput = document.getElementById('gasUrlInput');
const defaultAddressInput = document.getElementById('defaultAddressInput');
const modelSelect = document.getElementById('modelSelect');
const btnDetectModels = document.getElementById('btnDetectModels');
const antiDoubleSubmitInput = document.getElementById('antiDoubleSubmit');
const btnSaveGas = document.getElementById('btnSaveGas');

const failedNoticeBar = document.getElementById('failedNoticeBar');
const failedCountText = document.getElementById('failedCountText');
const btnReprocessAll = document.getElementById('btnReprocessAll');
const btnReprocessCurrent = document.getElementById('btnReprocessCurrent');

const queueCard = document.getElementById('queueCard');
const queuePosition = document.getElementById('queuePosition');
const btnRefreshQueue = document.getElementById('btnRefreshQueue');
const photoNotice = document.getElementById('photoNotice');
const photoTotalCount = document.getElementById('photoTotalCount');
const photoBox = document.getElementById('photoBox');
const itemTitle = document.getElementById('itemTitle');
const badgeCat = document.getElementById('badgeCat');
const badgeCond = document.getElementById('badgeCond');
const badgeQty = document.getElementById('badgeQty');
const badgePrice = document.getElementById('badgePrice');
const itemDesc = document.getElementById('itemDesc');
const metaUploader = document.getElementById('metaUploader');
const metaAddress = document.getElementById('metaAddress');

const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSkip = document.getElementById('btnSkip');
const btnDeleteItem = document.getElementById('btnDeleteItem');
const btnClearPublished = document.getElementById('btnClearPublished');
const btnClearSkipped = document.getElementById('btnClearSkipped');

const tabPending = document.getElementById('tabPending');
const tabSkipped = document.getElementById('tabSkipped');
const tabPendingCount = document.getElementById('tabPendingCount');
const tabSkippedCount = document.getElementById('tabSkippedCount');

const lockedNoticeBar = document.getElementById('lockedNoticeBar');
const btnUnlockCurrent = document.getElementById('btnUnlockCurrent');

const skippedView = document.getElementById('skippedView');
const skippedViewCount = document.getElementById('skippedViewCount');
const skippedList = document.getElementById('skippedList');
const emptySkipped = document.getElementById('emptySkipped');
const btnRefreshSkipped = document.getElementById('btnRefreshSkipped');

const emptyState = document.getElementById('emptyState');
const btnEmptySync = document.getElementById('btnEmptySync');

const btnFill = document.getElementById('btnFill');
const fillBtnIcon = document.getElementById('fillBtnIcon');
const fillBtnText = document.getElementById('fillBtnText');
const statusMsg = document.getElementById('statusMsg');

// 狀態變數
let gasUrl = '';
let defaultAddress = '';
let selectedModel = 'auto';
let items = [];
let skippedItems = [];
let currentIndex = 0;
let isOnTargetPage = false;
let currentActiveTab = 'pending';
let lastLockedRow = null;

// ───────────────────────────────────────────────
// 初始化流程 (支援本機暫存秒開 SWR)
// ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 載入儲存的設定與快取
  const saved = await chrome.storage.local.get([
    STORAGE_KEYS.gasUrl,
    STORAGE_KEYS.currentIndex,
    STORAGE_KEYS.defaultAddress,
    STORAGE_KEYS.model,
    STORAGE_KEYS.antiDoubleSubmit,
    STORAGE_KEYS.cachedItems,
    STORAGE_KEYS.cachedTime,
    STORAGE_KEYS.cachedSkippedItems
  ]);
  
  if (saved[STORAGE_KEYS.gasUrl]) {
    gasUrl = saved[STORAGE_KEYS.gasUrl];
    gasUrlInput.value = gasUrl;
  }
  if (saved[STORAGE_KEYS.defaultAddress]) {
    defaultAddress = saved[STORAGE_KEYS.defaultAddress];
    if (defaultAddressInput) defaultAddressInput.value = defaultAddress;
  }
  if (saved[STORAGE_KEYS.model]) {
    selectedModel = saved[STORAGE_KEYS.model];
    if (modelSelect) {
      // 若該 option 存在則選中，否則暫時新增 option
      let exists = false;
      for (const opt of modelSelect.options) {
        if (opt.value === selectedModel) {
          exists = true;
          break;
        }
      }
      if (!exists && selectedModel !== 'auto') {
        const opt = document.createElement('option');
        opt.value = selectedModel;
        opt.textContent = selectedModel;
        modelSelect.appendChild(opt);
      }
      modelSelect.value = selectedModel;
    }
  }
  if (antiDoubleSubmitInput) {
    antiDoubleSubmitInput.checked = saved[STORAGE_KEYS.antiDoubleSubmit] !== false;
  }
  if (typeof saved[STORAGE_KEYS.currentIndex] === 'number') {
    currentIndex = saved[STORAGE_KEYS.currentIndex];
  }

  // 載入本地快取資料（若有，立即秒開畫面）
  let hasValidCache = false;
  const cachedItems = saved[STORAGE_KEYS.cachedItems];
  const cachedTime = saved[STORAGE_KEYS.cachedTime] || 0;
  const cachedSkipped = saved[STORAGE_KEYS.cachedSkippedItems];

  if (Array.isArray(cachedItems)) {
    items = cachedItems;
    if (tabPendingCount) tabPendingCount.textContent = items.length;
    if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);

    if (Array.isArray(cachedSkipped)) {
      skippedItems = cachedSkipped;
      if (tabSkippedCount) tabSkippedCount.textContent = skippedItems.length;
      if (skippedViewCount) skippedViewCount.textContent = skippedItems.length;
    }

    if (items.length > 0) {
      showEmptyState(false);
      renderCurrentItem();
      setConnectionStatus('online', '已連線 (快取)');
      showGasConfig(false);
    }

    const elapsed = Date.now() - cachedTime;
    if (elapsed < CACHE_TTL_MS) {
      hasValidCache = true;
    }
  }

  // 2. 檢查頁面
  await checkCurrentPage();

  // 3. 連線檢查與資料同步
  if (gasUrl) {
    if (hasValidCache) {
      // 5分鐘快取有效：背景靜默同步（不干擾志工操作），若雲端有變動才無感更新
      refreshQueue({ silent: true }).catch(() => {});
    } else {
      // 無快取或快取過期：正常連線並載入
      testConnectionAndFetch();
    }
  } else {
    // 未設定，展開設定卡片
    showGasConfig(true);
    setConnectionStatus('offline', '未設定');
    showEmptyState(true, '請先貼上 Google Apps Script 網頁應用程式網址');
  }
});

// ───────────────────────────────────────────────
// 頁面檢查
// ───────────────────────────────────────────────
async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    isOnTargetPage = tab && tab.url && GOODS_ADD_PATTERNS.some(p => tab.url.includes(p));

    if (!isOnTargetPage) {
      notOnPageWarning.style.display = 'block';
      btnFill.disabled = true;
    } else {
      notOnPageWarning.style.display = 'none';
      if (items.length > 0) btnFill.disabled = false;
    }
  } catch (e) {
    isOnTargetPage = false;
  }
}

// ───────────────────────────────────────────────
// GAS 設定與連線
// ───────────────────────────────────────────────
toggleGasConfig.addEventListener('click', () => {
  const isShown = gasConfigBody.classList.contains('show');
  showGasConfig(!isShown);
});

function showGasConfig(show) {
  if (show) {
    gasConfigBody.classList.add('show');
    configArrow.textContent = '▲';
  } else {
    gasConfigBody.classList.remove('show');
    configArrow.textContent = '▼';
  }
}

defaultAddressInput.addEventListener('input', () => {
  defaultAddress = defaultAddressInput.value.trim();
  chrome.storage.local.set({ [STORAGE_KEYS.defaultAddress]: defaultAddress });
});

if (modelSelect) {
  modelSelect.addEventListener('change', () => {
    selectedModel = modelSelect.value;
    chrome.storage.local.set({ [STORAGE_KEYS.model]: selectedModel });
  });
}

if (antiDoubleSubmitInput) {
  antiDoubleSubmitInput.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.antiDoubleSubmit]: antiDoubleSubmitInput.checked });
  });
}

if (btnDetectModels) {
  btnDetectModels.addEventListener('click', async () => {
    if (!gasUrl) {
      showStatus('error', '請先輸入並儲存 GAS 應用程式網址');
      return;
    }

    btnDetectModels.textContent = '⏳ 查詢中...';
    btnDetectModels.disabled = true;
    showStatus('info', '正在透過 GAS 向 Google 查詢最新可用 Flash 模型清單...');

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'getModels'
      });

      if (resp.success && resp.data && Array.isArray(resp.data.models) && resp.data.models.length > 0) {
        const availableModels = resp.data.models;
        const currentVal = modelSelect.value;

        // 重建下拉選單
        modelSelect.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'auto';
        defaultOpt.textContent = '✨ 自動選擇最新 Flash (推薦)';
        modelSelect.appendChild(defaultOpt);

        availableModels.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelSelect.appendChild(opt);
        });

        // 恢復原先選取（若仍存在）
        if (currentVal && availableModels.includes(currentVal)) {
          modelSelect.value = currentVal;
        } else {
          modelSelect.value = 'auto';
        }
        selectedModel = modelSelect.value;
        chrome.storage.local.set({ [STORAGE_KEYS.model]: selectedModel });

        showStatus('success', `🎉 成功偵測到 ${availableModels.length} 個可用 Flash 模型！已更新選單。`);
      } else {
        throw new Error(resp.data?.error || resp.error || '未取得模型清單');
      }
    } catch (err) {
      showStatus('error', `偵測可用模型失敗：${err.message}`);
    } finally {
      btnDetectModels.textContent = '🔄 偵測可用模型';
      btnDetectModels.disabled = false;
    }
  });
}

btnSaveGas.addEventListener('click', async () => {
  const inputVal = gasUrlInput.value.trim();
  if (!inputVal) {
    showStatus('error', '請輸入有效的 Apps Script 網址');
    return;
  }
  gasUrl = inputVal;
  await chrome.storage.local.set({ [STORAGE_KEYS.gasUrl]: gasUrl });
  showStatus('info', '已儲存設定，正在測試連線...');
  await testConnectionAndFetch();
});

async function testConnectionAndFetch() {
  setConnectionStatus('checking', '連線中...');
  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'ping'
    });

    if (resp.success) {
      setConnectionStatus('online', '已連線');
      showGasConfig(false); // 自動折疊設定區
      await refreshQueue();
    } else {
      throw new Error(resp.error || '連線無回應');
    }
  } catch (err) {
    setConnectionStatus('offline', '連線失敗');
    showStatus('error', `無法連線至試算表：${err.message}`);
    showGasConfig(true);
  }
}

function setConnectionStatus(state, label) {
  statusDot.className = 'status-dot';
  if (state === 'online') statusDot.classList.add('online');
  else if (state === 'offline') statusDot.classList.add('offline');
  statusLabel.textContent = label;
}

// ───────────────────────────────────────────────
// 物資佇列同步與渲染
// ───────────────────────────────────────────────
btnRefreshQueue.addEventListener('click', () => refreshQueue({ force: true }));
btnEmptySync.addEventListener('click', () => refreshQueue({ force: true }));

// 一鍵由雲端重新辨識所有失敗項目
btnReprocessAll.addEventListener('click', async () => {
  btnReprocessAll.textContent = '⏳ 雲端辨識中...';
  btnReprocessAll.disabled = true;
  const currentModelChoice = modelSelect ? modelSelect.value : 'auto';
  showStatus('info', `正在由 Google 雲端以模型 [${currentModelChoice === 'auto' ? '最新 Flash' : currentModelChoice}] 重新補跑辨識，請稍候（約需 10~20 秒）...`);

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'reprocessAll',
      apiParams: { model: currentModelChoice }
    });

    if (resp.success) {
      showStatus('success', `🎉 ${resp.data.message || '重試辨識完成！'}`);
      await refreshQueue();
    } else {
      throw new Error(resp.error || '重新辨識出錯');
    }
  } catch (err) {
    showStatus('error', `重新辨識失敗：${err.message}`);
  } finally {
    btnReprocessAll.textContent = '🔄 雲端重新辨識';
    btnReprocessAll.disabled = false;
  }
});

// 重新辨識目前這筆物資
btnReprocessCurrent.addEventListener('click', async () => {
  if (items.length === 0 || !items[currentIndex]) return;
  const currentItem = items[currentIndex];
  const currentModelChoice = modelSelect ? modelSelect.value : 'auto';

  btnReprocessCurrent.textContent = '⏳ 辨識中...';
  btnReprocessCurrent.disabled = true;
  showStatus('info', `正在由雲端以模型 [${currentModelChoice === 'auto' ? '最新 Flash' : currentModelChoice}] 重新辨識第 ${currentItem.row} 列物資...`);

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'reprocessRow',
      apiParams: { row: currentItem.row, model: currentModelChoice }
    });

    if (resp.success) {
      showStatus('success', `🎉 第 ${currentItem.row} 列物資已重新辨識完成！`);
      await refreshQueue();
    } else {
      throw new Error(resp.error || '重新辨識出錯');
    }
  } catch (err) {
    showStatus('error', `重新辨識失敗：${err.message}`);
  } finally {
    btnReprocessCurrent.textContent = '🔄 重辨此筆';
    btnReprocessCurrent.disabled = false;
  }
});

// ───────────────────────────────────────────────
// 刪除與空間維護
// ───────────────────────────────────────────────

// 刪除單筆物資（刪除試算表列並刪除關聯 Google Drive 照片）
btnDeleteItem.addEventListener('click', async () => {
  if (items.length === 0 || !items[currentIndex]) return;
  const currentItem = items[currentIndex];

  if (currentItem.status === '刊登中') {
    showStatus('error', '⚠️ 此物資正在刊登中（已鎖定），無法刪除！若要刪除請先解除鎖定或略過。');
    return;
  }

  const confirmMsg = `確定要永久刪除此筆物資（品名：${currentItem.title || '無品名'}，第 ${currentItem.row} 列）嗎？\n\n⚠️ 此操作將同時把 Google Drive 中的照片移至垃圾桶以釋放 1GB 表單空間，且無法復原！`;
  if (!confirm(confirmMsg)) return;

  btnDeleteItem.textContent = '⏳ 刪除中...';
  btnDeleteItem.disabled = true;
  showStatus('info', `正在刪除第 ${currentItem.row} 列物資及雲端照片...`);

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'deleteItem',
      apiParams: { row: currentItem.row }
    });

    if (resp.success && resp.data && resp.data.success) {
      showStatus('success', `✅ ${resp.data.message || '物資已成功刪除！'}`);
      // 從本機清單移除
      items.splice(currentIndex, 1);
      if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);
      saveCachedItems();
      if (items.length === 0) {
        showEmptyState(true);
      } else {
        renderCurrentItem();
      }
      // 延遲刷新一次試算表，校正後續 row 列號
      setTimeout(() => refreshQueue(), 1200);
    } else {
      throw new Error(resp.data?.error || resp.error || '刪除失敗');
    }
  } catch (err) {
    showStatus('error', `刪除失敗：${err.message}`);
  } finally {
    btnDeleteItem.textContent = '🗑️ 刪除';
    btnDeleteItem.disabled = false;
  }
});

// 清理所有「已刊登」物資與照片（釋放 1GB 空間）
btnClearPublished.addEventListener('click', async () => {
  const confirmMsg = '確定要清除 Google 試算表中所有「已刊登」的物資嗎？\n\n⚠️ 此操作會將所有已刊登物資的資料列刪除，並將 Google Drive 照片移至垃圾桶，立即釋放 Google Form 1GB 上傳空間！';
  if (!confirm(confirmMsg)) return;

  btnClearPublished.textContent = '⏳ 清理中...';
  btnClearPublished.disabled = true;
  showStatus('info', '正在清理已刊登物資及 Google Drive 照片，請稍候...');

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'cleanupPublished'
    });

    if (resp.success && resp.data && resp.data.success) {
      showStatus('success', `🎉 ${resp.data.message || '清理完成！'}`);
      await refreshQueue();
    } else {
      throw new Error(resp.data?.error || resp.error || '清理失敗');
    }
  } catch (err) {
    showStatus('error', `清理失敗：${err.message}`);
  } finally {
    btnClearPublished.textContent = '清理已刊登';
    btnClearPublished.disabled = false;
  }
});

// 清理所有「已略過」物資與照片（釋放 1GB 空間）
if (btnClearSkipped) {
  btnClearSkipped.addEventListener('click', async () => {
    const confirmMsg = '確定要清除 Google 試算表中所有「已略過」的物資嗎？\n\n⚠️ 此操作會將所有標記為略過的資料列刪除，並將 Google Drive 照片移至垃圾桶，立即釋放 Google Form 1GB 上傳空間！';
    if (!confirm(confirmMsg)) return;

    btnClearSkipped.textContent = '⏳ 清理中...';
    btnClearSkipped.disabled = true;
    showStatus('info', '正在清理已略過物資及 Google Drive 照片，請稍候...');

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'cleanupSkipped'
      });

      if (resp.success && resp.data && resp.data.success) {
        showStatus('success', `🎉 ${resp.data.message || '已略過物資清理完成！'}`);
        await refreshQueue();
        if (currentActiveTab === 'skipped') {
          await loadSkippedItems();
        }
      } else {
        throw new Error(resp.data?.error || resp.error || '清理失敗');
      }
    } catch (err) {
      showStatus('error', `清理失敗：${err.message}`);
    } finally {
      btnClearSkipped.textContent = '清理已略過';
      btnClearSkipped.disabled = false;
    }
  });
}

// ───────────────────────────────────────────────
// 頁籤切換與已略過清單管理
// ───────────────────────────────────────────────
if (tabPending) {
  tabPending.addEventListener('click', () => switchTab('pending'));
}
if (tabSkipped) {
  tabSkipped.addEventListener('click', () => switchTab('skipped'));
}
if (btnRefreshSkipped) {
  btnRefreshSkipped.addEventListener('click', () => loadSkippedItems());
}

function switchTab(tab) {
  currentActiveTab = tab;
  if (tab === 'pending') {
    tabPending.classList.add('active');
    tabSkipped.classList.remove('active');
    skippedView.style.display = 'none';
    if (items.length > 0) {
      queueCard.style.display = 'flex';
      emptyState.classList.remove('show');
      btnFill.style.display = 'flex';
    } else {
      queueCard.style.display = 'none';
      emptyState.classList.add('show');
      btnFill.style.display = 'none';
    }
  } else {
    tabSkipped.classList.add('active');
    tabPending.classList.remove('active');
    queueCard.style.display = 'none';
    emptyState.classList.remove('show');
    btnFill.style.display = 'none';
    skippedView.style.display = 'flex';
    loadSkippedItems();
  }
}

// ───────────────────────────────────────────────
// 本地暫存輔助函式
// ───────────────────────────────────────────────
function saveCachedItems() {
  chrome.storage.local.set({
    [STORAGE_KEYS.cachedItems]: items,
    [STORAGE_KEYS.cachedTime]: Date.now()
  });
}

function saveCachedSkippedItems() {
  chrome.storage.local.set({
    [STORAGE_KEYS.cachedSkippedItems]: skippedItems
  });
}

async function loadSkippedItems() {
  if (!gasUrl) return;
  skippedList.innerHTML = '<div style="text-align:center; color:#a0aec0; padding:15px; font-size:11px;">載入已略過清單中...</div>';
  emptySkipped.style.display = 'none';

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'getSkippedItems'
    });

    if (resp.success && resp.data && Array.isArray(resp.data.items)) {
      skippedItems = resp.data.items;
      saveCachedSkippedItems();
      tabSkippedCount.textContent = skippedItems.length;
      skippedViewCount.textContent = skippedItems.length;
      renderSkippedList();
    } else {
      throw new Error(resp.data?.error || resp.error || '無法取得已略過清單');
    }
  } catch (err) {
    skippedList.innerHTML = `<div style="color:#e53e3e; font-size:11px; padding:10px;">取得失敗：${err.message}</div>`;
  }
}

function renderSkippedList() {
  skippedList.innerHTML = '';
  if (skippedItems.length === 0) {
    emptySkipped.style.display = 'block';
    return;
  }
  emptySkipped.style.display = 'none';

  skippedItems.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'skipped-item-card';

    const info = document.createElement('div');
    info.className = 'skipped-item-info';

    const title = document.createElement('div');
    title.className = 'skipped-item-title';
    title.textContent = `${index + 1}. ${item.title || '（無品名）'}`;

    const meta = document.createElement('div');
    meta.className = 'skipped-item-meta';
    const cat = item.category2_name ? `${item.category1_name || ''} > ${item.category2_name}` : (item.category1_name || '未分類');
    meta.textContent = `列: ${item.row} | ${cat} | 志工: ${item.uploader || '匿名'}`;

    info.appendChild(title);
    info.appendChild(meta);

    const btnRestore = document.createElement('button');
    btnRestore.className = 'btn-restore';
    btnRestore.textContent = '↩️ 恢復為待刊登';
    btnRestore.onclick = async () => {
      btnRestore.textContent = '⏳ 處理中...';
      btnRestore.disabled = true;
      try {
        const resp = await chrome.runtime.sendMessage({
          action: 'call_gas',
          gasUrl: gasUrl,
          apiAction: 'restoreItem',
          payload: { row: item.row }
        });
        if (resp.success && resp.data && resp.data.success) {
          showStatus('success', `✅ 已將「${item.title || '此物資'}」恢復為待刊登！`);
          await refreshQueue();
          await loadSkippedItems();
        } else {
          throw new Error(resp.data?.error || resp.error || '恢復失敗');
        }
      } catch (err) {
        showStatus('error', `恢復失敗：${err.message}`);
        btnRestore.textContent = '↩️ 恢復為待刊登';
        btnRestore.disabled = false;
      }
    };

    card.appendChild(info);
    card.appendChild(btnRestore);
    skippedList.appendChild(card);
  });
}

async function refreshQueue(options = {}) {
  const isSilent = options.silent === true;
  if (!isSilent) {
    showStatus('info', '正在從 Google 試算表同步物資...');
  }

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'getItems'
    });

    if (resp.success && resp.data && Array.isArray(resp.data.items)) {
      items = resp.data.items;
      const failedCount = resp.data.failedCount || 0;

      // 寫入本地暫存與更新連線指示
      saveCachedItems();
      setConnectionStatus('online', '已連線');

      // 更新頁籤數字
      if (tabPendingCount) tabPendingCount.textContent = items.length;

      // 失敗通知條狀態更新
      if (failedCount > 0) {
        failedNoticeBar.style.display = 'block';
        failedCountText.textContent = failedCount;
      } else {
        failedNoticeBar.style.display = 'none';
      }

      if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);
      
      if (items.length === 0) {
        showEmptyState(true);
        if (!isSilent) {
          if (failedCount > 0) {
            showStatus('info', `目前無待刊登物資，但發現有 ${failedCount} 筆辨識失敗，可點擊上方按鈕重試。`);
          } else {
            showStatus('info', '目前試算表中沒有待刊登物資。');
          }
        }
      } else {
        showEmptyState(false);
        renderCurrentItem();
        if (!isSilent) {
          showStatus('success', `成功同步！共有 ${items.length} 筆待刊物資${failedCount > 0 ? ` (另有 ${failedCount} 筆待重辨)` : ''}。`);
        }
      }

      // 背景同步略過筆數並寫入快取
      chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'getSkippedItems'
      }).then(res => {
        if (res && res.success && res.data && Array.isArray(res.data.items)) {
          skippedItems = res.data.items;
          saveCachedSkippedItems();
          if (tabSkippedCount) tabSkippedCount.textContent = res.data.items.length;
          if (skippedViewCount) skippedViewCount.textContent = res.data.items.length;
        }
      }).catch(() => {});

    } else {
      throw new Error(resp.error || '無法取得清單');
    }
  } catch (err) {
    if (!isSilent) {
      showStatus('error', `同步失敗：${err.message}`);
    }
  }
}

function showEmptyState(isEmpty, customMsg) {
  if (isEmpty) {
    queueCard.style.display = 'none';
    emptyState.classList.add('show');
    btnFill.disabled = true;
    if (customMsg) {
      emptyState.querySelector('p').textContent = customMsg;
    }
  } else {
    if (currentActiveTab === 'pending') {
      queueCard.style.display = 'flex';
      emptyState.classList.remove('show');
      if (isOnTargetPage) btnFill.disabled = false;
    }
  }
}

function renderCurrentItem() {
  if (items.length === 0 || !items[currentIndex]) return;
  const item = items[currentIndex];

  // 1. 佇列位置
  queuePosition.textContent = `待刊物資 (${items.length} 筆) - [${currentIndex + 1}/${items.length}]`;

  // 鎖定狀態指示條
  if (lockedNoticeBar) {
    if (item.status === '刊登中') {
      lockedNoticeBar.style.display = 'flex';
    } else {
      lockedNoticeBar.style.display = 'none';
    }
  }

  // 超過 3 張照片的提示
  if (item.photos && item.photos.length > 3) {
    photoNotice.style.display = 'block';
    photoTotalCount.textContent = item.photos.length;
  } else {
    photoNotice.style.display = 'none';
  }

  // 2. 照片縮圖 (最多展示，前 3 張加上精緻標記)
  photoBox.innerHTML = '';
  if (item.photos && item.photos.length > 0) {
    item.photos.forEach((p, idx) => {
      const img = document.createElement('img');
      img.className = 'photo-thumb';
      img.src = p.thumbnailUrl || p.originalUrl;
      img.title = idx < 3 ? `第 ${idx + 1} 張 (將刊登)` : `第 ${idx + 1} 張 (超出上限未選)`;
      if (idx >= 3) {
        img.style.opacity = '0.4';
      }
      img.onerror = () => {
        img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23ccc"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
      };
      photoBox.appendChild(img);
    });
  } else {
    const noPhotoDiv = document.createElement('div');
    noPhotoDiv.className = 'no-photo';
    noPhotoDiv.textContent = '無照片檔案';
    photoBox.appendChild(noPhotoDiv);
  }

  // 3. 標題與標籤
  itemTitle.textContent = item.title || '（無品名）';
  badgeCat.textContent = item.category2_name ? `${item.category1_name || ''} > ${item.category2_name}` : (item.category1_name || '未分類');
  
  const isNew = String(item.condition).toLowerCase() === 'new';
  badgeCond.className = isNew ? 'badge badge-cond-new' : 'badge badge-cond-used';
  badgeCond.textContent = isNew ? '全新' : '二手';

  badgeQty.textContent = `數量: ${item.quantity || 1}`;
  badgePrice.textContent = item.price ? `NT$ ${item.price}` : '免費贈送';

  // 4. 說明
  itemDesc.textContent = item.description || '（無詳細說明）';

  // 5. 中繼資訊
  metaUploader.textContent = `志工: ${item.uploader || '匿名志工'}`;
  metaAddress.textContent = `地址: ${item.address || '使用預設地址'}`;

  // 6. 按鈕狀態
  btnPrev.disabled = currentIndex === 0;
  btnNext.disabled = currentIndex === items.length - 1;

  // 記住 index
  chrome.storage.local.set({ [STORAGE_KEYS.currentIndex]: currentIndex });
}

// 解除當前物資之鎖定
if (btnUnlockCurrent) {
  btnUnlockCurrent.addEventListener('click', async () => {
    const item = items[currentIndex];
    if (!item || !item.row) return;

    btnUnlockCurrent.textContent = '⏳ 解鎖中...';
    btnUnlockCurrent.disabled = true;
    showStatus('info', `正在向雲端解除第 ${item.row} 列物資的鎖定...`);

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'unlockItem',
        payload: { row: item.row }
      });

      if (resp.success && resp.data && resp.data.success) {
        item.status = '待刊登';
        if (lastLockedRow === item.row) lastLockedRow = null;
        saveCachedItems();
        renderCurrentItem();
        showStatus('success', `✅ 已成功解除「${item.title || '此物資'}」的鎖定！`);
      } else {
        throw new Error(resp.data?.error || resp.error || '解除鎖定失敗');
      }
    } catch (err) {
      showStatus('error', `解除鎖定失敗：${err.message}`);
    } finally {
      btnUnlockCurrent.textContent = '🔓 解除鎖定';
      btnUnlockCurrent.disabled = false;
    }
  });
}

// ───────────────────────────────────────────────
// 導航控制 (Prev / Next / Skip)
// ───────────────────────────────────────────────
btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentItem();
  }
});

btnNext.addEventListener('click', () => {
  if (currentIndex < items.length - 1) {
    currentIndex++;
    renderCurrentItem();
  }
});

btnSkip.addEventListener('click', async () => {
  const item = items[currentIndex];
  if (!item || !item.row) return;

  if (!confirm(`確定要略過「${item.title || '此物資'}」嗎？`)) return;

  showStatus('info', '正在將該筆標記為略過...');
  try {
    await chrome.runtime.sendMessage({
      action: 'call_gas',
      gasUrl: gasUrl,
      apiAction: 'markSkipped',
      payload: { row: item.row }
    });
    
    // 從待刊清單移除
    items.splice(currentIndex, 1);
    saveCachedItems();
    if (tabPendingCount) tabPendingCount.textContent = items.length;
    if (tabSkippedCount) tabSkippedCount.textContent = (parseInt(tabSkippedCount.textContent, 10) || 0) + 1;

    if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1);

    if (items.length === 0) {
      showEmptyState(true);
    } else {
      renderCurrentItem();
    }
    showStatus('success', '已略過該筆物資。');
  } catch (err) {
    showStatus('error', `操作失敗：${err.message}`);
  }
});

// ───────────────────────────────────────────────
// 一鍵帶入與自動注入照片
// ───────────────────────────────────────────────
btnFill.addEventListener('click', async () => {
  const item = items[currentIndex];
  if (!item) return;

  if (!isOnTargetPage) {
    showStatus('error', '請先前往扶輪公益網刊登頁面！');
    return;
  }

  setFillingState(true);
  showStatus('info', '正在從 Google 雲端下載物資照片...');

  try {
    // 換筆自動解鎖：若先前由本客戶端鎖定了其他列，主動向 GAS 解鎖上一筆
    if (lastLockedRow && lastLockedRow !== item.row) {
      chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'unlockItem',
        payload: { row: lastLockedRow }
      });
      console.log(`[Popup] 換筆填寫，已解鎖前一筆第 ${lastLockedRow} 列`);
      lastLockedRow = null;
    }

    // 1. 下載照片 (最多 3 張)
    const downloadedImages = [];
    if (item.photos && item.photos.length > 0) {
      const photosToFetch = item.photos.slice(0, 3);
      for (let i = 0; i < photosToFetch.length; i++) {
        showStatus('info', `正在下載第 ${i + 1}/${photosToFetch.length} 張照片...`);
        const p = photosToFetch[i];
        const imgResp = await chrome.runtime.sendMessage({
          action: 'fetch_remote_image',
          photo: p,
          gasUrl: gasUrl
        });
        if (imgResp.success && imgResp.data) {
          downloadedImages.push(imgResp.data);
        }
      }
    }

    // 2. 鎖定試算表狀態為「刊登中」
    if (item.row) {
      const lockResp = await chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: gasUrl,
        apiAction: 'lockItem',
        payload: { row: item.row }
      });

      if (lockResp && lockResp.success && lockResp.data && lockResp.data.success) {
        lastLockedRow = item.row;
        item.status = '刊登中';
        saveCachedItems();
        renderCurrentItem();
      } else {
        showStatus('error', '⚠️ 該物資已被其他同仁鎖定或狀態已變更，正在重新同步最新佇列...');
        await refreshQueue();
        return;
      }
    }

    // 3. 發送給 content.js 填寫與注入
    showStatus('info', '正在自動填寫表單與掛載照片...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const fillResp = await chrome.tabs.sendMessage(tab.id, {
      action: 'fill_sheet_item',
      item: item,
      images: downloadedImages,
      gasUrl: gasUrl,
      defaultAddress: defaultAddress
    });

    if (fillResp && fillResp.success) {
      showStatus('success', `✅ 已成功帶入「${item.title}」與 ${downloadedImages.length} 張照片！請確認後輸入驗證碼刊登。`);
    } else {
      throw new Error(fillResp?.error || '填表過程異常');
    }

  } catch (err) {
    showStatus('error', `自動帶入失敗：${err.message}`);
  } finally {
    setFillingState(false);
  }
});

function setFillingState(isFilling) {
  if (isFilling) {
    btnFill.disabled = true;
    fillBtnIcon.textContent = '⏳';
    fillBtnText.textContent = '處理中...';
  } else {
    btnFill.disabled = !isOnTargetPage || items.length === 0;
    fillBtnIcon.textContent = '🚀';
    fillBtnText.textContent = '一鍵帶入此筆物資 (含照片)';
  }
}

function showStatus(type, msg) {
  statusMsg.className = `status-msg ${type}`;
  statusMsg.textContent = msg;
}
