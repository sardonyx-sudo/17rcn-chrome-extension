# 扶輪公益網 AI 刊登助手 —— Google 試算表整合版 (推薦)

專為團隊協同作業打造的 Chrome 瀏覽器擴充功能（Manifest V3）。  
徹底實現**「外勤志工手機隨拍隨傳」➔「Google 雲端自動提前辨識」➔「電腦端專責人員毫秒級流水線發布」**的零等待高效率作業流程。

---

## 🎨 視覺與版面特色

- **翡翠綠主題 (Google Sheets Green: `#0f9d58`)**：搭配專屬翡翠綠試算表雲端圖示，與單機版（緋紅色）形成強烈對比，即使兩者同時安裝亦一目了然。
- **「⚙️ 設定與清理」卡片**：
  - 整合 GAS Web App 網址設定、預設備援地址。
  - **手動重辨模型選單**：支援「🔄 偵測可用模型」，動態拉取最新可用模型清單。
  - **🛡️ 防送出衝突保護開關**：表單送出後自動鎖定按鈕，防止重複點擊。
  - **🧹 空間維護工具**：一鍵清理已刊登資料與 Google Drive 照片。

---

## 🎯 核心優勢

1. **專責人員 100% 免填 API Key**：
   - Gemini API Key 集中儲存在 Google 試算表後端，發布人員電腦無須輸入任何 Key，零技術門檻且安全無虞。
2. **毫秒級極速帶入（零等待）**：
   - 志工手機填寫 Google 表單送出的瞬間，Google Apps Script 已在雲端背景完成 AI 視覺分析。
   - 專責人員點擊「🚀 一鍵帶入此筆物資」，所有資料於**毫秒級瞬間填入表單**，免除現場等待 AI 辨識的 3~5 秒。
3. **DataTransfer 遠端照片自動掛載（免下載圖檔）**：
   - 透過插件底層權限，自動從 Google Drive 下載照片 Blob，並以 `DataTransfer` API 模擬拖放注入原生 `<input type="file" id="photo1~3">`。
   - **專責人員電腦硬碟完全不需手動下載任何照片！**
4. **雲端空間防滿載維護（防 1GB 表單上限）**：
   - **一鍵清理已刊登**：倒序掃描試算表，自動將所有「已刊登」關聯之 Google Drive 照片移至垃圾桶，並清除資料列，立即釋放表單空間。
   - **單筆安全刪除**：可隨時刪除廢照/廢列，內建防護鎖——**「刊登中」之鎖定項目嚴禁刪除**，防止同仁誤刪。
5. **長青抗老化 Top 2 Flash 自動調度架構**：
   - 取消舊版試算表「系統設定」分頁，後端自動向 Google 取得當前可用 Flash 模型，過濾純語音 (tts) 與生圖變體，按版本數字大小嚴格降冪排列，**常態自動使用最新 (Rank 1) 與次新 (Rank 2) 正式版**。
   - 專責人員在手動點選「🔄 雲端重新辨識」或「🔄 重辨此筆」時，可自由在插件選單指定特定模型覆寫優先順序。

---

## 📂 檔案目錄結構

```
Google試算表整合插件/
├── manifest.json              # Manifest V3 設定檔
├── popup.html                 # 翡翠綠主題佇列瀏覽器 UI (待刊卡片、照片輪播、設定與清理卡片)
├── popup.js                   # 佇列切換、照片中繼下載、模型偵測與一鍵注入發送
├── content.js                 # 智慧填表、KindEditor穿透、DataTransfer 相片注入、防送出保護盾
├── background.js              # Service Worker (跨域請求、GAS API 轉發、照片中繼下載)
├── icons/                     # 翡翠綠試算表圖示 (16x16, 48x48, 128x128)
└── google_apps_script/
    ├── Code.gs                # 部署於 Google 試算表的完整 Apps Script 代碼 (純粹 Top 2 Flash + 空間維護)
    └── SETUP_GUIDE.md         # 5 分鐘表單與試算表零門檻建置指南
```

---

## 🚀 快速安裝與使用步驟

