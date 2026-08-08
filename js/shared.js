/* GG Bookmark - shared UI helpers (toast, icons) */

window.GG = window.GG || {};

GG.toast = (function () {
  let timeout = null;
  function show(message, type = 'info') {
    let container = document.querySelector('.gg-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'gg-toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'gg-toast ' + type;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 2200);
  }
  return { show };
})();

GG.icons = {
  undo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.82843 6.99955L8.36396 9.53509L6.94975 10.9493L2 5.99955L6.94975 1.0498L8.36396 2.46402L5.82843 4.99955H13C17.4183 4.99955 21 8.58127 21 12.9996C21 17.4178 17.4183 20.9996 13 20.9996H4V18.9996H13C16.3137 18.9996 19 16.3133 19 12.9996C19 9.68584 16.3137 6.99955 13 6.99955H5.82843Z"></path></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  folderOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2H7l-3 6V7z"/><path d="M3 13l3-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  drag: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>',
  folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  backspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9l-6-9z"/><path d="M7 10l6 6M13 10l-6 6"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  fit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9995 13.4995 16.9492 18.4493 12.9995 18.4483 12.9995 22.9995H10.9995L10.9995 18.4478 7.05222 18.4468 11.9995 13.4995ZM10.9995.999512 10.9995 5.54964 7.05026 5.54956 12 10.4995 16.9497 5.54977 12.9995 5.54968V.999512L10.9995.999512Z"></path></svg>',
  fitAuto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18M16 3v18"/><path d="M8 8h8M8 16h8"/><path d="M5 5l3-2M11 5l3-2M5 19l3 2M11 19l3 2M19 5l-3-2M13 5l-3-2M19 19l-3 2M13 19l-3 2"/></svg>',
  fitFixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="14" height="10" rx="2"/><path d="M12 7v10"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  heightAuto: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 3.00012L2.00008 5.00012L4.00004 5.00004L4.00004 19L2 19.0001L2.00008 21.0001L8.00004 21V19H6.00004L6.00004 5.00004L8 5.00012L8.00008 3.00012L2 3.00012ZM10.2 18H12.3541L13.5541 15H18.4459L19.6459 18H21.8L17 6H15L10.2 18ZM16 8.88517L17.6459 13H14.3541L16 8.88517Z"></path></svg>',
  heightAutoOff: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3H20ZM19 5H5V10.999L9 11V13H5V19H19V13H15V11L19 10.999V5ZM12 6L15 9H13V15H15L12 18L9 15H11V9H9L12 6Z"></path></svg>',
  compactOn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 11H4V13H2V11ZM6 11H18V13H6V11ZM20 11H22V13H20V11Z"></path></svg>',
  compactOff: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3C2.44772 3 2 3.44772 2 4V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3H3ZM4 19V5H20V19H4ZM14 7H6V9H14V7ZM18 15V17H10V15H18ZM16 11H8V13H16V11Z"></path></svg>',
  compactAuto:'<svg width="24" xmlns="http://www.w3.org/2000/svg" height="24" id="screenshot-098293a5-cc9c-8016-8008-7108a7f0c7dd" viewBox="0 0 24 24" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1"><g id="shape-098293a5-cc9c-8016-8008-7108a7f0c7dd" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-098293a5-cc9c-8016-8008-7108a7f10fa4" style="display: none;"><g class="fills" id="fills-098293a5-cc9c-8016-8008-7108a7f10fa4"><rect width="24" height="24" x="0" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" style="fill: none;" ry="0" fill="none" rx="0" y="0"/></g></g><g id="shape-098293a5-cc9c-8016-8008-7108a7f14085"><g class="fills" id="fills-098293a5-cc9c-8016-8008-7108a7f14085"><path d="M2,15L4,15L4,17L2,17L2,15ZM6,15L18,15L18,17L6,17L6,15ZM20,15L22,15L22,17L20,17L20,15Z" style="fill: rgb(255, 255, 255); fill-opacity: 1;"/></g></g><g id="shape-098293a5-cc9c-8016-8008-71096501e2ff"><g class="fills" id="fills-098293a5-cc9c-8016-8008-71096501e2ff"><path d="M12,7L15,14"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e1bc51-098293a5-cc9c-8016-8008-71096501e2ff" class="strokes"><g class="stroke-shape"><path d="M12,7L15,14" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g><g id="shape-098293a5-cc9c-8016-8008-710973a0ebac"><g class="fills" id="fills-098293a5-cc9c-8016-8008-710973a0ebac"><path d="M11.949752807617188,7.000030517578125L9.121322631835938,14.071014404296875"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e241f1-098293a5-cc9c-8016-8008-710973a0ebac" class="strokes"><g class="stroke-shape"><path d="M11.949752807617188,7.000030517578125L9.121322631835938,14.071014404296875" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g><g id="shape-098293a5-cc9c-8016-8008-71099a12db1c"><g class="fills" id="fills-098293a5-cc9c-8016-8008-71099a12db1c"><path d="M11,11L14.347564697265625,11.02203369140625"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e2912c-098293a5-cc9c-8016-8008-71099a12db1c" class="strokes"><g class="stroke-shape"><path d="M11,11L14.347564697265625,11.02203369140625" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g></g></svg>',
    heightAuto2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6V4H18V2ZM16.9497 9.44975L12 4.5L7.05273 9.44727L11 9.44826V14.5501L7.05078 14.55L12.0005 19.5L16.9502 14.5503L13 14.5502V9.44876L16.9497 9.44975ZM18 20V22H6V20H18Z"></path></svg>',
    cardMenu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6H21V18H3V6ZM2 4C1.44772 4 1 4.44772 1 5V19C1 19.5523 1.44772 20 2 20H22C22.5523 20 23 19.5523 23 19V5C23 4.44772 22.5523 4 22 4H2ZM13 9H19V11H13V9ZM18 13H13V15H18V13ZM6 13H7V16H9V11H6V13ZM9 8H7V10H9V8Z"></path></svg>',
    bookmark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18.5V5C3 3.34315 4.34315 2 6 2H20C20.5523 2 21 2.44772 21 3V21C21 21.5523 20.5523 22 20 22H6.5C4.567 22 3 20.433 3 18.5ZM19 20V17H6.5C5.67157 17 5 17.6716 5 18.5C5 19.3284 5.67157 20 6.5 20H19ZM10 4H6C5.44772 4 5 4.44772 5 5V15.3368C5.45463 15.1208 5.9632 15 6.5 15H19V4H17V12L13.5 10L10 12V4Z"></path></svg>',
    addCard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 11H7V13H11V17H13V13H17V11H13V7H11V11Z"></path></svg>',
    return: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.0003 13.0001L22.0004 11.0002L5.82845 11.0002L9.77817 7.05044L8.36396 5.63623L2 12.0002L8.36396 18.3642L9.77817 16.9499L5.8284 13.0002L22.0003 13.0001Z"></path></svg>',
    foldUp:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 13.9142L16.7929 18.7071L18.2071 17.2929L12 11.0858L5.79289 17.2929L7.20711 18.7071L12 13.9142ZM6 7L18 7V9L6 9L6 7Z"></path></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',

};

