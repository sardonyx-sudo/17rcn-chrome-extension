/**
 * 扶輪公益網 AI 刊登助手 —— Google 試算表與表單後端 (智慧欄位適配版 + 503自動重試)
 * 
 * 核心特色：
 * 1. 智慧適配：自動識別「Form_Responses」或「表單回應 1」工作表，動態比對表頭欄位
 * 2. 免手動排欄位：自動在表單回應後面補齊「狀態」、「物資品名」、「分類」等 AI 欄位
 * 3. 雙軌辨識：支援表單送出自動觸發 (onFormSubmit) 與 手動補跑 (processAllPendingRows)
 * 4. 強韌防護：內建 503 伺服器尖峰 (Spikes in demand) 指數退避自動重試機制
 */

// ───────────────────────────────────────────────
// 取得主工作表（100% 精準鎖定 Google 表單回應分頁）
// ───────────────────────────────────────────────
function getActiveSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  // 1. 最高優先級：利用 Google 官方 API 尋找「與 Google 表單連結」的工作表
  for (const s of sheets) {
    if (s.getFormUrl()) {
      Logger.log(`🎯 成功透過 Form 連結鎖定表單工作表：「${s.getName()}」 (共 ${s.getLastRow()} 列)`);
      return s;
    }
  }
  
  // 2. 次高優先級：尋找資料列大於 1 列、且不是「物資刊登佇列」的分頁
  for (const s of sheets) {
    const name = s.getName();
    if (name !== '物資刊登佇列' && s.getLastRow() > 1) {
      Logger.log(`🎯 鎖定含有資料的工作表：「${name}」 (共 ${s.getLastRow()} 列)`);
      return s;
    }
  }

  // 3. 備援：尋找名稱含有 Form、回應、Responses 的工作表
  for (const s of sheets) {
    const name = s.getName();
    if ((name.includes('Form') || name.includes('回應') || name.includes('Response')) && name !== '物資刊登佇列') {
      return s;
    }
  }

  // 4. 最後備援：使用第一個工作表
  return sheets[0];
}

// ───────────────────────────────────────────────
// 動態分析試算表欄位索引
// ───────────────────────────────────────────────
function getColumnMapping(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  const map = {
    timestamp: -1,
    photoUrls: -1,
    uploader: -1,
    address: -1,
    note: -1,
    // AI 補齊欄位
    status: -1,
    locked_at: -1,
    title: -1,
    cat1_id: -1,
    cat1_name: -1,
    cat2_id: -1,
    cat2_name: -1,
    condition: -1,
    quantity: -1,
    price: -1,
    description: -1,
    published_at: -1,
    error_msg: -1
  };

  headers.forEach((h, idx) => {
    const colIndex = idx + 1;
    const title = String(h).trim();
    if (title.includes('時間戳記') || title.includes('Timestamp')) map.timestamp = colIndex;
    else if (title.includes('照片') || title.includes('相片') || title.includes('圖片') || title.includes('photo')) map.photoUrls = colIndex;
    else if (title.includes('姓名') || title.includes('聯絡')) map.uploader = colIndex;
    else if (title.includes('地址') || title.includes('所在地')) map.address = colIndex;
    else if (title.includes('現況') || title.includes('補充') || title.includes('備註')) map.note = colIndex;
    else if (title === '狀態' || title === 'Status') map.status = colIndex;
    else if (title === '鎖定時間' || title.includes('Lock')) map.locked_at = colIndex;
    else if (title === '物資品名' || title === '品名') map.title = colIndex;
    else if (title === '一級分類ID') map.cat1_id = colIndex;
    else if (title === '一級分類名稱') map.cat1_name = colIndex;
    else if (title === '二級分類ID') map.cat2_id = colIndex;
    else if (title === '二級分類名稱') map.cat2_name = colIndex;
    else if (title === '物資新舊') map.condition = colIndex;
    else if (title === '數量') map.quantity = colIndex;
    else if (title === '預估單價') map.price = colIndex;
    else if (title === '詳細說明') map.description = colIndex;
    else if (title === '刊登時間') map.published_at = colIndex;
    else if (title === '錯誤訊息') map.error_msg = colIndex;
  });

  return map;
}

// ───────────────────────────────────────────────
// 一鍵初始化/補齊 AI 欄位表頭
// ───────────────────────────────────────────────
function setupSheet() {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  
  const aiHeaders = [
    { key: 'status', name: '狀態' },
    { key: 'locked_at', name: '鎖定時間' },
    { key: 'title', name: '物資品名' },
    { key: 'cat1_id', name: '一級分類ID' },
    { key: 'cat1_name', name: '一級分類名稱' },
    { key: 'cat2_id', name: '二級分類ID' },
    { key: 'cat2_name', name: '二級分類名稱' },
    { key: 'condition', name: '物資新舊' },
    { key: 'quantity', name: '數量' },
    { key: 'price', name: '預估單價' },
    { key: 'description', name: '詳細說明' },
    { key: 'published_at', name: '刊登時間' },
    { key: 'error_msg', name: '錯誤訊息' }
  ];

  let currentCol = sheet.getLastColumn();
  const headersToAdd = [];

  aiHeaders.forEach(h => {
    if (map[h.key] === -1) {
      headersToAdd.push(h.name);
    }
  });

  if (headersToAdd.length > 0) {
    sheet.getRange(1, currentCol + 1, 1, headersToAdd.length).setValues([headersToAdd]);
    sheet.getRange(1, currentCol + 1, 1, headersToAdd.length)
      .setBackground('#e22e4c')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }

  sheet.setFrozenRows(1);
  Logger.log('✅ 已成功將 AI 辨識欄位整合至工作表「' + sheet.getName() + '」！');
}

// ───────────────────────────────────────────────
// 表單送出觸發器
// ───────────────────────────────────────────────
function onFormSubmit(e) {
  const sheet = (e && e.range) ? e.range.getSheet() : getActiveSheet();
  const row = (e && e.range) ? e.range.getRow() : sheet.getLastRow();
  
  Logger.log(`觸發 onFormSubmit，處理工作表: ${sheet.getName()}, 行數: ${row}`);
  processRow(sheet, row);
}

/**
 * 處理指定行數之物資辨識
 */
