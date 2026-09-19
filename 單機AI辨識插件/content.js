// content.js - 注入至 17rcn.org/goods/goods_add.php
// 負責讀取照片、填寫表單

// 台灣縣市與鄉鎮市區資料庫（對齊 twzipcode.js）
const TW_DISTRICTS = {
  '基隆市': ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
  '臺北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  '新北市': ['萬里區', '金山區', '板橋區', '汐止區', '深坑區', '石碇區', '瑞芳區', '平溪區', '雙溪區', '貢寮區', '新店區', '坪林區', '烏來區', '永和區', '中和區', '土城區', '三峽區', '樹林區', '鶯歌區', '三重區', '新莊區', '泰山區', '林口區', '蘆洲區', '五股區', '八里區', '淡水區', '三芝區', '石門區'],
  '宜蘭縣': ['宜蘭市', '頭城鎮', '礁溪鄉', '壯圍鄉', '員山鄉', '羅東鎮', '三星鄉', '大同鄉', '五結鄉', '冬山鄉', '蘇澳鎮', '南澳鄉', '釣魚臺列嶼'],
  '新竹市': ['東區', '北區', '香山區'],
  '新竹縣': ['竹北市', '湖口鄉', '新豐鄉', '新埔鎮', '關西鎮', '芎林鄉', '寶山鄉', '竹東鎮', '五峰鄉', '橫山鄉', '尖石鄉', '北埔鄉', '峨眉鄉'],
  '桃園市': ['中壢區', '平鎮區', '龍潭區', '楊梅區', '新屋區', '觀音區', '桃園區', '龜山區', '八德區', '大溪區', '復興區', '大園區', '蘆竹區'],
  '苗栗縣': ['竹南鎮', '頭份市', '三灣鄉', '南庄鄉', '獅潭鄉', '後龍鎮', '通霄鎮', '苑裡鎮', '苗栗市', '造橋鄉', '頭屋鄉', '公館鄉', '大湖鄉', '泰安鄉', '銅鑼鄉', '三義鄉', '西湖鄉', '卓蘭鎮'],
  '臺中市': ['中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區'],
  '彰化縣': ['彰化市', '芬園鄉', '花壇鄉', '秀水鄉', '鹿港鎮', '福興鄉', '線西鄉', '和美鎮', '伸港鄉', '員林市', '社頭鄉', '永靖鄉', '埔心鄉', '溪湖鎮', '大村鄉', '埔鹽鄉', '田中鎮', '北斗鎮', '田尾鄉', '埤頭鄉', '溪州鄉', '竹塘鄉', '二林鎮', '大城鄉', '芳苑鄉', '二水鄉'],
  '南投縣': ['南投市', '中寮鄉', '草屯鎮', '國姓鄉', '埔里鎮', '仁愛鄉', '名間鄉', '集集鎮', '水里鄉', '魚池鄉', '信義鄉', '竹山鎮', '鹿谷鄉'],
  '嘉義市': ['東區', '西區'],
  '嘉義縣': ['番路鄉', '梅山鄉', '竹崎鄉', '阿里山鄉', '中埔鄉', '大埔鄉', '水上鄉', '鹿草鄉', '太保市', '朴子市', '東石鄉', '六腳鄉', '新港鄉', '民雄鄉', '大林鎮', '溪口鄉', '義竹鄉', '布袋鎮'],
  '雲林縣': ['斗南鎮', '大埤鄉', '虎尾鎮', '土庫鎮', '褒忠鄉', '東勢鄉', '臺西鄉', '崙背鄉', '麥寮鄉', '斗六市', '林內鄉', '古坑鄉', '莿桐鄉', '西螺鎮', '二崙鄉', '北港鎮', '水林鄉', '口湖鄉', '四湖鄉', '元長鄉'],
  '臺南市': ['中西區', '東區', '南區', '北區', '安平區', '安南區', '永康區', '歸仁區', '新化區', '左鎮區', '玉井區', '楠西區', '南化區', '仁德區', '關廟區', '龍崎區', '官田區', '麻豆區', '佳里區', '西港區', '七股區', '將軍區', '學甲區', '北門區', '新營區', '後壁區', '白河區', '東山區', '六甲區', '下營區', '柳營區', '鹽水區', '善化區', '大內區', '山上區', '新市區', '安定區'],
  '高雄市': ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區', '仁武區', '大社區', '東沙群島', '南沙群島', '岡山區', '路竹區', '阿蓮區', '田寮區', '燕巢區', '橋頭區', '梓官區', '彌陀區', '永安區', '湖內區', '鳳山區', '大寮區', '林園區', '鳥松區', '大樹區', '旗山區', '美濃區', '六龜區', '內門區', '杉林區', '甲仙區', '桃源區', '那瑪夏區', '茂林區', '茄萣區'],
  '屏東縣': ['屏東市', '三地門鄉', '霧臺鄉', '瑪家鄉', '九如鄉', '里港鄉', '高樹鄉', '鹽埔鄉', '長治鄉', '麟洛鄉', '竹田鄉', '內埔鄉', '萬丹鄉', '潮州鎮', '泰武鄉', '來義鄉', '萬巒鄉', '崁頂鄉', '新埤鄉', '南州鄉', '林邊鄉', '東港鎮', '琉球鄉', '佳冬鄉', '新園鄉', '枋寮鄉', '枋山鄉', '春日鄉', '獅子鄉', '車城鄉', '牡丹鄉', '恆春鎮', '滿州鄉'],
  '臺東縣': ['臺東市', '綠島鄉', '蘭嶼鄉', '延平鄉', '卑南鄉', '鹿野鄉', '關山鎮', '海端鄉', '池上鄉', '東河鄉', '成功鎮', '長濱鄉', '太麻里鄉', '金峰鄉', '大武鄉', '達仁鄉'],
  '花蓮縣': ['花蓮市', '新城鄉', '秀林鄉', '吉安鄉', '壽豐鄉', '鳳林鎮', '光復鄉', '豐濱鄉', '瑞穗鄉', '萬榮鄉', '玉里鎮', '卓溪鄉', '富里鄉'],
  '金門縣': ['金沙鎮', '金湖鎮', '金寧鄉', '金城鎮', '烈嶼鄉', '烏坵鄉'],
  '連江縣': ['南竿鄉', '北竿鄉', '莒光鄉', '東引鄉'],
  '澎湖縣': ['馬公市', '西嶼鄉', '望安鄉', '七美鄉', '白沙鄉', '湖西鄉']
};