### 步驟 1：部署 Google 表單與試算表
請參考 [`google_apps_script/SETUP_GUIDE.md`](file:///d:/Users/Thomas/Desktop/AI/新增資料夾/扶輪公益網插件/Google試算表整合插件/google_apps_script/SETUP_GUIDE.md) 完成：
1. 建立 Google 表單供外勤志工手機拍照上傳。
2. 建立關聯的 Google 試算表，進入「擴充功能」➔「Apps Script」，貼入 [`Code.gs`](file:///d:/Users/Thomas/Desktop/AI/新增資料夾/扶輪公益網插件/Google試算表整合插件/google_apps_script/Code.gs)。
3. 在專案設定中加入指令碼屬性 `GEMINI_API_KEY`。
4. 設定觸發條件：`onFormSubmit`（表單送出時執行）。
5. 部署為網頁應用程式（存取權選「所有人」），複製 **Web App URL**。

### 步驟 2：在 Chrome 安裝擴充功能
1. 打開 Google Chrome 瀏覽器，前往 `chrome://extensions/`。
2. 開啟右上角 **「開發人員模式」**。
3. 點擊左上角 **「載入未封裝項目」**，選取 `扶輪公益網插件/Google試算表整合插件/` 資料夾。
4. 點擊工具列 🧩 圖示，將翡翠綠圖示釘選至瀏覽器工具列。

### 步驟 3：開始流水線刊登！
1. 點開插件，展開「⚙️ 設定與清理」，貼入 Web App URL 並按「儲存」。
2. 燈號顯示綠色「已連線」，系統即自動同步當前試算表待刊物資。
3. 進入扶輪公益網「刊登資源」網頁 (`goods_add.php`)。
4. 點擊 **「🚀 一鍵帶入此筆物資 (含照片)」**：
   - 品名、一/二級分類、新舊、數量、單價、詳細說明、地址全自動填妥。
   - 照片自動掛載至網頁原生上傳欄位。
5. 輸入右側驗證碼後按刊登，發布成功後自動回寫試算表狀態為「已刊登」！

---

## 🛠️ 維運與配額排查指南 (Quota Troubleshooting)

若後續在大量使用或極端情況下，遇到 **Google Apps Script 每日配額耗盡**（如：每日觸發總執行時間 90 分鐘/天上限、觸發器建立異常）或 **Gemini API 速率上限 (429 RESOURCE_EXHAUSTED)**，請依以下步驟回到 [`Code.gs`](file:///d:/Users/Thomas/Desktop/AI/新增資料夾/扶輪公益網插件/01_電腦端/Google試算表整合插件/google_apps_script/Code.gs) 進行調整：

### 檢查重點與排查位置：
1. **排查點 1：`getPendingItems()` 未辨識統計與呼叫（約第 435~560 列）**
   - 系統會在前端查詢佇列時，若發現有未辨識（狀態為空）或失敗物資，呼叫 `maybeScheduleAutoReprocess(uncompletedCount)` 在背景自動補跑。
   - **應急措施**：若配額嚴重不足，可將 `maybeScheduleAutoReprocess(...)` 呼叫直接註解掉，系統會立即退回「純手動觸發辨識」模式（僅在專責人員或志工點擊重新辨識時才執行）。

2. **排查點 2：`maybeScheduleAutoReprocess()` 智慧單例冷卻模組（約第 570~610 列）**
   - 預設冷卻時間為 5 分鐘 (`const COOLDOWN_MS = 5 * 60 * 1000;`)，並限制專案同時間最多僅有 1 個非同步觸發器 (`processAllPendingRowsAsync`)。
   - **延長冷卻間隔**：可將 `COOLDOWN_MS` 由 5 分鐘拉長至 15 或 30 分鐘，減少每日後端喚醒次數。
   - **完全停用**：在該函式第一行直接加入 `return;` 即可關閉背景自動補跑。

3. **排查點 3：清除殘留觸發器**
   - 若曾手動測試觸發器導致累積，可前往 Google Apps Script 編輯器左側導覽列的 **「觸發條件 (Triggers)」**，手動刪除多餘或異常殘留的觸發器。

