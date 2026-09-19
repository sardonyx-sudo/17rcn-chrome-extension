const toggleConfig = document.getElementById('toggleConfig');
const configBody = document.getElementById('configBody');
const configArrow = document.getElementById('configArrow');

const apiKeyInput = document.getElementById('apiKey');
const addressInput = document.getElementById('address');
const togglePwBtn = document.getElementById('togglePw');
const modelSelect = document.getElementById('modelSelect');
const customModelInput = document.getElementById('customModel');
const btnRefreshModels = document.getElementById('btnRefreshModels');
const modelHint = document.getElementById('modelHint');
const btnFill = document.getElementById('btnFill');
const btnIcon = document.getElementById('btnIcon');
const btnText = document.getElementById('btnText');
const statusDiv = document.getElementById('status');
const notOnPageDiv = document.getElementById('notOnPage');
const historyList = document.getElementById('historyList');
const btnClearHistory = document.getElementById('btnClearHistory');

const STORAGE_KEYS = {
  apiKey: 'rcn_api_key',
  address: 'rcn_address',
  history: 'rcn_history',
  antiDoubleSubmit: 'rcn_anti_double_submit',
  modelChoice: 'rcn_model_choice',
  customModel: 'rcn_custom_model',
  availableModels: 'rcn_available_models'
};
const GOODS_ADD_PATTERNS = ['17rcn.org/member/goods_add.php', '17rcn.org/goods/goods_add.php'];

const antiDoubleSubmitInput = document.getElementById('antiDoubleSubmit');

// ────────────────────────────────
// 初始化：載入儲存的設定
// ────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const saved = await chrome.storage.local.get([
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.address,
    STORAGE_KEYS.antiDoubleSubmit,
    STORAGE_KEYS.modelChoice,
    STORAGE_KEYS.customModel,
    STORAGE_KEYS.availableModels
  ]);

  if (saved[STORAGE_KEYS.apiKey]) apiKeyInput.value = saved[STORAGE_KEYS.apiKey];
  if (saved[STORAGE_KEYS.address]) addressInput.value = saved[STORAGE_KEYS.address];
  if (saved[STORAGE_KEYS.customModel]) customModelInput.value = saved[STORAGE_KEYS.customModel];

  // 若未設定 API Key 自動展開卡片引導輸入；已設定則預設折疊保持版面極致簡潔
  if (!saved[STORAGE_KEYS.apiKey]) {
    showConfig(true);
  } else {
    showConfig(false);
  }

  // 渲染模型選單
  const models = saved[STORAGE_KEYS.availableModels] || ['gemini-3.6-flash', 'gemini-3.5-flash'];
  renderModelSelect(models, saved[STORAGE_KEYS.modelChoice] || 'auto');

  // 預設開啟防送出衝突保護 (若未設定則為 true)
  if (antiDoubleSubmitInput) {
    antiDoubleSubmitInput.checked = saved[STORAGE_KEYS.antiDoubleSubmit] !== false;
  }

  // 檢查目前頁面是否為刊登表單
  await checkCurrentPage();
  await renderHistory();
});

// 折疊卡片切換
if (toggleConfig) {
  toggleConfig.addEventListener('click', () => {
    const isShown = configBody.style.display === 'block';
    showConfig(!isShown);
  });
}

function showConfig(show) {
  if (!configBody) return;
  configBody.style.display = show ? 'block' : 'none';
  if (configArrow) configArrow.textContent = show ? '▲' : '▼';
}

// 渲染模型下拉選單
function renderModelSelect(models, selectedValue) {
  modelSelect.innerHTML = '';

  // 1. 自動最新 Flash (推薦選項)
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = '✨ 自動選擇最新 Flash (推薦)';
  modelSelect.appendChild(autoOpt);

  // 2. 當前可用模型清單
  const uniqueModels = Array.from(new Set(models));
  uniqueModels.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  });

  // 3. 自訂模型
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = '✏️ 自訂模型名稱...';
  modelSelect.appendChild(customOpt);

  // 設定當前選取值
  if ([...modelSelect.options].some(o => o.value === selectedValue)) {
    modelSelect.value = selectedValue;
  } else if (selectedValue && selectedValue !== 'auto') {
    // 若選取的是自訂模型且不在選單內
    modelSelect.value = 'custom';
    customModelInput.value = selectedValue;
  } else {
    modelSelect.value = 'auto';
  }

  updateCustomModelVisibility();
}