const TW_COUNTIES = Object.keys(TW_DISTRICTS);

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_form') {
    handleFillForm(message.apiKey, message.address, message.selectedModel)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.action === 'ping') {
    sendResponse({ ready: true });
    return true;
  }
});

// ────────────────────────────────
// 主流程
// ────────────────────────────────
async function handleFillForm(apiKey, address, selectedModel) {
  // Step 1: 收集所有已上傳的圖片
  const images = await collectImages();
  if (images.length === 0) {
    return { success: false, error: '請先上傳至少一張照片，再點擊 AI 自動填寫。' };
  }

  // Step 2: 呼叫 Gemini（透過 background.js）
  let geminiData;
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'call_gemini',
      images,
      apiKey,
      selectedModel
    });
    if (!response.success) throw new Error(response.error);
    geminiData = response.data;
  } catch (err) {
    return { success: false, error: `AI 辨識失敗：${err.message}` };
  }

  // Step 3: 填寫表單
  const filledFields = await fillForm(geminiData, address);

  // Step 4: 儲存歷史記錄
  await saveHistory(geminiData);

  return { success: true, filledFields, geminiData };
}

// ────────────────────────────────
// 讀取照片（1～3 張）→ base64
// ────────────────────────────────
function collectImages() {
  return new Promise(resolve => {
    const photoIds = ['photo1', 'photo2', 'photo3'];
    const promises = photoIds.map(id => {
      const input = document.getElementById(id);
      if (!input || !input.files || !input.files[0]) return Promise.resolve(null);
      return readFileAsBase64(input.files[0]);
    });

    Promise.all(promises).then(results => {
      resolve(results.filter(r => r !== null));
    });
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      // e.target.result = "data:image/jpeg;base64,xxxx"
      const base64 = e.target.result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });
}