function processRow(sheet, row, manualModel) {
  if (row <= 1) return;

  setupSheet();
  const map = getColumnMapping(sheet);
  
  try {
    Logger.log(`開始處理第 ${row} 列資料...`);

    // 1. 標記狀態為「AI辨識中」
    if (map.status !== -1) {
      sheet.getRange(row, map.status).setValue('AI辨識中');
      SpreadsheetApp.flush();
    }

    // 2. 解析照片網址
    if (map.photoUrls === -1) {
      throw new Error('未在試算表中找到照片網址欄位');
    }
    const photoUrlsText = sheet.getRange(row, map.photoUrls).getValue();
    const photoUrls = extractUrls(photoUrlsText);
    Logger.log(`第 ${row} 列解析到 ${photoUrls.length} 個照片網址: ${photoUrls.join(' | ')}`);
    if (!photoUrls || photoUrls.length === 0) {
      throw new Error('該列沒有有效的照片網址');
    }

    // 3. 讀取 Google Drive 圖片為 Base64（取代表性前 3 張，兼顧精準度與傳輸穩定性）
    const images = [];
    for (let i = 0; i < Math.min(photoUrls.length, 3); i++) {
      const fileId = extractDriveFileId(photoUrls[i]);
      if (fileId) {
        try {
          const file = DriveApp.getFileById(fileId);
          const blob = file.getBlob();
          images.push({
            mimeType: blob.getContentType(),
            base64: Utilities.base64Encode(blob.getBytes())
          });
          Logger.log(`📸 成功載入第 ${i + 1} 張照片 (ID: ${fileId}, 大小: ${Math.round(blob.getBytes().length / 1024)} KB)`);
        } catch (driveErr) {
          Logger.log(`讀取 Drive 檔案 ${fileId} 失敗: ${driveErr.message}`);
        }
      } else {
        Logger.log(`⚠️ 無法從網址解析出 Drive File ID: ${photoUrls[i]}`);
      }
    }

    if (images.length === 0) {
      throw new Error('無法從 Google Drive 讀取照片檔案（請確認檔案權限）');
    }

    // 4. 呼叫 Gemini Vision (含 503 自動重試)
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error('未在指令碼屬性中設定 GEMINI_API_KEY');
    }

    const noteText = map.note !== -1 ? String(sheet.getRange(row, map.note).getValue() || '') : '';
    const aiResult = callGeminiVision(images, apiKey, noteText, manualModel);

    // 5. 填寫辨識結果
    if (map.title !== -1) sheet.getRange(row, map.title).setValue(aiResult.title || '');
    if (map.cat1_id !== -1) sheet.getRange(row, map.cat1_id).setValue(aiResult.category1 || '');
    if (map.cat1_name !== -1) sheet.getRange(row, map.cat1_name).setValue(aiResult.category1_name || '');
    if (map.cat2_id !== -1) sheet.getRange(row, map.cat2_id).setValue(aiResult.category2 || '');
    if (map.cat2_name !== -1) sheet.getRange(row, map.cat2_name).setValue(aiResult.category2_name || '');
    if (map.condition !== -1) sheet.getRange(row, map.condition).setValue(aiResult.condition || 'used');
    if (map.quantity !== -1) sheet.getRange(row, map.quantity).setValue(aiResult.quantity || 1);
    if (map.price !== -1) sheet.getRange(row, map.price).setValue(aiResult.price || 0);
    if (map.description !== -1) sheet.getRange(row, map.description).setValue(aiResult.description || '');

    // 6. 更新為「待刊登」
    if (map.status !== -1) sheet.getRange(row, map.status).setValue('待刊登');
    if (map.error_msg !== -1) sheet.getRange(row, map.error_msg).setValue('');
    SpreadsheetApp.flush();
    Logger.log(`✅ 行 ${row} 辨識完成：${aiResult.title}`);

  } catch (err) {
    Logger.log(`❌ 行 ${row} 辨識出錯: ${err.message}`);
    if (map.status !== -1) sheet.getRange(row, map.status).setValue('辨識失敗 (系統將自動重試)');
    if (map.error_msg !== -1) sheet.getRange(row, map.error_msg).setValue(err.message);
    SpreadsheetApp.flush();
  }
}

/**
 * 補跑所有未辨識或失敗的項目 (可傳入 manualModel 指定特定模型)
 */
function processAllPendingRows(manualModel) {
  const sheet = getActiveSheet();
  setupSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();

  let processedCount = 0;
  Logger.log(`開始檢查工作表「${sheet.getName()}」共 ${lastRow} 列`);
  for (let r = 2; r <= lastRow; r++) {
    const status = map.status !== -1 ? String(sheet.getRange(r, map.status).getValue() || '') : '';
    if (!status || status === 'AI辨識中' || status.includes('辨識失敗')) {
      Logger.log(`正在補跑第 ${r} 列...`);
      processRow(sheet, r, manualModel);
      processedCount++;
    }
  }
  return { success: true, processedCount: processedCount };
}

// ───────────────────────────────────────────────
// Web App API 端點 (供 Chrome 插件連線)
// ───────────────────────────────────────────────
function doGet(e) {
  return handleApiRequest(e);
}

function doPost(e) {
  return handleApiRequest(e);
}

