// background.js - Service Worker
// 負責呼叫 Gemini API（繞過 content script 的 CSP 限制）
// 內建雙保險長青模型架構 (自動動態探測最新 Flash + 介面自訂 + 503/429退避重試 + 404除役自動切換)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'call_gemini') {
    callGemini(message.images, message.apiKey, message.selectedModel)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 保持 channel 開啟（async）
  }

  if (message.action === 'get_models') {
    fetchAvailableModels(message.apiKey)
      .then(models => sendResponse({ success: true, models }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * 向 Google API 動態查詢目前支援 generateContent 的 Flash 模型清單
 */
async function fetchAvailableModels(apiKey) {
  if (!apiKey) throw new Error('請先輸入 API Key');

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.models || !Array.isArray(data.models)) {
    return ['gemini-3.6-flash', 'gemini-3.5-flash'];
  }

  // 1. 基礎過濾：必須支援 generateContent，且排除純語音(tts)、向量(embedding)、問答(aqa)、生圖(image)
  const rawFlashModels = data.models
    .filter(m => {
      const name = (m.name || '').toLowerCase();
      const methods = m.supportedGenerationMethods || [];
      return (
        name.includes('flash') &&
        methods.includes('generateContent') &&
        !name.includes('tts') &&
        !name.includes('embedding') &&
        !name.includes('aqa') &&
        !name.includes('image')
      );
    })
    .map(m => m.name.replace('models/', ''));

  // 2. 分類：標準主力版本 (如 gemini-3.8-flash) vs 其他變體 (如 lite / preview / latest)
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

  // 3. 標準主力版本依版本號數值降冪排序 (3.8 > 3.7 > 3.6 > 3.5 > 2.5 > 1.5)
  standardModels.sort((a, b) => b.version - a.version);

  // 4. 其他變體依字母降冪排序
  variantModels.sort((a, b) => b.localeCompare(a));

  // 5. 合併：標準主力排前面
  const flashModels = [
    ...standardModels.map(item => item.name),
    ...variantModels
  ];

  // 存入快取
  if (flashModels.length > 0) {
    chrome.storage.local.set({
      rcn_available_models: flashModels,
      rcn_models_cached_at: Date.now()
    });
    return flashModels;
  }

  return ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
}

/**
 * 取得本次呼叫的候選模型清單 (雙保險長青架構)
 */
async function getCandidateModels(apiKey, selectedModel) {
  const models = [];

  // 1. 若使用者在介面明確選擇了特定模型（非 auto 且非空），作為第一優先
  if (selectedModel && selectedModel !== 'auto' && selectedModel.trim()) {
    models.push(selectedModel.trim());
  }

  // 2. 檢查本機快取中的可用模型清單
  try {
    const cache = await chrome.storage.local.get(['rcn_available_models', 'rcn_models_cached_at']);
    const isFresh = cache.rcn_models_cached_at && (Date.now() - cache.rcn_models_cached_at < 24 * 60 * 60 * 1000);
    if (isFresh && Array.isArray(cache.rcn_available_models) && cache.rcn_available_models.length > 0) {
      cache.rcn_available_models.forEach(m => {
        if (!models.includes(m)) models.push(m);
      });
    } else if (apiKey) {
      // 快取過期或不存在，嘗試在後台非同步探測
      fetchAvailableModels(apiKey).catch(() => {});
    }
  } catch (e) {}

  // 3. 靜態保底清單（保證永不為空）
  const staticFallbacks = ['gemini-3.6-flash', 'gemini-3.5-flash'];
  staticFallbacks.forEach(m => {
    if (!models.includes(m)) models.push(m);
  });

  return models;
}

/**
 * 呼叫 Gemini Vision (具備多模型自動切換與 503 指數退避重試防護)
 */
async function callGemini(images, apiKey, selectedModel) {
  // 建立多張圖片的 parts
  const imageParts = images.map(img => ({
    inline_data: {
      mime_type: img.mimeType,
      data: img.base64
    }
  }));

  const prompt = `你是一個物資辨識助手。請仔細分析這些照片（可能有多張，代表同一物資的不同角度），以繁體中文回傳符合以下結構的 JSON，不要加任何其他文字或 markdown 標記：

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

  const body = {
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
      responseMimeType: "application/json",
      maxOutputTokens: 4096
    }
  };

  // 取得候選模型清單
  const candidateModels = await getCandidateModels(apiKey, selectedModel);
  console.log('🤖 候選模型嘗試順序：', candidateModels);

  let lastError = null;

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // 每個模型最多嘗試 3 次（應對 503 / 429 短暫塞車，第 3 次拉長間隔）
    const retryDelays = [3000, 8000, 20000]; // 3s, 8s, 20s
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`嘗試模型 [${modelName}] (第 ${attempt} 次)...`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          console.log(`🎉 模型 [${modelName}] 辨識成功！`);
          return safeParseJson(rawText);
        }

        const statusCode = response.status;
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${statusCode}`;

        // 若遇到 503 (Spikes in demand) 或 429 (Too Many Requests)
        if (statusCode === 503 || statusCode === 429) {
          const delay = retryDelays[attempt - 1] || 15000;
          console.warn(`⚠️ 模型 [${modelName}] 暫時繁忙 (${statusCode})，等待 ${delay / 1000} 秒重試...`);
          lastError = new Error(`模型繁忙 (${statusCode}): ${errMsg}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        // 若遇到 404 (模型已除役或不存在)，直接跳出換下一個模型
        if (statusCode === 404) {
          console.warn(`⚠️ 模型 [${modelName}] 不存在或已除役 (404)，切換下一備援模型...`);
          break;
        }

        throw new Error(`Gemini API 錯誤 (${statusCode})：${errMsg}`);

      } catch (fetchErr) {
        lastError = fetchErr;
        console.warn(`模型 [${modelName}] 呼叫出錯：`, fetchErr.message);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  throw lastError || new Error('所有備援模型皆不可用，請稍候再試');
}

// ────────────────────────────────
// 容錯 JSON 解析器（支援修復意外截斷的 JSON）
// ────────────────────────────────
function safeParseJson(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new Error('AI 未回傳任何文字');
  }

  let cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();

  // 1. 標準解析
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // 2. 正則提取完整 JSON 物件
  const fullMatch = cleaned.match(/\{[\s\S]*\}/);
  if (fullMatch) {
    try {
      return JSON.parse(fullMatch[0]);
    } catch (e) {}
  }

  // 3. 自動修復截斷的 JSON
  try {
    let repaired = cleaned;
    const startIdx = repaired.indexOf('{');
    if (startIdx >= 0) {
      repaired = repaired.substring(startIdx);
      // 去除末尾未完成的 key-value 或逗號
      repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, '');
      repaired = repaired.replace(/"[^"]*"\s*:\s*$/, '');
      repaired = repaired.replace(/,\s*$/, '');
      // 引號未閉合則補齊引號
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      // 補齊閉合大括號
      if (!repaired.endsWith('}')) repaired += '}';
      return JSON.parse(repaired);
    }
  } catch (e) {}

  throw new Error(`AI 回傳格式異常：${rawText.substring(0, 120)}`);
}