// ────────────────────────────────
// 填寫表單
// ────────────────────────────────
async function fillForm(data, address) {
  const filled = [];

  // 1. 資源品名
  if (data.title) {
    const titleInput = document.querySelector('input[name="SR_title"]');
    if (titleInput) {
      setInputValue(titleInput, data.title);
      filled.push('資源品名');
    }
  }

  // 2. 資源類別（一級）
  if (data.category1) {
    const cat1 = document.getElementById('SR_category1');
    if (cat1) {
      cat1.value = String(data.category1);
      // 觸發主世界 jQuery change，以啟動網頁原生 ajaxAddOption 載入第二層
      injectScript(`
        if (window.$) {
          $('#SR_category1').val(${JSON.stringify(String(data.category1))}).trigger('change');
        }
      `);
      triggerEvent(cat1, 'change');
      filled.push('資源類別（一級）');

      // 3. 資源類別（二級）- 等待 AJAX 動態載入後自動設定
      if (data.category2 || data.category2_name) {
        const cat2Filled = await waitAndSetCategory2(data.category2, data.category2_name);
        if (cat2Filled) filled.push('資源類別（二級）');
      }
    }
  }

  // 4. 物資新舊
  if (data.condition) {
    const value = data.condition === 'new' ? '1' : '0';
    const radio = document.querySelector(`input[name="SR_newItem"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
      triggerEvent(radio, 'change');
      filled.push('物資新舊');
    }
  }

  // 5. 詳細說明（自動填入 KindEditor 富文本編輯器）
  if (data.description) {
    const descFilled = await setKindEditorContent(data.description);
    if (descFilled) filled.push('詳細說明');
  }

  // 6. 總數量
  if (data.quantity && data.quantity > 0) {
    const qtyInput = document.getElementById('SR_quantity');
    if (qtyInput) {
      setInputValue(qtyInput, String(data.quantity));
      triggerEvent(qtyInput, 'keyup');
      filled.push('總數量');
    }
  }

  // 7. 預估單價
  if (data.price && data.price > 0) {
    const priceInput = document.getElementById('SR_price');
    if (priceInput) {
      setInputValue(priceInput, String(data.price));
      triggerEvent(priceInput, 'keyup');
      // 觸發小計計算
      triggerEvent(document, 'mousedown');
      filled.push('預估單價');
    }
  }

  // 8. 所在地址（從使用者設定解析）
  if (address && address.trim() !== '') {
    const addrFilled = await fillAddress(address);
    if (addrFilled) filled.push('所在地址');
  }

  // 9. 預設值：媒合期限 = 90天
  const dateRange91 = document.querySelector('input[name="SR_dateRange"][value="91"]');
  if (dateRange91) {
    dateRange91.checked = true;
    filled.push('媒合期限（90天）');
  }

  // 10. 預設值：建議索取方式 = 自取
  const howTake1 = document.querySelector('input[name="SR_howTake[]"][value="1"]');
  if (howTake1) {
    howTake1.checked = true;
    filled.push('建議索取方式（自取）');
  }

  // 11. 預設值：誰能索取 = 任何單位
  const onlyCharity0 = document.querySelector('input[name="SR_onlyCharity"][value="0"]');
  if (onlyCharity0) {
    onlyCharity0.checked = true;
    filled.push('誰能索取（任何單位）');
  }

  return filled;
}

// ────────────────────────────────
// KindEditor 填寫（三重同步：主世界 API + iframe 視覺穿透 + textarea 備援）
// ────────────────────────────────
async function setKindEditorContent(rawText) {
  if (!rawText) return false;
  const html = textToHtml(rawText);

  // 1. 主世界注入（設定 KindEditor 實例，確保 submit 時 editor.html() 有值）
  injectScript(`
    (function() {
      try {
        var html = ${JSON.stringify(html)};
        // 方法 A: 全域 window.editor
        if (window.editor && typeof window.editor.html === 'function') {
          window.editor.html(html);
          window.editor.sync();
        }
        // 方法 B: 遍歷 KindEditor.instances 所有實例
        if (window.KindEditor && window.KindEditor.instances) {
          for (var key in window.KindEditor.instances) {
            try {
              window.KindEditor.instances[key].html(html);
              window.KindEditor.instances[key].sync();
            } catch(e) {}
          }
        }
        // 方法 C: KindEditor 靜態 API
        if (window.KindEditor && typeof window.KindEditor.html === 'function') {
          window.KindEditor.html('#editor1', html);
          window.KindEditor.sync('#editor1');
        }
        // 方法 D: jQuery 同步 val
        if (window.$) {
          $('#editor1').val(html);
        }
      } catch(e) {
        console.warn('[RCN插件] 主世界 KindEditor 設值失敗:', e);
      }
    })();
  `);

  await sleep(200);

  // 2. Content Script DOM 穿透（直接寫入 iframe 視覺層）
  try {
    const iframes = document.querySelectorAll('iframe.ke-edit-iframe, .ke-edit iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument && iframe.contentDocument.body) {
          iframe.contentDocument.body.innerHTML = html;
          iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch(e) {}
    }
  } catch(e) {
    console.warn('[RCN插件] iframe 穿透填寫失敗:', e);
  }

  // 3. 底層 Textarea 同步備援
  const textarea = document.getElementById('editor1');
  if (textarea) {
    textarea.value = html;
    triggerEvent(textarea, 'input');
    triggerEvent(textarea, 'change');
  }

  return true;
}

// 將換行純文字轉為標準 HTML 段落
function textToHtml(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\r?\n\r?\n/)
    .map(para => `<p>${para.replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

// ────────────────────────────────
// 等待 category2 動態載入並設值（支援 ID 精確比對與名稱比對）
// ────────────────────────────────
function waitAndSetCategory2(cat2Id, cat2Name) {
  return new Promise(resolve => {
    const maxWait = 4000;
    const interval = 200;
    let elapsed = 0;
    const targetIdStr = cat2Id ? String(cat2Id) : '';
    const targetName = cat2Name ? cat2Name.trim().toLowerCase() : '';

    const timer = setInterval(() => {
      const cat2 = document.getElementById('SR_category2');
      if (cat2 && cat2.options.length > 1) {
        clearInterval(timer);

        let bestOption = null;

        // 1. 優先以 ID 精確匹配 option.value
        if (targetIdStr) {
          for (const opt of cat2.options) {
            if (opt.value === targetIdStr) {
              bestOption = opt;
              break;
            }
          }
        }

        // 2. 若 ID 未中，以名稱匹配
        if (!bestOption && targetName) {
          for (const opt of cat2.options) {
            const optText = opt.text.trim().toLowerCase();
            if (opt.value && (optText === targetName || optText.includes(targetName) || targetName.includes(optText))) {
              bestOption = opt;
              break;
            }
          }
        }

        if (bestOption) {
          const val = bestOption.value;
          // 主世界 jQuery 與 DOM 雙重設值觸發
          injectScript(`
            if (window.$) {
              $('#SR_category2').val(${JSON.stringify(val)}).trigger('change');
            }
          `);
          cat2.value = val;
          triggerEvent(cat2, 'change');
          resolve(true);
        } else {
          resolve(false);
        }
        return;
      }

      elapsed += interval;
      if (elapsed >= maxWait) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

// ────────────────────────────────
// 地址解析與填寫（twzipcode）
// ────────────────────────────────
async function fillAddress(rawAddress) {
  try {
    const parsed = parseAddress(rawAddress);
    if (!parsed.county) return false;

    // Step 1 & 2: 透過 injectScript 在主世界 (Page World) 呼叫 jQuery 與 twzipcode
    // 網頁上的 twzipcode 產生的是 name="SR_addr1[]" 與 name="SR_addr2[]"
    injectScript(`
      (function() {
        try {
          var county = ${JSON.stringify(parsed.county)};
          var district = ${JSON.stringify(parsed.district)};
          var $addr = $('#addr');
          if (!$addr.length) return;

          // 1. 取得縣市選單（支援 name="SR_addr1[]", name="SR_addr1" 或第 1 個 select）
          var $county = $addr.find('select[name^="SR_addr1"]').length 
            ? $addr.find('select[name^="SR_addr1"]') 
            : $addr.find('select:first');
          if (!$county.length) return;

          // 尋找符合的縣市 option（同時相容 臺 / 台）
          var targetCounty = '';
          $county.find('option').each(function() {
            var val = $(this).val();
            var txt = $(this).text();
            if (val === county || txt === county ||
                val.replace('臺','台') === county.replace('臺','台') ||
                txt.replace('臺','台') === county.replace('臺','台')) {
              targetCounty = val;
              return false;
            }
          });

          if (targetCounty) {
            $county.val(targetCounty).trigger('change');
          }

          // 2. 設定鄉鎮市區（twzipcode 的 change 會同步重建 area 選項）
          if (district) {
            var $area = $addr.find('select[name^="SR_addr2"]').length 
              ? $addr.find('select[name^="SR_addr2"]') 
              : $addr.find('select').eq(1);

            if ($area.length) {
              var targetArea = '';
              // 精準比對
              $area.find('option').each(function() {
                var val = $(this).val();
                var txt = $(this).text();
                if (val === district || txt === district) {
                  targetArea = val;
                  return false;
                }
              });

              // 若未完全符合，去除後綴（市/區/鄉/鎮）比對
              if (!targetArea) {
                var cleanDist = district.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
                $area.find('option').each(function() {
                  var val = $(this).val();
                  var cleanOpt = val.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
                  if (cleanOpt && (cleanOpt === cleanDist || cleanDist.startsWith(cleanOpt) || cleanOpt.startsWith(cleanDist))) {
                    targetArea = val;
                    return false;
                  }
                });
              }

              if (targetArea) {
                $area.val(targetArea).trigger('change');
              }
            }
          }
        } catch (e) {
          console.warn('[RCN插件] 主世界地址填寫異常:', e);
        }
      })();
    `);

    // 等待主世界 twzipcode 事件完成
    await sleep(400);

    // Step 3: Content Script DOM 層備援同步確認
    const addrContainer = document.getElementById('addr');
    if (addrContainer) {
      const selects = addrContainer.querySelectorAll('select');
      if (selects.length >= 2) {
        const countySel = selects[0];
        const areaSel = selects[1];

        // 若縣市尚未選取成功
        if (!countySel.value) {
          for (const opt of countySel.options) {
            if (opt.value === parsed.county || opt.value.replace('臺', '台') === parsed.county.replace('臺', '台')) {
              countySel.value = opt.value;
              countySel.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
          await sleep(250);
        }

        // 若行政區尚未選取成功
        if (parsed.district && !areaSel.value) {
          const cleanDist = parsed.district.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
          for (const opt of areaSel.options) {
            const cleanOpt = opt.value.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
            if (opt.value === parsed.district || cleanOpt === cleanDist) {
              areaSel.value = opt.value;
              areaSel.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    }

    // Step 4: 填寫詳細地址
    if (parsed.detail) {
      const addr3 = document.querySelector('input[name="SR_addr3"]');
      if (addr3) setInputValue(addr3, parsed.detail);
    }

    return true;
  } catch (e) {
    console.warn('[RCN插件] 地址填寫失敗:', e);
    return false;
  }
}

// ────────────────────────────────
// 地址解析：縣市 + 鄉鎮市區 + 詳細地址
// ────────────────────────────────
function parseAddress(raw) {
  if (!raw) return { county: '', district: '', detail: '' };
  let addr = raw.trim().replace(/^\d{3,5}\s*/, ''); // 移除郵遞區號（如有）

  // 1. 比對縣市（優先長字串）
  const counties = TW_COUNTIES.slice().sort((a, b) => b.length - a.length);
  let county = '';
  let rest = addr;

  for (const c of counties) {
    const variants = [c, c.replace('臺', '台'), c.replace('台', '臺')];
    for (const v of variants) {
      if (addr.startsWith(v)) {
        county = c; // 標準化為 TW_DISTRICTS 鍵名（臺...）
        rest = addr.slice(v.length).trim();
        break;
      }
    }
    if (county) break;
  }

  if (!county) return { county: '', district: '', detail: addr };

  // 2. 比對鄉鎮市區（優先使用該縣市完整的行政區清單，相容 臺 / 台）
  let district = '';
  let detail = rest;

  const validDistricts = TW_DISTRICTS[county] || [];
  const sortedDistricts = validDistricts.slice().sort((a, b) => b.length - a.length);

  for (const d of sortedDistricts) {
    const dAlt = d.replace('臺', '台');
    if (rest.startsWith(d)) {
      district = d;
      detail = rest.slice(d.length).trim();
      break;
    } else if (rest.startsWith(dAlt)) {
      district = d;
      detail = rest.slice(dAlt.length).trim();
      break;
    }
  }

  // 若字典比對未中，採用正規表達式備援（支援 2~7 字、包含「市」如竹北市、員林市）
  if (!district) {
    const distMatch = rest.match(/^(.{1,6}?(?:[區鄉鎮]|市(?![0-9])))/);
    if (distMatch) {
      district = distMatch[1];
      detail = rest.slice(district.length).trim();
    }
  }

  return { county, district, detail };
}

// ────────────────────────────────
// 注入 script 到頁面主世界
// ────────────────────────────────
function injectScript(code) {
  const script = document.createElement('script');
  script.textContent = code;
  document.documentElement.appendChild(script);
  script.remove();
}

// ────────────────────────────────
// 工具函式
// ────────────────────────────────
function setInputValue(el, value) {
  // React/jQuery 相容的設值方式
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  );
  if (nativeInputValueSetter) {
    nativeInputValueSetter.set.call(el, value);
  } else {
    el.value = value;
  }
  triggerEvent(el, 'input');
  triggerEvent(el, 'change');
}

function triggerEvent(el, eventName) {
  const event = new Event(eventName, { bubbles: true });
  el.dispatchEvent(event);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ────────────────────────────────
// 儲存歷史記錄
// ────────────────────────────────
async function saveHistory(geminiData) {
  try {
    const stored = await chrome.storage.local.get('rcn_history');
    const history = stored.rcn_history || [];
    history.unshift({
      time: new Date().toISOString(),
      title: geminiData.title || '未知',
      category: (geminiData.category1_name || '') + (geminiData.category2_name ? ' > ' + geminiData.category2_name : ''),
      condition: geminiData.condition === 'new' ? '全新' : '二手',
      quantity: geminiData.quantity || 0,
      price: geminiData.price || 0,
      description: geminiData.description || ''
    });
    // 最多保留 20 筆
    if (history.length > 20) history.length = 20;
    await chrome.storage.local.set({ rcn_history: history });
  } catch (e) {
    console.warn('[RCN插件] 儲存歷史失敗:', e);
  }
}

// ────────────────────────────────
// 防重複送出保護模組 (可開關切換)
// ────────────────────────────────
let isProtectionActive = false;
let isSubmitting = false;
let submitProtectionTimer = null;

function initAntiDoubleSubmit() {
  // 取得設定值（預設開啟）
  chrome.storage.local.get('rcn_anti_double_submit', res => {
    isProtectionActive = res.rcn_anti_double_submit !== false;
    syncProtectionStateToPage(isProtectionActive);
  });

  // 監聽設定變更
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'rcn_anti_double_submit' in changes) {
      isProtectionActive = changes.rcn_anti_double_submit.newValue !== false;
      syncProtectionStateToPage(isProtectionActive);
      if (!isProtectionActive && isSubmitting) {
        resetSubmitState();
      }
    }
  });

  // 綁定表單、按鈕與底層方法攔截
  setupSubmitProtection();
}

function syncProtectionStateToPage(active) {
  injectScript(`
    window.__rcn_anti_double = ${JSON.stringify(active)};
  `);
}

function setupSubmitProtection() {
  const form = document.getElementById('form1');
  const btn = document.getElementById('btn_ad');
  const targetIframe = document.querySelector('iframe[name="jc"]');

  if (!form || !btn) return;

  // 1. 注入主世界：攔截底層 form.submit() 方法（針對 jQuery Validate 與 reCAPTCHA 的直接調用）
  injectScript(`
    (function() {
      var form = document.getElementById('form1');
      if (!form || form.__rcn_patched) return;
      form.__rcn_patched = true;

      var origSubmit = form.submit;
      var isDirectSubmitting = false;
      var lastSubmitTime = 0;

      // 覆寫 form.submit，防止腳本連續呼叫兩次 submit()
      form.submit = function() {
        var now = Date.now();
        if (window.__rcn_anti_double && isDirectSubmitting && (now - lastSubmitTime < 30000)) {
          console.warn('[RCN保護盾] 成功攔截 jQuery Validate / Google reCAPTCHA 雙重送出衝突！');
          return false;
        }

        isDirectSubmitting = true;
        lastSubmitTime = now;

        // 同步通知按鈕進入鎖定狀態
        window.dispatchEvent(new CustomEvent('rcn_direct_submit_fired'));
        return origSubmit.apply(this, arguments);
      };

      // 解鎖函式
      window.__rcn_reset_direct_submit = function() {
        isDirectSubmitting = false;
        lastSubmitTime = 0;
      };
    })();
  `);

  // 監聽來自底層 form.submit 觸發的按鈕鎖定事件
  window.addEventListener('rcn_direct_submit_fired', function() {
    if (isProtectionActive && !isSubmitting) {
      enterSubmittingState(btn);
    }
  });

  // 2. 攔截使用者按鈕點擊（capture 優先攔截手動連點）
  btn.addEventListener('click', function(e) {
    if (!isProtectionActive) return;
    if (isSubmitting) {
      e.preventDefault();
      e.stopImmediatePropagation();
      alertifyToast('⏳ 資料與照片正在上傳中，請勿重複點擊！');
      return false;
    }
  }, true);

  // 3. 監聽表單 submit 事件（使用者點擊 submit 按鈕時）
  form.addEventListener('submit', function(e) {
    if (!isProtectionActive) return;

    if (isSubmitting) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }

    // 檢查驗證碼欄位是否有填，若未填寫則不進入鎖定，交由原生驗證器提示
    const checkword = document.querySelector('input[name="checkword"]');
    if (checkword && !checkword.value.trim()) {
      return;
    }

    enterSubmittingState(btn);
  }, false);

  // 4. 監聽隱藏的 target="jc" iframe 載入完成（代表伺服器已回應）
  if (targetIframe) {
    targetIframe.addEventListener('load', function() {
      if (isSubmitting) {
        setTimeout(() => {
          resetSubmitState();
        }, 1200);
      }
    });
  }
}

function enterSubmittingState(btn) {
  isSubmitting = true;
  const originalText = btn.value || '送出';
  btn.dataset.origValue = originalText;
  btn.value = '⏳ 正在上傳刊登中，請稍候...';
  btn.style.opacity = '0.7';
  btn.style.cursor = 'not-allowed';

  // 注入主世界：覆寫原網頁 setTimeout 2 秒解鎖按鈕的危險行為
  injectScript(`
    (function() {
      if (window.$) {
        var timer = setInterval(function() {
          var $btn = $('#btn_ad');
          if (window.__rcn_submitting) {
            $btn.attr('disabled', true);
          } else {
            clearInterval(timer);
          }
        }, 200);
      }
      window.__rcn_submitting = true;
    })();
  `);

  // 45 秒超時安全保護（若網路中斷避免使用者按鈕永久鎖定）
  if (submitProtectionTimer) clearTimeout(submitProtectionTimer);
  submitProtectionTimer = setTimeout(() => {
    if (isSubmitting) {
      resetSubmitState();
      alertifyToast('⚠️ 上傳等待逾時，已恢復送出按鈕。');
    }
  }, 45000);
}

function resetSubmitState() {
  isSubmitting = false;
  if (submitProtectionTimer) {
    clearTimeout(submitProtectionTimer);
    submitProtectionTimer = null;
  }

  const btn = document.getElementById('btn_ad');
  if (btn) {
    btn.value = btn.dataset.origValue || '送出';
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.disabled = false;
  }

  injectScript(`
    (function() {
      window.__rcn_submitting = false;
      if (typeof window.__rcn_reset_direct_submit === 'function') {
        window.__rcn_reset_direct_submit();
      }
      if (window.$) {
        $('#btn_ad').attr('disabled', false);
      }
    })();
  `);
}

function alertifyToast(msg) {
  try {
    injectScript(`
      if (window.alertify && typeof window.alertify.error === 'function') {
        alertify.error(${JSON.stringify(msg)});
      } else {
        console.log(${JSON.stringify(msg)});
      }
    `);
  } catch(e) {}
}

// 啟動防重複送出保護模組
initAntiDoubleSubmit();
