// content.js - 注入至 17rcn.org/goods/goods_add.php (Google 試算表整合版)
// 包含完整 DOM 欄位連動、twzipcode 主世界穿透、KindEditor 富文本注入與 DataTransfer 遠端相片自動注入

// ───────────────────────────────────────────────
// 工具函式
// ───────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function triggerEvent(el, eventType) {
  el.dispatchEvent(new Event(eventType, { bubbles: true }));
}

function setInputValue(el, value) {
  el.value = value;
  triggerEvent(el, 'input');
  triggerEvent(el, 'change');
}

function injectScript(code) {
  try {
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {
    console.warn('[RCN試算表版] 腳本注入失敗:', e);
  }
}

// 當前正在填寫刊登的物資資料與列號
let currentActiveItem = null;
let currentGasUrl = null;

// ───────────────────────────────────────────────
// 訊息監聽 (來自 popup.js)
// ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_sheet_item') {
    // 換筆自動解鎖：若先前已有鎖定中之其他物資，先向 GAS 發送解鎖
    if (currentActiveItem && currentActiveItem.row && message.item && currentActiveItem.row !== message.item.row && currentGasUrl) {
      chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: currentGasUrl,
        apiAction: 'unlockItem',
        payload: { row: currentActiveItem.row }
      });
      console.log(`[RCN試算表版] 換筆填寫，已自動向雲端釋放上一筆 (第 ${currentActiveItem.row} 列) 之鎖定`);
    }

    currentActiveItem = message.item;
    currentGasUrl = message.gasUrl;

    handleFillSheetItem(message.item, message.images || [], message.defaultAddress || '')
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.action === 'unlock_active_item') {
    if (currentActiveItem && currentActiveItem.row && currentGasUrl) {
      chrome.runtime.sendMessage({
        action: 'call_gas',
        gasUrl: currentGasUrl,
        apiAction: 'unlockItem',
        payload: { row: currentActiveItem.row }
      });
      currentActiveItem = null;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: true, message: '無當前鎖定物資' });
    }
    return true;
  }

  if (message.action === 'ping') {
    sendResponse({ ready: true });
    return true;
  }
});