function handleApiRequest(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  let postData = {};
  if (e && e.postData && e.postData.contents) {
    try {
      postData = JSON.parse(e.postData.contents);
    } catch (err) {
      postData = {};
    }
  }
  const action = params.action || postData.action || 'ping';

  try {
    let result = { success: true };

    if (action === 'ping') {
      result = { success: true, message: 'Google Apps Script API 連線正常！', timestamp: new Date().toISOString() };
    } 
    else if (action === 'getItems') {
      const pendingData = getPendingItems();
      result = { 
        success: true, 
        items: pendingData.items, 
        processingItems: pendingData.processingItems,
        processingCount: pendingData.processingCount,
        failedCount: pendingData.failedCount 
      };
    } 
    else if (action === 'getModels') {
      const apiKey = getGeminiApiKey();
      if (!apiKey) throw new Error('未在指令碼屬性中設定 GEMINI_API_KEY');
      const models = fetchTopFlashModels(apiKey, true);
      result = { success: true, models: models };
    }
    else if (action === 'reprocessAll' || action === 'reprocessPending') {
      const manualModel = params.model || postData.model || '';
      const reprocessRes = processAllPendingRows(manualModel);
      const pendingData = getPendingItems();
      result = {
        success: true,
        processedCount: reprocessRes.processedCount,
        items: pendingData.items,
        processingItems: pendingData.processingItems,
        processingCount: pendingData.processingCount,
        failedCount: pendingData.failedCount,
        message: `已重新執行辨識，共補跑 ${reprocessRes.processedCount} 筆項目！`
      };
    }
    else if (action === 'reprocessRow') {
      const row = parseInt(params.row || postData.row, 10);
      if (!row) throw new Error('缺少 row 參數');
      const manualModel = params.model || postData.model || '';
      const sheet = getActiveSheet();
      processRow(sheet, row, manualModel);
      const pendingData = getPendingItems();
      result = {
        success: true,
        items: pendingData.items,
        processingItems: pendingData.processingItems,
        processingCount: pendingData.processingCount,
        failedCount: pendingData.failedCount,
        message: `第 ${row} 列已重新執行辨識`
      };
    }
    else if (action === 'lockItem') {
      const row = parseInt(params.row || postData.row, 10);
      result = updateItemStatus(row, '刊登中', ['待刊登'], null, new Date());
    } 
    else if (action === 'unlockItem') {
      const row = parseInt(params.row || postData.row, 10);
      result = updateItemStatus(row, '待刊登', ['刊登中', '待刊登']);
    } 
    else if (action === 'markPublished') {
      const row = parseInt(params.row || postData.row, 10);
      result = updateItemStatus(row, '已刊登', ['待刊登', '刊登中'], new Date());
    } 
    else if (action === 'markSkipped') {
      const row = parseInt(params.row || postData.row, 10);
      result = updateItemStatus(row, '略過', ['待刊登', '刊登中']);
    }
    else if (action === 'getSkippedItems') {
      const skippedItems = getSkippedItemsList();
      result = { success: true, items: skippedItems };
    }
    else if (action === 'restoreItem') {
      const row = parseInt(params.row || postData.row, 10);
      result = updateItemStatus(row, '待刊登', ['略過']);
    }
    else if (action === 'deleteItem') {
      const row = parseInt(params.row || postData.row, 10);
      result = deleteSingleItem(row);
    }
    else if (action === 'cleanupPublished') {
      result = cleanupPublishedItems();
    }
    else if (action === 'cleanupSkipped') {
      result = cleanupSkippedItems();
    }
    else if (action === 'getImageBase64') {
      const fileId = params.fileId || postData.fileId;
      if (!fileId) throw new Error('缺少 fileId 參數');
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      result = {
        success: true,
        mimeType: blob.getContentType(),
        base64: Utilities.base64Encode(blob.getBytes()),
        filename: file.getName()
      };
    }
    else if (action === 'uploadItem') {
      const photos = postData.photos || [];
      const address = postData.address || '';
      const note = postData.note || '';
      result = uploadItemHandler(photos, address, note);
    }
    else {
      throw new Error('未知的 action: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const errorResult = { success: false, error: err.message };
    return ContentService.createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 讀取所有狀態為「待刊登」的物資清單與統計失敗筆數
 * 內建 20 分鐘租約逾時檢查：若物資停留在「刊登中」超過 20 分鐘，自動重置為「待刊登」
 */
function getPendingItems() {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || map.status === -1) {
    return { items: [], processingItems: [], processingCount: 0, failedCount: 0 };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const items = [];
  const processingItems = [];
  let failedCount = 0;
  let uncompletedCount = 0;
  let autoReleasedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const row = data[i];
    const statusRaw = String(row[map.status - 1] || '').trim();
    const statusClean = statusRaw.replace(/\s+/g, '');
    let status = statusRaw;

    // 統計未辨識（狀態為空）的物資列
    if (!statusClean) {
      uncompletedCount++;
    }

    // 1. 檢查真實失敗筆數（排除正常辨識中項目）
    if (statusClean.includes('辨識失敗')) {
      failedCount++;
      uncompletedCount++;
    }

    // 2. AI 辨識中項目檢查（含 5 分鐘逾時看門狗機制，支援空格容錯）
    if (statusClean.includes('辨識中')) {
      let isTimeout = false;
      if (map.timestamp !== -1) {
        const tsVal = row[map.timestamp - 1];
        if (tsVal) {
          const tsTime = new Date(tsVal).getTime();
          // 若處於「AI辨識中」超過 5 分鐘，視為超時異常，自動標記為失敗以利志工重試
          if (!isNaN(tsTime) && (Date.now() - tsTime > 5 * 60 * 1000)) {
            Logger.log(`⏱️ 第 ${rowNum} 列物資 AI 辨識逾時（超過 5 分鐘），自動轉為「辨識失敗」！`);
            sheet.getRange(rowNum, map.status).setValue('辨識失敗 (辨識超時，請點擊重試)');
            if (map.error_msg !== -1) {
              sheet.getRange(rowNum, map.error_msg).setValue('辨識執行超時（超過 5 分鐘未完成）');
            }
            status = '辨識失敗 (辨識超時，請點擊重試)';
            failedCount++;
            uncompletedCount++;
            isTimeout = true;
            autoReleasedCount++;
          }
        }
      }

      if (!isTimeout) {
        const photoUrls = map.photoUrls !== -1 ? extractUrls(row[map.photoUrls - 1]) : [];
        const photos = photoUrls.map(url => {
          const fileId = extractDriveFileId(url);
          return {
            originalUrl: url,
            fileId: fileId,
            thumbnailUrl: fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` : url,
            downloadUrl: fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url
          };
        });

        processingItems.push({
          row: rowNum,
          timestamp: map.timestamp !== -1 ? row[map.timestamp - 1] : '',
          status: 'AI辨識中',
          locked_at: '',
          uploader: map.uploader !== -1 ? row[map.uploader - 1] : '',
          title: '（AI 正在辨識分析中...）',
          category1: '',
          category1_name: '分析中',
          category2: '',
          category2_name: '',
          condition: 'used',
          quantity: 1,
          price: 0,
          address: map.address !== -1 ? row[map.address - 1] || '' : '',
          description: '雲端 AI 正在分析物資照片特徵與分類，完成後將自動填入...',
          photos: photos
        });
      }
    }

    // 3. 租約逾時檢查：若為「刊登中」且超過 20 分鐘，自動重置為「待刊登」
    if (statusClean.includes('刊登中') && map.locked_at !== -1) {
      const lockedVal = row[map.locked_at - 1];
      if (lockedVal) {
        const lockedTime = new Date(lockedVal).getTime();
        if (!isNaN(lockedTime) && (Date.now() - lockedTime > 20 * 60 * 1000)) {
          Logger.log(`⏱️ 第 ${rowNum} 列物資刊登逾時（超過 20 分鐘），自動重置為「待刊登」！`);
          sheet.getRange(rowNum, map.status).setValue('待刊登');
          sheet.getRange(rowNum, map.locked_at).setValue('');
          status = '待刊登';
          autoReleasedCount++;
        }
      }
    }

    // 4. 正式待刊登或刊登中項目 (支援前後空格容錯)
    if (statusClean.includes('待刊登') || statusClean.includes('刊登中')) {
      const photoUrls = map.photoUrls !== -1 ? extractUrls(row[map.photoUrls - 1]) : [];
      const photos = photoUrls.map(url => {
        const fileId = extractDriveFileId(url);
        return {
          originalUrl: url,
          fileId: fileId,
          thumbnailUrl: fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` : url,
          downloadUrl: fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url
        };
      });

      items.push({
        row: rowNum,
        timestamp: map.timestamp !== -1 ? row[map.timestamp - 1] : '',
        status: status,
        locked_at: map.locked_at !== -1 ? row[map.locked_at - 1] : '',
        uploader: map.uploader !== -1 ? row[map.uploader - 1] : '',
        title: map.title !== -1 ? row[map.title - 1] : '',
        category1: map.cat1_id !== -1 ? row[map.cat1_id - 1] : '',
        category1_name: map.cat1_name !== -1 ? row[map.cat1_name - 1] : '',
        category2: map.cat2_id !== -1 ? row[map.cat2_id - 1] : '',
        category2_name: map.cat2_name !== -1 ? row[map.cat2_name - 1] : '',
        condition: map.condition !== -1 ? row[map.condition - 1] || 'used' : 'used',
        quantity: map.quantity !== -1 ? row[map.quantity - 1] || 1 : 1,
        price: map.price !== -1 ? row[map.price - 1] || 0 : 0,
        address: map.address !== -1 ? row[map.address - 1] || '' : '',
        description: map.description !== -1 ? row[map.description - 1] || '' : '',
        photos: photos
      });
    }
  }

  if (autoReleasedCount > 0) {
    SpreadsheetApp.flush();
  }

  // 5. 智慧單例自動背景補跑（5 分鐘冷卻 + 零並發防護）
  if (uncompletedCount > 0) {
    maybeScheduleAutoReprocess(uncompletedCount);
  }

  return { 
    items: items, 
    processingItems: processingItems,
    processingCount: processingItems.length,
    failedCount: failedCount 
  };
}

/**
 * 智慧單例自動補跑排程模組 (5 分鐘冷卻 + 單一 Trigger 防護)
 * 避免並發搶跑、避免爆 20 個觸發器上限、避免過度打 Gemini API
 */
function maybeScheduleAutoReprocess(unprocessedCount) {
  if (unprocessedCount <= 0) return;

  try {
    const props = PropertiesService.getScriptProperties();
    const lastRun = Number(props.getProperty('LAST_AUTO_REPROCESS_TIME') || 0);
    const now = Date.now();
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 分鐘冷卻

    // 1. 冷卻時間檢查
    if (now - lastRun < COOLDOWN_MS) {
      Logger.log(`⏳ 距上次自動補跑未滿 5 分鐘（尚餘 ${Math.round((COOLDOWN_MS - (now - lastRun)) / 1000)} 秒），跳過本次排程。`);
      return;
    }

    // 2. 檢查專案是否已有等待中的 processAllPendingRowsAsync 觸發器（防止累積爆 20 個上限）
    const triggers = ScriptApp.getProjectTriggers();
    for (const t of triggers) {
      if (t.getHandlerFunction() === 'processAllPendingRowsAsync') {
        Logger.log('⏳ 目前雲端已有排隊中之辨識觸發器，不重複建立。');
        return;
      }
    }

    // 3. 通過檢查：更新時間戳並建立一次性觸發器於 2 秒後在背景執行
    props.setProperty('LAST_AUTO_REPROCESS_TIME', String(now));
    ScriptApp.newTrigger('processAllPendingRowsAsync')
      .timeBased()
      .after(2000)
      .create();
    Logger.log(`🚀 偵測到有 ${unprocessedCount} 筆待辨識或未完成物資，已排程 2 秒後在背景自動補跑！`);
  } catch (err) {
    Logger.log(`自動排程建立失敗: ${err.message}`);
  }
}

/**
 * 更新指定列的狀態
 */
function updateItemStatus(row, newStatus, allowedCurrentStatuses, publishedDate, lockedDate) {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  if (map.status === -1) return { success: false, error: '未找到狀態欄位' };

  const currentStatus = sheet.getRange(row, map.status).getValue();
  if (allowedCurrentStatuses && allowedCurrentStatuses.length > 0) {
    if (!allowedCurrentStatuses.includes(currentStatus)) {
      return { success: false, error: `當前狀態為 ${currentStatus}，無法變更為 ${newStatus}` };
    }
  }

  sheet.getRange(row, map.status).setValue(newStatus);
  if (publishedDate && map.published_at !== -1) {
    sheet.getRange(row, map.published_at).setValue(publishedDate);
  }

  // 處理鎖定時間
  if (map.locked_at !== -1) {
    if (newStatus === '刊登中') {
      sheet.getRange(row, map.locked_at).setValue(lockedDate || new Date());
    } else {
      sheet.getRange(row, map.locked_at).setValue('');
    }
  }

  SpreadsheetApp.flush();
  return { success: true, row: row, newStatus: newStatus };
}

/**
 * 刪除文字中所包含的所有 Google Drive 照片檔案（移至垃圾桶以釋放 1GB 空間）
 */
function deleteDrivePhotos(photoUrlsText) {
  const urls = extractUrls(photoUrlsText);
  let count = 0;
  for (const url of urls) {
    const fileId = extractDriveFileId(url);
    if (fileId) {
      try {
        const file = DriveApp.getFileById(fileId);
        file.setTrashed(true); // 移至垃圾桶，立即釋放 Google 表單配額
        count++;
        Logger.log(`🗑️ 成功將 Drive 照片移至垃圾桶：${fileId}`);
      } catch (err) {
        Logger.log(`移除 Drive 檔案 ${fileId} 失敗: ${err.message}`);
      }
    }
  }
  return count;
}

/**
 * 刪除單筆物資（不論狀態，除了「刊登中」被鎖定之外）
 * 包含刪除試算表列與 Google Drive 照片
 */
function deleteSingleItem(row) {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();

  if (row < 2 || row > lastRow) {
    return { success: false, error: `無效的列號：第 ${row} 列不存在` };
  }

  // 檢查是否被鎖定（刊登中）
  if (map.status !== -1) {
    const status = String(sheet.getRange(row, map.status).getValue() || '');
    if (status === '刊登中') {
      return { success: false, error: '此物資目前正在刊登中（已鎖定），無法刪除！若要刪除請先解除鎖定或略過。' };
    }
  }

  // 1. 刪除關聯的 Google Drive 照片
  let deletedPhotos = 0;
  if (map.photoUrls !== -1) {
    const photoText = sheet.getRange(row, map.photoUrls).getValue();
    deletedPhotos = deleteDrivePhotos(photoText);
  }

  // 2. 刪除試算表該列
  sheet.deleteRow(row);
  SpreadsheetApp.flush();

  Logger.log(`✅ 已成功刪除第 ${row} 列，並移除了 ${deletedPhotos} 張雲端照片`);
  return { 
    success: true, 
    row: row, 
    deletedPhotos: deletedPhotos,
    message: `已成功刪除第 ${row} 列物資及 ${deletedPhotos} 張關聯照片！` 
  };
}

/**
 * 一鍵清除所有「已刊登」的物資
 * 包含刪除試算表列與 Google Drive 照片，避免將 1GB 表單空間用盡
 */
function cleanupPublishedItems() {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2 || map.status === -1) {
    return { success: true, deletedCount: 0, photosDeleted: 0, message: '目前沒有任何已刊登物資需要清除。' };
  }

  let deletedCount = 0;
  let photosDeleted = 0;

  // 必須倒序掃描（從最後一列往上刪，才不會因為 deleteRow 導致 row index 偏移）
  for (let r = lastRow; r >= 2; r--) {
    const status = String(sheet.getRange(r, map.status).getValue() || '');
    if (status === '已刊登') {
      // 1. 刪除關聯的照片
      if (map.photoUrls !== -1) {
        const photoText = sheet.getRange(r, map.photoUrls).getValue();
        photosDeleted += deleteDrivePhotos(photoText);
      }
      // 2. 刪除資料列
      sheet.deleteRow(r);
      deletedCount++;
    }
  }

  SpreadsheetApp.flush();
  Logger.log(`🧹 已清除 ${deletedCount} 筆已刊登物資，共移除 ${photosDeleted} 張雲端照片`);
  return {
    success: true,
    deletedCount: deletedCount,
    photosDeleted: photosDeleted,
    message: deletedCount > 0 
      ? `已成功清除 ${deletedCount} 筆已刊登物資，共釋放 ${photosDeleted} 張照片的雲端空間！`
      : '目前沒有「已刊登」的物資需要清除。'
  };
}

/**
 * 讀取所有狀態為「略過」的物資清單
 */
function getSkippedItemsList() {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || map.status === -1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const items = [];

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const row = data[i];
    const status = String(row[map.status - 1] || '');

    if (status === '略過') {
      const photoUrls = map.photoUrls !== -1 ? extractUrls(row[map.photoUrls - 1]) : [];
      const photos = photoUrls.map(url => {
        const fileId = extractDriveFileId(url);
        return {
          originalUrl: url,
          fileId: fileId,
          thumbnailUrl: fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800` : url,
          downloadUrl: fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url
        };
      });

      items.push({
        row: rowNum,
        timestamp: map.timestamp !== -1 ? row[map.timestamp - 1] : '',
        status: status,
        uploader: map.uploader !== -1 ? row[map.uploader - 1] : '',
        title: map.title !== -1 ? row[map.title - 1] : '',
        category1: map.cat1_id !== -1 ? row[map.cat1_id - 1] : '',
        category1_name: map.cat1_name !== -1 ? row[map.cat1_name - 1] : '',
        category2: map.cat2_id !== -1 ? row[map.cat2_id - 1] : '',
        category2_name: map.cat2_name !== -1 ? row[map.cat2_name - 1] : '',
        condition: map.condition !== -1 ? row[map.condition - 1] || 'used' : 'used',
        quantity: map.quantity !== -1 ? row[map.quantity - 1] || 1 : 1,
        price: map.price !== -1 ? row[map.price - 1] || 0 : 0,
        address: map.address !== -1 ? row[map.address - 1] || '' : '',
        description: map.description !== -1 ? row[map.description - 1] || '' : '',
        photos: photos
      });
    }
  }

  return items;
}

/**
 * 一鍵清除所有「略過」的物資
 * 包含刪除試算表列與 Google Drive 照片，避免將 1GB 表單空間用盡
 */
function cleanupSkippedItems() {
  const sheet = getActiveSheet();
  const map = getColumnMapping(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2 || map.status === -1) {
    return { success: true, deletedCount: 0, photosDeleted: 0, message: '目前沒有任何已略過物資需要清除。' };
  }

  let deletedCount = 0;
  let photosDeleted = 0;

  // 必須倒序掃描（從最後一列往上刪）
  for (let r = lastRow; r >= 2; r--) {
    const status = String(sheet.getRange(r, map.status).getValue() || '');
    if (status === '略過') {
      // 1. 刪除關聯的照片
      if (map.photoUrls !== -1) {
        const photoText = sheet.getRange(r, map.photoUrls).getValue();
        photosDeleted += deleteDrivePhotos(photoText);
      }
      // 2. 刪除資料列
      sheet.deleteRow(r);
      deletedCount++;
    }
  }

  SpreadsheetApp.flush();
  Logger.log(`🧹 已清除 ${deletedCount} 筆已略過物資，共移除 ${photosDeleted} 張雲端照片`);
  return {
    success: true,
    deletedCount: deletedCount,
    photosDeleted: photosDeleted,
    message: deletedCount > 0 
      ? `已成功清除 ${deletedCount} 筆已略過物資，共釋放 ${photosDeleted} 張照片的雲端空間！`
      : '目前沒有「略過」的物資需要清除。'
  };
}

// ───────────────────────────────────────────────
// App 拍照直傳處理模組
// ───────────────────────────────────────────────
function getOrCreatePhotoFolder() {
  const folderName = '扶輪公益網物資相片庫';
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function uploadItemHandler(photosBase64, address, note) {
  if (!photosBase64 || !Array.isArray(photosBase64) || photosBase64.length === 0) {
    throw new Error('未包含任何照片資料');
  }

  const sheet = getActiveSheet();
  setupSheet();
  const map = getColumnMapping(sheet);

  // 1. 儲存照片至 Google Drive 相片資料夾
  const targetFolder = getOrCreatePhotoFolder();
  const savedUrls = [];
  const timestampStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');

  photosBase64.forEach((b64, idx) => {
    try {
      const bytes = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(bytes, 'image/jpeg', `mobile_${timestampStr}_${idx + 1}.jpg`);
      const file = targetFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      savedUrls.push(file.getUrl());
    } catch (e) {
      Logger.log(`儲存行動端照片 ${idx + 1} 失敗: ${e.message}`);
    }
  });

  if (savedUrls.length === 0) {
    throw new Error('照片儲存至 Google 雲端硬碟失敗');
  }

  // 2. 在工作表中新增一列
  const lastCol = sheet.getLastColumn();
  const newRowData = new Array(lastCol).fill('');
  const now = new Date();

  if (map.timestamp !== -1) newRowData[map.timestamp - 1] = now;
  if (map.photoUrls !== -1) newRowData[map.photoUrls - 1] = savedUrls.join(', ');
  if (map.uploader !== -1) newRowData[map.uploader - 1] = 'App拍照上傳';
  if (map.address !== -1) newRowData[map.address - 1] = address || '';
  if (map.note !== -1) newRowData[map.note - 1] = note || '';
  if (map.status !== -1) newRowData[map.status - 1] = 'AI辨識中';

  sheet.appendRow(newRowData);
  SpreadsheetApp.flush();
  const newRowNum = sheet.getLastRow();

  Logger.log(`📱 App 拍照物資已新增至第 ${newRowNum} 列，共 ${savedUrls.length} 張照片。`);

  // 3. 真正非同步觸發：透過一次性觸發器在背景背景執行，立刻回傳成功避免 App 超時 (Timeout)
  try {
    ScriptApp.newTrigger('processAllPendingRowsAsync')
      .timeBased()
      .after(1000)
      .create();
  } catch (triggerErr) {
    Logger.log(`建立背景觸發器失敗: ${triggerErr.message}`);
  }

  return {
    success: true,
    row: newRowNum,
    photoCount: savedUrls.length,
    message: `物資已成功登錄至第 ${newRowNum} 列，AI 正在背景分析辨識中！`
  };
}

/**
 * 給觸發器專用的背景補跑函式，跑完後自動刪除觸發器避免積累
 */
function processAllPendingRowsAsync() {
  try {
    // 刪除已完成的觸發器
    const triggers = ScriptApp.getProjectTriggers();
    for (const t of triggers) {
      if (t.getHandlerFunction() === 'processAllPendingRowsAsync') {
        ScriptApp.deleteTrigger(t);
      }
    }
    processAllPendingRows();
  } catch (e) {
    Logger.log('背景非同步辨識執行失敗: ' + e.message);
  }
}

// ───────────────────────────────────────────────
// Gemini API 呼叫模組 (最新 Top 2 Flash 自動降級 + 503/429 重試防護)
// ───────────────────────────────────────────────
function callGeminiVision(images, apiKey, noteText, manualModel) {
  const imageParts = images.map(img => ({
    inline_data: {
      mime_type: img.mimeType,
      data: img.base64
    }
  }));

  let prompt = `你是一個物資辨識助手。請仔細分析這些照片（可能有多張，代表同一物資的不同角度），以繁體中文回傳符合以下結構的 JSON，不要加任何其他文字或 markdown 標記：

{
  "title": "物資品名（簡潔，10字以內）",
  "category1": <第一層分類數字 1-27>,
  "category1_name": "第一層分類名稱",
  "category2": <第二層子分類數字ID>,
  "category2_name": "第二層子分類名稱",
  "condition": "new 或 used",
  "quantity": <整數，若照片無法判斷請填 1>,
  "price": <整數預估單價（新台幣），若無法判斷請填 0>,
  "description": "詳細說明（包含物資狀況、外觀特徵、適用對象、用途，100字以內）"
}

資源分類與子分類對照表（請先選擇符合的 category1，再從括號中選出最符合的 category2 數字ID）：
1=女裝與服飾配件 -> [1:女裝上衣, 2:T恤, 3:針織衫, 4:襯衫, 5:品牌服飾, 6:褲子, 7:裙子, 8:洋裝, 9:外套, 10:套裝, 11:牛仔/單寧, 12:大尺寸, 13:內/睡衣, 14:內搭, 15:皮帶/腰帶/腰鍊, 16:襪子, 17:絲巾/圍巾/披肩, 18:帽子, 19:手套, 20:婚紗/禮服/配件, 21:表演/道具服, 22:傳統/各國文化服飾]
2=女包精品與女鞋 -> [23:女包精品與女鞋, 24:流行時尚包款, 25:側(肩)背包, 26:手提包, 27:大方包, 28:水桶包, 29:斜背包, 30:名牌精品包, 31:名牌精品皮夾, 32:皮夾, 33:行李箱/旅行袋, 34:化妝包, 35:其他女包, 36:包鞋系列, 37:涼/拖鞋, 38:露趾/魚口鞋, 39:靴子, 40:流行帆布鞋, 41:鞋材配件, 42:平底鞋款, 43:低跟鞋款3cm以下, 44:中跟鞋款4-6cm, 45:高跟鞋款7cm以上, 46:楔型/厚底鞋]
3=美容保養與彩妝 -> [47:臉部保養, 48:化妝品/彩妝, 49:美髮護理, 50:身體清潔保養, 51:眼部保養, 52:香水/體香劑, 53:美體美身, 54:保健衛生器材, 55:手部保養, 56:唇部保養, 57:足部保養, 58:精油/薰香產品, 59:男士清潔保養, 60:美齒清潔, 61:頸部保養, 62:健身/按摩器材]
4=男性精品與服飾 -> [63:T恤, 64:POLO衫, 65:褲子, 66:牛仔長褲, 67:大尺寸, 68:外套, 69:襯衫, 70:西裝, 71:品牌休閒皮鞋, 72:男鞋, 73:背包/公事包, 74:皮夾, 75:帽子, 76:背心/健身衫, 77:針織衫, 78:領帶/吊帶, 79:內衣/內褲, 80:襪子, 81:睡衣/睡袍, 82:皮帶, 83:毛衣, 84:手套, 85:圍巾/手帕, 86:胸章/胸針, 87:唐裝上衣, 88:表演/道具服]
5=手錶與飾品配件 -> [89:男錶, 90:女錶, 91:對錶, 92:手錶配件, 93:其他手錶, 94:時鐘/鬧鐘, 95:項鍊, 96:戒指, 97:手鍊(珠)/手環, 98:墜子, 99:耳環, 100:裸石, 101:髮飾, 102:男性首飾配件, 103:其他首飾配件, 104:鏡框, 105:太陽眼鏡, 106:鑰匙圈, 107:打火機]
6=運動戶外與休閒 -> [108:自行車/腳踏車, 109:自行車用品, 110:自行車零組件, 111:戶外休閒用品, 112:休閒/旅遊票券, 113:男運動服, 114:男運動鞋, 115:女運動服, 116:女運動鞋, 117:運動用品, 118:雨傘/雨具, 119:樂器, 120:運動背包/提包, 121:體育紀念品, 122:健身/按摩器材]
7=嬰幼兒與孕婦 -> [123:嬰幼兒(2歲以下), 124:女童裝, 125:男童裝, 126:兒童包鞋配件, 127:孕婦裝與用品, 128:哺育用品, 129:母乳贈送, 130:外出用具, 131:清潔護理, 132:寢具用品, 133:幼兒安全用品, 134:兒童玩具]
8=圖書與雜誌 -> [135:漫畫書, 136:雜誌期刊, 137:小說, 138:文學, 139:社會科學, 140:人文/地理, 141:科學, 142:電腦/網路, 143:財經企管, 144:心理勵志, 145:休閒嗜好, 146:美食/餐飲, 147:旅遊, 148:醫藥保健, 149:藝術/音樂, 150:影視娛樂, 151:人物傳記, 152:語言學習, 153:教育/考試用書, 154:少年童書, 155:古書善本, 156:西文書, 157:日文書, 158:工具書/字典]
9=音樂與影片 -> [159:CD, 160:VCD, 161:DVD, 162:黑膠唱片, 163:錄音帶, 164:錄影帶, 165:LD, 166:藍光光碟/BD, 167:樂器]
10=居家家具與園藝 -> [168:家具, 169:寢具/寢飾, 170:家飾, 171:燈具, 172:廚具/廚房用品, 173:餐具, 174:廚房小家電, 175:衛浴設備用品, 176:園藝, 177:庭院用具, 178:五金工具, 179:家庭雜貨, 180:精油/薰香產品, 181:清潔用品, 182:居家安全, 183:手工藝用品, 184:冰箱, 185:冷氣空調, 186:美容小家電, 187:食品與地方特產]
11=文具與事務用品 -> [188:書寫用具, 189:黏貼用品, 190:修正用品, 191:紙製品, 192:收納整理, 193:繪畫用品, 194:製圖用品, 195:書籤, 196:教育用具, 197:事務用品]
12=玩具模型與公仔 -> [198:可動玩偶, 199:轉蛋食玩, 200:塑膠模型, 201:便利商店玩具, 202:Cosplay, 203:GK模型, 204:遙控模型, 205:金屬模型, 206:鐵道模型, 207:懷舊童玩, 208:益智遊戲/玩具, 209:LEGO/樂高積木, 210:魔術道具, 211:速食店玩具, 212:絨毛玩偶, 213:洋娃娃與配件, 214:布袋戲偶/配件, 215:整人玩具, 216:紙牌遊戲, 217:卡漫週邊, 218:兒童玩具]
13=寵物用品與水族 -> [219:狗用品, 220:貓用品, 221:水族用品, 222:兔用品, 223:鼠用品, 224:兩棲/爬蟲類用品, 225:鳥用品, 226:昆蟲用品, 227:寵物服務]
14=寵物送養 -> [228:貓, 229:狗, 230:水族, 231:鼠, 232:兩棲/爬蟲, 233:鳥, 234:昆蟲]
15=食品與地方特產 -> [235:茶葉/茶包, 236:沖泡飲品, 237:地方小吃/特產, 238:保健食品, 239:素食, 240:有機食品, 241:蛋糕/甜點, 242:餅乾零嘴, 243:生鮮蔬果, 244:冷凍食材, 245:米飯麵食, 246:罐頭, 247:果醬/抹醬, 248:調味品/食用油, 249:烘焙原料, 250:南北乾貨, 251:速食調理包, 252:食譜]
16=禮券類 -> [253:e-coupon電子禮券/抵用券, 254:紙本禮券/抵用券]
17=電腦軟硬體與PDA -> [255:桌上型電腦, 256:筆記型電腦, 257:蘋果電腦, 258:電腦周邊設備, 259:電腦零組件, 260:筆記型周邊配件, 261:耗材/線材與雜項, 262:網路設備, 263:電腦軟體, 264:PDA, 265:電子字典/翻譯機, 266:螢幕, 267:記憶體, 268:主機板, 269:CPU, 270:可攜式GPS]
18=相機攝影與視訊 -> [271:消費級數位相機, 272:數位單眼相機, 273:一般相機, 274:攝影機, 275:視訊設備, 276:鏡頭, 277:規格類周邊配件, 278:數位相機規格類配件, 279:相機飾品/保護套(貼), 280:記憶卡, 281:讀卡機, 282:望遠鏡, 283:數位相框, 284:OTG行動硬碟/相簿]
19=手機與通訊 -> [285:手機, 286:IPHONE週邊, 287:手機門號, 288:行動網卡, 289:電話卡, 290:手機規格類配件, 291:手機飾品/保護套(貼), 292:手機吊飾, 293:無線電設備, 294:網路電話, 295:家用電話, 296:商用電話, 297:傳真機, 298:答錄機]
20=家電類 -> [299:電視機, 300:投影機/布幕, 301:影音播放機, 302:淨水設備, 303:生活小家電, 304:廚房小家電, 305:美容小家電, 306:健康家電, 307:冰箱, 308:洗衣/乾衣機, 309:冷氣空調]
21=音響劇院與MP3 -> [310:MP/隨身聽, 311:耳機, 312:卡拉OK伴唱機, 313:麥克風, 314:喇叭, 315:擴大機, 316:AV線材, 317:喇叭架, 318:家庭劇院組, 319:組合音響, 320:手提音響, 321:收音機/錄放音機, 322:影音AV配件, 323:影音播放機, 324:樂器, 325:液晶電視與家電]
22=汽機車與精品百貨 -> [326:機車騎士用品, 327:機車用品/零件, 328:汽車車體零/套件, 329:汽車用精品, 330:GPS衛星導航系統, 331:車用影音/電子裝置, 332:汽機車維修/改裝, 333:汽車, 334:機車]
23=電玩遊戲與主機 -> [335:PlayStation , 336:Wii, 337:XBOX 360, 338:PSP掌上型, 339:NDS掌上型, 340:其他電玩遊戲/主機, 341:線上遊戲, 342:電腦遊戲, 343:電玩攻略]
24=偶像球卡與郵幣 -> [344:郵票, 345:錢幣, 346:收藏卡, 347:紙鈔, 348:明星與偶像商品, 349:商標收藏, 350:紀念票/券/章, 351:名人簽名, 352:紀念車牌/招牌]
25=古董藝術與礦石 -> [353:玉石, 354:書畫作品, 355:佛像, 356:香品, 357:印石/原石, 358:宗教品, 359:紫砂壺, 360:水晶, 361:瓷器, 362:木器, 363:銅器, 364:民俗古早收藏, 365:文房百寶, 366:風水開運商品, 367:文獻收藏品, 368:金器/銀器, 369:陶器/琺瑯/漆器, 370:鼻煙壺, 371:天珠, 372:翡翠, 373:竹器, 374:貝類/化石/標本/琥珀蜜蠟, 375:白玉, 376:和闐玉, 377:布袋戲偶/配件]
26=教學與人力贈送 -> [378:教學, 379:一日志工, 380:專長諮詢, 381:其他服務]
27=其他 -> [382:其他]

condition 判斷標準：
- new = 全新未拆封或近全新無明顯使用痕跡
- used = 二手有使用痕跡`;

  if (noteText) {
    prompt += `\n\n捐贈者補充說明：${noteText}`;
  }

  const payload = {
    contents: [
      {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      maxOutputTokens: 4096
    }
  };

  // 取得候選模型清單（手動指定優先 + 線上最新 Top 2 Flash + 靜態保底）
  const candidateModels = getCandidateModels(apiKey, manualModel);
  Logger.log(`🤖 本次將依序嘗試以下可用模型：${candidateModels.join(' ➔ ')}`);

  let lastError = null;

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    // 每個模型給予最多 2 次嘗試機會（若 503/429 稍作等待 2 秒重試，若仍繁忙立即切換至下一個候選模型）
    const retryDelays = [2000, 4000];
    for (let attempt = 1; attempt <= 2; attempt++) {
      Logger.log(`嘗試使用模型「${modelName}」進行辨識 (第 ${attempt} 次)...`);

      try {
        const response = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const statusCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (statusCode === 200) {
          const json = JSON.parse(responseText);
          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          Logger.log(`🎉 模型「${modelName}」辨識成功！`);
          return safeParseJson(rawText);
        }

        // 若遇到 503 (尖峰塞車) 或 429 (請求過急)
        if (statusCode === 503 || statusCode === 429) {
          const delay = retryDelays[attempt - 1] || 15000;
          Logger.log(`⚠️ 模型「${modelName}」暫時繁忙 (${statusCode})，等待 ${delay / 1000} 秒後進行重試...`);
          lastError = new Error(`模型 ${modelName} 繁忙 (${statusCode}): ${responseText}`);
          Utilities.sleep(delay);
          continue;
        }

        // 若遇到 404 (模型已除役不存在)，直接跳出切換下一個模型
        if (statusCode === 404) {
          Logger.log(`⚠️ 模型「${modelName}」已不存在或未開放 (404)，立即切換備援模型...`);
          break;
        }

        // 其他 HTTP 錯誤
        throw new Error(`Gemini API 錯誤 (${statusCode}): ${responseText}`);

      } catch (fetchErr) {
        Logger.log(`⚠️ 模型「${modelName}」調用異常: ${fetchErr.message}`);
        lastError = fetchErr;
        Utilities.sleep(1500);
      }
    }
  }

  throw lastError || new Error('所有備援模型皆繁忙，請稍候重試');
}

// ───────────────────────────────────────────────
// 輔助工具函式
// ───────────────────────────────────────────────
/**
 * 向 Google API 查詢最新線上支援之 Flash 模型
 * 依「標準多模態視覺主力版本優先，版本號數值由大到小」嚴格排序
 */
function fetchTopFlashModels(apiKey, forceRefresh) {
  try {
    const cache = CacheService.getScriptCache();
    let discovered = (!forceRefresh) ? cache.get('DISCOVERED_FLASH_MODELS') : null;
    if (discovered) {
      return JSON.parse(discovered);
    }
    const resp = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'get',
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      const data = JSON.parse(resp.getContentText());
      if (data && data.models && Array.isArray(data.models)) {
        // 1. 基礎過濾：必須支援 generateContent，且排除純語音(tts)、向量(embedding)、問答(aqa)、生圖(image)
        const rawFlashModels = data.models
          .filter(m => {
            const name = (m.name || '').toLowerCase();
            const methods = m.supportedGenerationMethods || [];
            return name.includes('flash') &&
                   methods.includes('generateContent') &&
                   !name.includes('tts') &&
                   !name.includes('embedding') &&
                   !name.includes('aqa') &&
                   !name.includes('image');
          })
          .map(m => m.name.replace('models/', ''));

        // 2. 分類：標準主力版本 (如 gemini-3.8-flash, gemini-3.6-flash) vs 其他變體 (如 lite / preview / latest)
        const standardModels = [];
        const variantModels = [];

        rawFlashModels.forEach(m => {
          const match = m.match(/^gemini-(\d+(?:\.\d+)?)-flash$/i);
          if (match) {
            standardModels.push({ name: m, version: parseFloat(match[1]) });
          } else {
            variantModels.push(m);
          }
        });

        // 3. 標準主力版本依版本號數值降冪排序 (例如 3.8 > 3.7 > 3.6 > 3.5 ...)
        standardModels.sort((a, b) => b.version - a.version);

        // 4. 其他變體依字母降冪排序
        variantModels.sort((a, b) => b.localeCompare(a));

        // 5. 合併：標準主力排前面
        const sortedList = [
          ...standardModels.map(item => item.name),
          ...variantModels
        ];

        if (sortedList.length > 0) {
          cache.put('DISCOVERED_FLASH_MODELS', JSON.stringify(sortedList), 14400); // 快取 4 小時
          return sortedList;
        }
      }
    }
  } catch (err) {
    Logger.log('動態查詢 Google 模型失敗: ' + err.message);
  }
  // 靜態保底：以目前現役且未除役的穩定版為主（避開 3.8/3.7 尖峰，移除已停用的 2.5 與 1.5）
  return ['gemini-3.6-flash', 'gemini-3.5-flash'];
}

/**
 * 智慧取得可用候選模型清單
 * - 手動指定 (manualModel)：專責人員手動點選重試時若指定特定模型，排第一優先
 * - 避開繁忙高階：自動挑選線上「第 3 新」與「第 4 新」的穩定 Flash 主力版本 (如 3.6 ➔ 3.5)
 * - 排除已淘汰除役的 2.5 / 1.5
 */
function getCandidateModels(apiKey, manualModel) {
  const models = [];

  // 1. 若手動指定特定模型（非 auto）
  if (manualModel && String(manualModel).trim() && manualModel !== 'auto') {
    models.push(String(manualModel).trim());
  }

  // 2. 線上模型清單：自動使用第 3 新與第 4 新 (Rank 3 與 Rank 4，避開 3.8 / 3.7 頻繁 503 尖峰)
  const onlineFlash = fetchTopFlashModels(apiKey);
  
  if (onlineFlash.length >= 4) {
    // 若線上至少有 4 個 Flash 模型，取索引 2 與 3 (即第 3 新與第 4 新，例如 3.6 與 3.5)
    const stablePair = [onlineFlash[2], onlineFlash[3]];
    stablePair.forEach(m => {
      if (m && !models.includes(m)) models.push(m);
    });
  } else if (onlineFlash.length >= 2) {
    // 若線上模型數量較少，取倒數或最後兩個可用模型
    const fallbackSlice = onlineFlash.slice(Math.max(0, onlineFlash.length - 2));
    fallbackSlice.forEach(m => {
      if (m && !models.includes(m)) models.push(m);
    });
  } else {
    onlineFlash.forEach(m => {
      if (m && !models.includes(m)) models.push(m);
    });
  }

  // 3. 靜態保底：若動態清單未涵蓋，補上現役穩定版 gemini-3.6-flash 與 gemini-3.5-flash
  const staticFallback = ['gemini-3.6-flash', 'gemini-3.5-flash'];
  staticFallback.forEach(m => {
    if (!models.includes(m)) models.push(m);
  });

  return models;
}

function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

function safeParseJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('無法解析 Gemini 回傳之 JSON：' + text);
  }
}

function extractUrls(text) {
  if (!text) return [];
  const str = String(text);
  
  // 1. 先依逗號、分號、換行或空白切分
  const parts = str.split(/[\s,;\n\r]+/);
  const urls = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    
    // 清理前後可能殘留的引號或括弧
    part = part.replace(/^["'\[\(<]+|["'\]\)>]+$/g, '');
    
    if (part.startsWith('http://') || part.startsWith('https://')) {
      urls.push(part);
    }
  }

  if (urls.length > 0) return urls;

  // 2. 備援正規表達式匹配
  const urlRegex = /(https?:\/\/[^\s,;"'<>]+)/g;
  const matches = str.match(urlRegex);
  return matches ? matches.map(u => u.trim()) : [];
}

function extractDriveFileId(url) {
  if (!url) return null;
  const cleanUrl = String(url).trim();

  // 1. 匹配 ?id= 或 &id=
  const idParamMatch = cleanUrl.match(/[?&]id=([-\w]{25,})/);
  if (idParamMatch) return idParamMatch[1];
  
  // 2. 匹配 /d/xxxx/
  const pathMatch = cleanUrl.match(/\/d\/([-\w]{25,})/);
  if (pathMatch) return pathMatch[1];

  // 3. 匹配 /file/d/xxxx
  const fileDMatch = cleanUrl.match(/\/file\/d\/([-\w]{25,})/);
  if (fileDMatch) return fileDMatch[1];

  // 4. 備援：若本身就是 25+ 字元的 Google Drive ID
  const anyMatch = cleanUrl.match(/^[-\w]{25,}$/);
  return anyMatch ? anyMatch[0] : null;
}