function updateCustomModelVisibility() {
  if (modelSelect.value === 'custom') {
    customModelInput.style.display = 'block';
  } else {
    customModelInput.style.display = 'none';
  }
}

// 模型下拉選單切換
modelSelect.addEventListener('change', () => {
  updateCustomModelVisibility();
  chrome.storage.local.set({ [STORAGE_KEYS.modelChoice]: modelSelect.value });
});

// 自訂模型名稱輸入
customModelInput.addEventListener('input', () => {
  chrome.storage.local.set({ [STORAGE_KEYS.customModel]: customModelInput.value.trim() });
});

// 點擊「🔄 偵測可用模型」按鈕
btnRefreshModels.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus('error', '請先輸入 Gemini API Key，才能查詢可用模型。');
    apiKeyInput.focus();
    return;
  }

  btnRefreshModels.textContent = '⏳ 查詢中...';
  btnRefreshModels.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'get_models',
      apiKey
    });

    if (response.success && Array.isArray(response.models) && response.models.length > 0) {
      renderModelSelect(response.models, modelSelect.value);
      modelHint.textContent = `✅ 成功取得 Google 最新模型清單 (${response.models.length} 個可用)`;
      modelHint.style.color = '#2e7d32';
      setTimeout(() => {
        modelHint.textContent = '自動適配 Google 最新 Flash 模型，舊版退役零影響';
        modelHint.style.color = '#888';
      }, 4000);
    } else {
      throw new Error(response.error || '未找到可用的 Flash 模型');
    }
  } catch (err) {
    modelHint.textContent = `❌ 查詢失敗: ${err.message}`;
    modelHint.style.color = '#c62828';
  } finally {
    btnRefreshModels.textContent = '🔄 偵測可用模型';
    btnRefreshModels.disabled = false;
  }
});

// 自動儲存設定
apiKeyInput.addEventListener('input', () => {
  chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: apiKeyInput.value.trim() });
});
addressInput.addEventListener('input', () => {
  chrome.storage.local.set({ [STORAGE_KEYS.address]: addressInput.value });
});
if (antiDoubleSubmitInput) {
  antiDoubleSubmitInput.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.antiDoubleSubmit]: antiDoubleSubmitInput.checked });
  });
}

// 顯示/隱藏 API Key
togglePwBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    togglePwBtn.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    togglePwBtn.textContent = '👁';
  }
});

// ────────────────────────────────
// 檢查當前頁面
// ────────────────────────────────
async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isOnFormPage = tab && tab.url && GOODS_ADD_PATTERNS.some(p => tab.url.includes(p));

    if (!isOnFormPage) {
      notOnPageDiv.style.display = 'block';
      btnFill.disabled = true;
      showStatus('idle', '請先前往扶輪公益網「刊登資源」頁面，再使用此功能。');
    } else {
      notOnPageDiv.style.display = 'none';
      btnFill.disabled = false;
      showStatus('idle', '✅ 已偵測到刊登表單。上傳照片後點擊「AI 自動填寫」。');
    }
  } catch (e) {
    btnFill.disabled = false;
  }
}

// ────────────────────────────────
// 點擊 AI 填寫按鈕
// ────────────────────────────────
btnFill.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const address = addressInput.value.trim();

  // 驗證
  if (!apiKey) {
    showStatus('error', '請先輸入 Gemini API Key。');
    apiKeyInput.focus();
    return;
  }

  // 設為載入狀態
  setLoading(true);
  showStatus('loading', '🔍 正在辨識照片，請稍候...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('找不到當前頁面');

    // 確保 content script 已注入（自動備援注入）
    await ensureContentScript(tab.id);

    // 發訊息給 content.js
    const selectedModel = modelSelect.value === 'custom' ? (customModelInput.value.trim() || 'auto') : modelSelect.value;
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fill_form',
      apiKey,
      address,
      selectedModel
    });

    if (response.success) {
      showStatus('success', null, response.filledFields || [], response.geminiData);
    } else {
      showStatus('error', response.error || '發生未知錯誤');
    }
  } catch (err) {
    showStatus('error', `❌ ${err.message}`);
  } finally {
    setLoading(false);
  }
});

// ────────────────────────────────
// 確保 content script 已注入
// ────────────────────────────────
async function ensureContentScript(tabId) {
  // 先 ping 看看是否已注入
  const isLoaded = await pingContentScript(tabId);
  if (isLoaded) return;

  // 尚未注入 → 以 scripting API 動態注入
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });

  // 等待初始化
  await new Promise(r => setTimeout(r, 300));
}