GG.icon = function (name) {
  return GG.icons[name] || '';
};

/* ---- favicon 本地缓存 ----
 * favicon 图片获取成功后按「来源 + 网站 url」缓存到 chrome.storage.local，
 * 同时在内存里保留一份（同页面零延迟命中）。下次渲染直接读缓存，不再请求网络。
 * 缓存键：favicon:<source>:<url>，值为图片的 data URL。
 */
const FAV_CACHE_PREFIX = 'favicon:';
const favMemCache = new Map();          // key -> dataURL  （内存一级缓存）
const favStorage = GG.api && GG.api.storage; // chrome.storage.local

function favKey(source, url) {
  return FAV_CACHE_PREFIX + (source || '') + ':' + (url || '');
}

// 从持久化缓存加载单个键到内存
async function favLoadFromStorage(key) {
  if (!favStorage) return null;
  try {
    const data = await favStorage.get(key);
    const val = data && data[key];
    if (val) favMemCache.set(key, val);
    return val || null;
  } catch (e) {
    return null;
  }
}

// 把获取到的图片数据写入两级缓存（若仍处于该来源/该 key 有效）
function favStore(key, dataURL) {
  favMemCache.set(key, dataURL);
  if (favStorage) {
    favStorage.set({ [key]: dataURL }).catch(() => {});
  }
}

// 下载图片并转成 data URL（需要扩展的 <all_urls> 跨域权限）
async function favToDataURL(src) {
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || 'image/png';
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

// 渲染到图标节点：同步优先读内存缓存；未命中则显示首字母占位并异步获取/缓存。
GG.renderFavicon = function (container, url, title, source) {
  container.innerHTML = '';
  const letter = (title || '?').charAt(0);
  const showLetter = () => {
    const s = document.createElement('span');
    s.className = 'letter';
    s.textContent = letter;
    container.appendChild(s);
  };
  const showImg = (dataURL) => {
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataURL;
    container.appendChild(img);
  };
  const src = GG.faviconUrl ? GG.faviconUrl(url, source) : '';
  if (!src) {
    showLetter();
    return;
  }
  const key = favKey(source, url);

  // 1) 内存缓存命中 -> 立即显示
  if (favMemCache.has(key)) {
    showImg(favMemCache.get(key));
    return;
  }

  // 2) 未命中：显示首字母占位，异步尝试（持久化缓存 -> 网络 -> 写缓存）
  showLetter();
  (async () => {
    const cached = await favLoadFromStorage(key);
    if (cached) { showImg(cached); return; }
    // 请求网络
    const img = new Image();
    const timer = setTimeout(() => { img.remove(); }, GG.FAVICON_TIMEOUT);
    img.onload = () => {
      clearTimeout(timer);
      // 用原 src 转 data URL 并缓存
      favToDataURL(src).then((dataURL) => {
        if (dataURL) {
          favStore(key, dataURL);
          // 仅当容器里仍是占位字母时替换为图标
          if (container.querySelector('.letter')) showImg(dataURL);
        }
      });
    };
    img.onerror = () => {
      clearTimeout(timer);
      // 失败：显示首字母（已在占位），不缓存
    };
    img.src = src;
  })();
};