// ───────────────────────────────────────────────
// 核心填表與照片注入流程
// ───────────────────────────────────────────────
async function handleFillSheetItem(item, downloadedImages, defaultAddress) {
  const filledFields = [];

  // 1. 照片注入 (最多 3 張，自動注入 photo1, photo2, photo3)
  if (downloadedImages && downloadedImages.length > 0) {
    const photoSuccessCount = injectImagesToInputs(downloadedImages);
    if (photoSuccessCount > 0) {
      filledFields.push(`已自動掛載 ${photoSuccessCount} 張照片 (上限 3 張)`);
    }
  }

  // 2. 資源品名 (SR_title)
  if (item.title) {
    const titleInput = document.querySelector('input[name="SR_title"]') || document.getElementById('SR_title');
    if (titleInput) {
      setInputValue(titleInput, item.title);
      filledFields.push('資源品名: ' + item.title);
    }
  }

  // 3. 資源分類（一級 SR_category1）
  if (item.category1) {
    const cat1 = document.getElementById('SR_category1') || document.querySelector('select[name="SR_category1"]');
    if (cat1) {
      cat1.value = String(item.category1);
      // 觸發主世界 jQuery change，啟動網頁原生 ajaxAddOption 載入二級分類
      injectScript(`
        if (window.$) {
          $('#SR_category1').val(${JSON.stringify(String(item.category1))}).trigger('change');
        }
      `);
      triggerEvent(cat1, 'change');
      filledFields.push(`一級分類: ${item.category1_name || item.category1}`);

      // 二級分類異步輪詢等待 AJAX 選項載入
      if (item.category2 || item.category2_name) {
        const cat2Filled = await waitAndSetCategory2(item.category2, item.category2_name);
        if (cat2Filled) {
          filledFields.push(`二級分類: ${item.category2_name || item.category2}`);
        }
      }
    }
  }

  // 4. 物資新舊 (SR_newItem: '1' 為全新, '0' 為二手)
  if (item.condition) {
    const condStr = String(item.condition).toLowerCase();
    const isNew = condStr === 'new' || condStr === '1' || condStr === '全新';
    const value = isNew ? '1' : '0';
    const radio = document.querySelector(`input[name="SR_newItem"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
      triggerEvent(radio, 'change');
      filledFields.push(`物資新舊: ${isNew ? '全新' : '二手'}`);
    }
  }

  // 5. 詳細說明 (KindEditor 富文本編輯器三重注入)
  if (item.description) {
    const descFilled = await setKindEditorContent(item.description);
    if (descFilled) filledFields.push('詳細說明');
  }

  // 6. 總數量 (SR_quantity)
  if (item.quantity) {
    const qtyInput = document.getElementById('SR_quantity') || document.querySelector('input[name="SR_quantity"]');
    if (qtyInput) {
      const qty = parseInt(item.quantity, 10) || 1;
      setInputValue(qtyInput, String(qty));
      triggerEvent(qtyInput, 'keyup');
      filledFields.push(`總數量: ${qty}`);
    }
  }

  // 7. 預估單價 (SR_price)
  const priceInput = document.getElementById('SR_price') || document.querySelector('input[name="SR_price"]');
  if (priceInput) {
    const price = parseInt(item.price, 10) || 0;
    setInputValue(priceInput, String(price));
    triggerEvent(priceInput, 'keyup');
    triggerEvent(document, 'mousedown'); // 觸發網頁計算小計
    filledFields.push(`預估單價: NT$ ${price}`);
  }

  // 8. 所在地址 (優先用志工填寫的地址，若無則採用設定的預設地址)
  const targetAddress = (item.address && item.address.trim() !== '') ? item.address.trim() : (defaultAddress ? defaultAddress.trim() : '');
  if (targetAddress) {
    const addrFilled = await fillAddress(targetAddress);
    if (addrFilled) filledFields.push(`所在地址: ${targetAddress}`);
  }

  // 9. 媒合期限：預設 90 天 (SR_dateRange = '91')
  const dateRange91 = document.querySelector('input[name="SR_dateRange"][value="91"]');
  if (dateRange91) {
    dateRange91.checked = true;
    triggerEvent(dateRange91, 'change');
    filledFields.push('媒合期限: 90天');
  }

  // 10. 建議索取方式：預設自送 (SR_howTake[] = '2')
  const howTake2 = document.querySelector('input[name="SR_howTake[]"][value="2"]');
  if (howTake2) {
    howTake2.checked = true;
    triggerEvent(howTake2, 'change');
    filledFields.push('建議索取方式: 自送');
  }

  // 11. 誰能索取：預設任何單位皆可 (SR_onlyCharity = '0')
  const onlyCharity0 = document.querySelector('input[name="SR_onlyCharity"][value="0"]');
  if (onlyCharity0) {
    onlyCharity0.checked = true;
    triggerEvent(onlyCharity0, 'change');
    filledFields.push('誰能索取: 任何單位皆可');
  }

  // 提示通知
  let toastMsg = `✅ 已自動帶入「${item.title || '物資'}」及所有預設選項！`;
  if (downloadedImages && downloadedImages.length > 3) {
    toastMsg += `（志工上傳了 ${downloadedImages.length} 張照片，已自動掛載前 3 張）`;
  }
  toastMsg += ` 請輸入右側驗證碼後送出。`;
  showToast(toastMsg);

  return { success: true, filledFields };
}

// ───────────────────────────────────────────────
// DataTransfer 遠端照片自動注入 (自動取前 3 張)
// ───────────────────────────────────────────────
function injectImagesToInputs(images) {
  let count = 0;
  const photoIds = ['photo1', 'photo2', 'photo3'];

  // 最多注入 3 張
  const imagesToInject = images.slice(0, 3);

  imagesToInject.forEach((imgData, index) => {
    const inputId = photoIds[index];
    const input = document.getElementById(inputId);
    if (!input) return;

    try {
      const blob = base64ToBlob(imgData.base64, imgData.mimeType || 'image/jpeg');
      const file = new File([blob], imgData.filename || `goods_${index + 1}.jpg`, {
        type: imgData.mimeType || 'image/jpeg',
        lastModified: Date.now()
      });

      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;

      input.dispatchEvent(new Event('change', { bubbles: true }));
      count++;
    } catch (e) {
      console.warn(`注入照片至 #${inputId} 失敗:`, e);
    }
  });

  return count;
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// ───────────────────────────────────────────────
// 二級分類異步輪詢等待與雙重比對
// ───────────────────────────────────────────────
function waitAndSetCategory2(cat2Id, cat2Name, maxWaitMs = 5000) {
  return new Promise(resolve => {
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

        // 2. 名稱匹配
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
      if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

// ───────────────────────────────────────────────
// KindEditor 富文本編輯器三重注入
// ───────────────────────────────────────────────
async function setKindEditorContent(rawText) {
  if (!rawText) return false;
  const html = textToHtml(rawText);

  // 1. 主世界 API 注入
  injectScript(`
    (function() {
      try {
        var html = ${JSON.stringify(html)};
        if (window.editor && typeof window.editor.html === 'function') {
          window.editor.html(html);
          window.editor.sync();
        }
        if (window.KindEditor && window.KindEditor.instances) {
          for (var key in window.KindEditor.instances) {
            try {
              window.KindEditor.instances[key].html(html);
              window.KindEditor.instances[key].sync();
            } catch(e) {}
          }
        }
        if (window.KindEditor && typeof window.KindEditor.html === 'function') {
          window.KindEditor.html('#editor1', html);
          window.KindEditor.sync('#editor1');
        }
        if (window.$) {
          $('#editor1').val(html);
        }
      } catch(e) {}
    })();
  `);

  await sleep(200);

  // 2. iframe DOM 穿透
  try {
    const keIframe = document.querySelector('.ke-edit-iframe');
    if (keIframe && keIframe.contentDocument && keIframe.contentDocument.body) {
      keIframe.contentDocument.body.innerHTML = html;
    }
  } catch (e) {}

  // 3. 原生 textarea 備援
  const textarea = document.getElementById('editor1') || document.querySelector('textarea[name="SR_explain"]');
  if (textarea) {
    textarea.value = html;
    triggerEvent(textarea, 'change');
  }

  return true;
}

function textToHtml(text) {
  return text.split('\n').map(line => `<p>${escapeHtml(line.trim())}</p>`).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ───────────────────────────────────────────────
// 地址解析與 twzipcode 主世界連動填寫
// ───────────────────────────────────────────────
async function fillAddress(rawAddress) {
  try {
    const parsed = parseAddress(rawAddress);
    if (!parsed.county) return false;

    // 1. 主世界 jQuery + twzipcode 操作
    injectScript(`
      (function() {
        try {
          var county = ${JSON.stringify(parsed.county)};
          var district = ${JSON.stringify(parsed.district)};
          var $addr = $('#addr');
          if (!$addr.length) return;

          var $county = $addr.find('select[name^="SR_addr1"]').length 
            ? $addr.find('select[name^="SR_addr1"]') 
            : $addr.find('select:first');
          if (!$county.length) return;

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

          if (district) {
            var $area = $addr.find('select[name^="SR_addr2"]').length 
              ? $addr.find('select[name^="SR_addr2"]') 
              : $addr.find('select').eq(1);

            if ($area.length) {
              var targetArea = '';
              $area.find('option').each(function() {
                var val = $(this).val();
                var txt = $(this).text();
                if (val === district || txt === district) {
                  targetArea = val;
                  return false;
                }
              });

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
        } catch (e) {}
      })();
    `);

    await sleep(400);

    // 2. Content Script DOM 備援確認
    const addrContainer = document.getElementById('addr');
    if (addrContainer) {
      const selects = addrContainer.querySelectorAll('select');
      if (selects.length >= 2) {
        const countySel = selects[0];
        const areaSel = selects[1];

        if (!countySel.value) {
          for (const opt of countySel.options) {
            if (opt.value === parsed.county || opt.value.replace('臺', '台') === parsed.county.replace('臺', '台')) {
              countySel.value = opt.value;
              triggerEvent(countySel, 'change');
              break;
            }
          }
          await sleep(250);
        }

        if (parsed.district && !areaSel.value) {
          const cleanDist = parsed.district.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
          for (const opt of areaSel.options) {
            const cleanOpt = opt.value.replace(/[市區鄉鎮]/g, '').replace('臺', '台');
            if (opt.value === parsed.district || cleanOpt === cleanDist) {
              areaSel.value = opt.value;
              triggerEvent(areaSel, 'change');
              break;
            }
          }
        }
      }
    }

    // 3. 填寫路名詳細地址 (SR_addr3)
    if (parsed.detail) {
      const addr3 = document.querySelector('input[name="SR_addr3"]');
      if (addr3) setInputValue(addr3, parsed.detail);
    }

    return true;
  } catch (e) {
    console.warn('[RCN試算表版] 地址填寫失敗:', e);
    return false;
  }
}

// 台灣縣市與鄉鎮區資料庫
const TW_DISTRICTS_DATA = {
  '基隆市': ['仁愛區', '信義區', '中正區', '中山區', '安樂區', '暖暖區', '七堵區'],
  '臺北市': ['中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'],
  '新北市': ['萬里區', '金山區', '板橋區', '汐止區', '深坑區', '石碇區', '瑞芳區', '平溪區', '雙溪區', '貢寮區', '新店區', '坪林區', '烏來區', '永和區', '中和區', '土城區', '三峽區', '樹林區', '鶯歌區', '三重區', '新莊區', '泰山區', '林口區', '蘆洲區', '五股區', '八里區', '淡水區', '三芝區', '石門區'],
  '宜蘭縣': ['宜蘭市', '頭城鎮', '礁溪鄉', '壯圍鄉', '員山鄉', '羅東鎮', '三星鄉', '大同鄉', '五結鄉', '冬山鄉', '蘇澳鎮', '南澳鄉'],
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
  '高雄市': ['新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區', '仁武區', '大社區', '岡山區', '路竹區', '阿蓮區', '田寮區', '燕巢區', '橋頭區', '梓官區', '彌陀區', '永安區', '湖內區', '鳳山區', '大寮區', '林園區', '鳥松區', '大樹區', '旗山區', '美濃區', '六龜區', '內門區', '杉林區', '甲仙區', '桃源區', '那瑪夏區', '茂林區', '茄萣區'],
  '屏東縣': ['屏東市', '三地門鄉', '霧臺鄉', '瑪家鄉', '九如鄉', '里港鄉', '高樹鄉', '鹽埔鄉', '長治鄉', '麟洛鄉', '竹田鄉', '內埔鄉', '萬丹鄉', '潮州鎮', '泰武鄉', '來義鄉', '萬巒鄉', '崁頂鄉', '新埤鄉', '南州鄉', '林邊鄉', '東港鎮', '琉球鄉', '佳冬鄉', '新園鄉', '枋寮鄉', '枋山鄉', '春日鄉', '獅子鄉', '車城鄉', '牡丹鄉', '恆春鎮', '滿州鄉'],
  '臺東縣': ['臺東市', '綠島鄉', '蘭嶼鄉', '延平鄉', '卑南鄉', '鹿野鄉', '關山鎮', '海端鄉', '池上鄉', '東河鄉', '成功鎮', '長濱鄉', '太麻里鄉', '金峰鄉', '大武鄉', '達仁鄉'],
  '花蓮縣': ['花蓮市', '新城鄉', '秀林鄉', '吉安鄉', '壽豐鄉', '鳳林鎮', '光復鄉', '豐濱鄉', '瑞穗鄉', '萬榮鄉', '玉里鎮', '卓溪鄉', '富里鄉'],
  '金門縣': ['金沙鎮', '金湖鎮', '金寧鄉', '金城鎮', '烈嶼鄉', '烏坵鄉'],
  '連江縣': ['南竿鄉', '北竿鄉', '莒光鄉', '東引鄉'],
  '澎湖縣': ['馬公市', '西嶼鄉', '望安鄉', '七美鄉', '白沙鄉', '湖西鄉']
};

function parseAddress(raw) {
  if (!raw) return { county: '', district: '', detail: '' };
  let addr = raw.trim().replace(/^\d{3,5}\s*/, '');

  let foundCounty = '';
  for (const c of Object.keys(TW_DISTRICTS_DATA)) {
    if (addr.startsWith(c) || addr.startsWith(c.replace('臺', '台'))) {
      foundCounty = c;
      addr = addr.slice(c.length).trim();
      break;
    }
  }

  let foundDistrict = '';
  if (foundCounty) {
    const districts = TW_DISTRICTS_DATA[foundCounty] || [];
    for (const d of districts) {
      if (addr.startsWith(d) || addr.startsWith(d.replace('臺', '台'))) {
        foundDistrict = d;
        addr = addr.slice(d.length).trim();
        break;
      }
    }
  }

  return { county: foundCounty, district: foundDistrict, detail: addr };
}

// ───────────────────────────────────────────────
// 浮動 Toast 提示
// ───────────────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('rcn-sheets-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rcn-sheets-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0f9d58;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.25);
      z-index: 999999;
      font-size: 14px;
      font-weight: bold;
      transition: opacity 0.3s;
      max-width: 380px;
      line-height: 1.4;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 7000);
}

// ───────────────────────────────────────────────
// 監聽刊登成功 (jc iframe 載入 + 雙軌精準判定)
// ───────────────────────────────────────────────
let lastAlertMessage = null;
let lastAlertTime = 0;
let submitErrorDetected = false;

// 注入主世界攔截 alert 訊息（精準捕捉「驗證碼錯誤」等原生警告）
injectScript(`
  (function() {
    var origAlert = window.alert;
    window.alert = function(msg) {
      window.dispatchEvent(new CustomEvent('rcn_page_alert', { detail: { message: String(msg) } }));
      return origAlert.apply(this, arguments);
    };
  })();
`);

window.addEventListener('rcn_page_alert', (e) => {
  const msg = e.detail?.message || '';
  lastAlertMessage = msg;
  lastAlertTime = Date.now();
  
  const lower = msg.toLowerCase();
  if (lower.includes('驗證碼') || lower.includes('不正確') || lower.includes('錯誤') || lower.includes('失敗') || lower.includes('請輸入') || lower.includes('請填寫')) {
    submitErrorDetected = true;
    console.warn('[RCN試算表版] 攔截到發布異常 alert 警告:', msg);
    resetSubmitState();
  }
});

(function initPublishSuccessListener() {
  const jcIframe = document.querySelector('iframe[name="jc"]');
  if (jcIframe) {
    jcIframe.addEventListener('load', () => {
      // 1. 檢查近 3.5 秒內是否有錯誤 Alert
      const hasRecentErrorAlert = submitErrorDetected || ((Date.now() - lastAlertTime < 3500) && (
        lastAlertMessage && (
          lastAlertMessage.includes('驗證碼') ||
          lastAlertMessage.includes('不正確') ||
          lastAlertMessage.includes('錯誤') ||
          lastAlertMessage.includes('失敗')
        )
      ));

      // 2. 檢查 iframe 內部文字 (同源讀取)
      let iframeText = '';
      try {
        if (jcIframe.contentDocument && jcIframe.contentDocument.body) {
          iframeText = jcIframe.contentDocument.body.innerText || jcIframe.contentDocument.documentElement.innerHTML || '';
        }
      } catch (e) {}

      const hasErrorInIframe = iframeText.includes('驗證碼') || 
                               iframeText.includes('不正確') || 
                               iframeText.includes('錯誤') || 
                               iframeText.includes('失敗') ||
                               iframeText.includes('history.back');

      // 若偵測到任何錯誤，絕對不觸發刊登成功回寫！
      if (hasRecentErrorAlert || hasErrorInIframe) {
        console.warn('[RCN試算表版] 偵測到刊登失敗，阻斷回寫試算表！', { hasRecentErrorAlert, hasErrorInIframe, lastAlertMessage });
        submitErrorDetected = false;
        resetSubmitState();
        showToast(`⚠️ 刊登未成功：${lastAlertMessage || '請檢查驗證碼或必填欄位後重新送出'}`);
        return;
      }

      // 確認成功發布
      if (currentActiveItem && currentActiveItem.row && currentGasUrl) {
        chrome.runtime.sendMessage({
          action: 'item_published_success',
          row: currentActiveItem.row,
          gasUrl: currentGasUrl
        });
        showToast(`🎉 物資「${currentActiveItem.title}」已成功刊登並回寫試算表！`);
        currentActiveItem = null;
      }
      submitErrorDetected = false;
      resetSubmitState();
    });
  }
})();

// ───────────────────────────────────────────────
// 防送出衝突保護盾 (Anti-Double-Submit)
// ───────────────────────────────────────────────
let isProtectionActive = false;
let isSubmitting = false;
let submitProtectionTimer = null;

function initAntiDoubleSubmit() {
  chrome.storage.local.get('rcn_anti_double_submit', res => {
    isProtectionActive = res.rcn_anti_double_submit !== false;
    syncProtectionStateToPage(isProtectionActive);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'rcn_anti_double_submit' in changes) {
      isProtectionActive = changes.rcn_anti_double_submit.newValue !== false;
      syncProtectionStateToPage(isProtectionActive);
      if (!isProtectionActive && isSubmitting) {
        resetSubmitState();
      }
    }
  });

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

  // 1. 注入主世界：攔截底層 form.submit() 方法（防止 jQuery Validate 與 reCAPTCHA 的衝突二次調用）
  injectScript(`
    (function() {
      var form = document.getElementById('form1');
      if (!form || form.__rcn_patched) return;
      form.__rcn_patched = true;

      var origSubmit = form.submit;
      var isDirectSubmitting = false;
      var lastSubmitTime = 0;

      form.submit = function() {
        var now = Date.now();
        if (window.__rcn_anti_double && isDirectSubmitting && (now - lastSubmitTime < 30000)) {
          console.warn('[RCN試算表保護盾] 成功攔截雙重送出衝突！');
          return false;
        }

        isDirectSubmitting = true;
        lastSubmitTime = now;

        window.dispatchEvent(new CustomEvent('rcn_direct_submit_fired'));
        return origSubmit.apply(this, arguments);
      };

      window.__rcn_reset_direct_submit = function() {
        isDirectSubmitting = false;
        lastSubmitTime = 0;
      };
    })();
  `);

  window.addEventListener('rcn_direct_submit_fired', function() {
    if (isProtectionActive && !isSubmitting) {
      enterSubmittingState(btn);
    }
  });

  // 2. 攔截使用者按鈕點擊
  btn.addEventListener('click', function(e) {
    if (!isProtectionActive) return;
    if (isSubmitting) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('⏳ 資料與照片正在上傳中，請勿重複點擊！');
      return false;
    }
  }, true);

  // 3. 監聽表單 submit 事件
  form.addEventListener('submit', function(e) {
    if (!isProtectionActive) return;

    if (isSubmitting) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }

    const checkword = document.querySelector('input[name="checkword"]');
    if (checkword && !checkword.value.trim()) {
      return;
    }

    enterSubmittingState(btn);
  }, false);

  // 4. 監聽隱藏的 target="jc" iframe 載入完成
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

  if (submitProtectionTimer) clearTimeout(submitProtectionTimer);
  submitProtectionTimer = setTimeout(() => {
    if (isSubmitting) {
      resetSubmitState();
      showToast('⚠️ 上傳等待逾時，已恢復送出按鈕。');
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

// 啟動防送出衝突保護
initAntiDoubleSubmit();