async function pingContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return res && res.ready === true;
  } catch {
    return false;
  }
}

// ────────────────────────────────
// UI 工具函式
// ────────────────────────────────
function setLoading(isLoading) {
  btnFill.disabled = isLoading;
  if (isLoading) {
    btnIcon.textContent = '⏳';
    btnText.textContent = '辨識中...';
  } else {
    btnIcon.textContent = '🤖';
    btnText.textContent = 'AI 自動填寫';
  }
}

function showStatus(type, message, filledFields, geminiData) {
  statusDiv.innerHTML = '';

  if (type === 'idle') {
    statusDiv.innerHTML = `<div class="status-idle">${message}</div>`;
  } else if (type === 'loading') {
    statusDiv.innerHTML = `
      <div class="status-loading">
        <div class="spinner"></div>
        <span>${message}</span>
      </div>`;
  } else if (type === 'error') {
    statusDiv.innerHTML = `
      <div class="status-error">
        <div class="status-title">❌ 填寫失敗</div>
        <div>${message}</div>
      </div>`;
  } else if (type === 'success') {
    const listItems = filledFields.map(f => `<li>${f}</li>`).join('');
    const desc = geminiData && geminiData.description ? geminiData.description : '';
    const descBlock = desc ? `
      <div class="desc-block">
        <div class="desc-block-header">
          <span>📝 詳細說明（請複製後貼入編輯器）</span>
          <button class="btn-copy" id="btnCopyDesc">複製</button>
        </div>
        <div class="desc-text" id="descText">${desc}</div>
      </div>` : '';

    statusDiv.innerHTML = `
      <div class="status-success">
        <div class="status-title">✅ 填寫完成！</div>
        <div style="font-size:11px;color:#555;margin-top:2px;">已自動填寫以下欄位：</div>
        <ul class="filled-list">${listItems}</ul>
        ${descBlock}
        <div style="margin-top:8px;font-size:11px;color:#388e3c;">請檢查欄位是否正確，完成後再送出。</div>
      </div>`;

    // 綁定複製按鈕
    const btnCopyDesc = document.getElementById('btnCopyDesc');
    if (btnCopyDesc) {
      btnCopyDesc.addEventListener('click', () => {
        navigator.clipboard.writeText(desc).then(() => {
          btnCopyDesc.textContent = '✓ 已複製';
          btnCopyDesc.classList.add('copied');
          setTimeout(() => {
            btnCopyDesc.textContent = '複製';
            btnCopyDesc.classList.remove('copied');
          }, 2000);
        });
      });
    }

    // 填寫成功後刷新歷史清單
    renderHistory();
  }
}

// ────────────────────────────────
// 歷史記錄
// ────────────────────────────────
async function renderHistory() {
  const stored = await chrome.storage.local.get('rcn_history');
  const history = stored.rcn_history || [];

  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">尚無查詢記錄</div>';
    return;
  }

  // 顯示最近 5 筆
  historyList.innerHTML = history.slice(0, 5).map((item, idx) => {
    const date = new Date(item.time);
    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const priceStr = item.price > 0 ? ` · $${item.price}` : '';
    const hasDesc = item.description && item.description.trim() !== '';
    return `
      <div class="history-item">
        <div class="history-item-row">
          <div class="history-item-title">${item.title}</div>
          ${hasDesc ? `<button class="btn-copy-hist" data-idx="${idx}" title="複製詳細說明">📋</button>` : ''}
        </div>
        <div class="history-item-meta">${dateStr} · ${item.condition} · ${item.category}${priceStr}</div>
        ${hasDesc ? `<div class="history-desc" id="hist-desc-${idx}">${item.description}</div>` : ''}
      </div>`;
  }).join('');

  // 綁定複製按鈕事件
  historyList.querySelectorAll('.btn-copy-hist').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const desc = history[idx]?.description || '';
      if (!desc) return;
      navigator.clipboard.writeText(desc).then(() => {
        btn.textContent = '✓';
        btn.style.color = '#2e7d32';
        setTimeout(() => {
          btn.textContent = '📋';
          btn.style.color = '';
        }, 2000);
      });
    });
  });
}

btnClearHistory.addEventListener('click', async () => {
  await chrome.storage.local.remove('rcn_history');
  await renderHistory();
});
