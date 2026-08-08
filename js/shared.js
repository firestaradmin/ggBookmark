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
    panelSide: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5H5V19H11V5ZM13 5V19H19V5H13ZM4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3Z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    backspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9l-6-9z"/><path d="M7 10l6 6M13 10l-6 6"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z"></path></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.41421 15.89L16.5563 5.74785L15.1421 4.33363L5 14.4758V15.89H6.41421ZM7.24264 17.89H3V13.6473L14.435 2.21231C14.8256 1.82179 15.4587 1.82179 15.8492 2.21231L18.6777 5.04074C19.0682 5.43126 19.0682 6.06443 18.6777 6.45495L7.24264 17.89ZM3 19.89H21V21.89H3V19.89Z"></path></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    fit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9995 13.4995 16.9492 18.4493 12.9995 18.4483 12.9995 22.9995H10.9995L10.9995 18.4478 7.05222 18.4468 11.9995 13.4995ZM10.9995.999512 10.9995 5.54964 7.05026 5.54956 12 10.4995 16.9497 5.54977 12.9995 5.54968V.999512L10.9995.999512Z"></path></svg>',
    fitAuto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18M16 3v18"/><path d="M8 8h8M8 16h8"/><path d="M5 5l3-2M11 5l3-2M5 19l3 2M11 19l3 2M19 5l-3-2M13 5l-3-2M19 19l-3 2M13 19l-3 2"/></svg>',
    fitFixed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="14" height="10" rx="2"/><path d="M12 7v10"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    heightAuto: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 3.00012L2.00008 5.00012L4.00004 5.00004L4.00004 19L2 19.0001L2.00008 21.0001L8.00004 21V19H6.00004L6.00004 5.00004L8 5.00012L8.00008 3.00012L2 3.00012ZM10.2 18H12.3541L13.5541 15H18.4459L19.6459 18H21.8L17 6H15L10.2 18ZM16 8.88517L17.6459 13H14.3541L16 8.88517Z"></path></svg>',
    heightAutoOff: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3H20ZM19 5H5V10.999L9 11V13H5V19H19V13H15V11L19 10.999V5ZM12 6L15 9H13V15H15L12 18L9 15H11V9H9L12 6Z"></path></svg>',
    compactOn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 11H4V13H2V11ZM6 11H18V13H6V11ZM20 11H22V13H20V11Z"></path></svg>',
    compactOff: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3C2.44772 3 2 3.44772 2 4V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3H3ZM4 19V5H20V19H4ZM14 7H6V9H14V7ZM18 15V17H10V15H18ZM16 11H8V13H16V11Z"></path></svg>',
    compactAuto: '<svg width="24" xmlns="http://www.w3.org/2000/svg" height="24" id="screenshot-098293a5-cc9c-8016-8008-7108a7f0c7dd" viewBox="0 0 24 24" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1"><g id="shape-098293a5-cc9c-8016-8008-7108a7f0c7dd" rx="0" ry="0" style="fill: rgb(0, 0, 0);"><g id="shape-098293a5-cc9c-8016-8008-7108a7f10fa4" style="display: none;"><g class="fills" id="fills-098293a5-cc9c-8016-8008-7108a7f10fa4"><rect width="24" height="24" x="0" transform="matrix(1.000000, 0.000000, 0.000000, 1.000000, 0.000000, 0.000000)" style="fill: none;" ry="0" fill="none" rx="0" y="0"/></g></g><g id="shape-098293a5-cc9c-8016-8008-7108a7f14085"><g class="fills" id="fills-098293a5-cc9c-8016-8008-7108a7f14085"><path d="M2,15L4,15L4,17L2,17L2,15ZM6,15L18,15L18,17L6,17L6,15ZM20,15L22,15L22,17L20,17L20,15Z" style="fill: rgb(255, 255, 255); fill-opacity: 1;"/></g></g><g id="shape-098293a5-cc9c-8016-8008-71096501e2ff"><g class="fills" id="fills-098293a5-cc9c-8016-8008-71096501e2ff"><path d="M12,7L15,14"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e1bc51-098293a5-cc9c-8016-8008-71096501e2ff" class="strokes"><g class="stroke-shape"><path d="M12,7L15,14" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g><g id="shape-098293a5-cc9c-8016-8008-710973a0ebac"><g class="fills" id="fills-098293a5-cc9c-8016-8008-710973a0ebac"><path d="M11.949752807617188,7.000030517578125L9.121322631835938,14.071014404296875"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e241f1-098293a5-cc9c-8016-8008-710973a0ebac" class="strokes"><g class="stroke-shape"><path d="M11.949752807617188,7.000030517578125L9.121322631835938,14.071014404296875" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g><g id="shape-098293a5-cc9c-8016-8008-71099a12db1c"><g class="fills" id="fills-098293a5-cc9c-8016-8008-71099a12db1c"><path d="M11,11L14.347564697265625,11.02203369140625"/></g><g id="strokes-a09ec73e-6cfe-8032-8008-710a15e2912c-098293a5-cc9c-8016-8008-71099a12db1c" class="strokes"><g class="stroke-shape"><path d="M11,11L14.347564697265625,11.02203369140625" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 1;"/></g></g></g></g></svg>',
    heightAuto2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6V4H18V2ZM16.9497 9.44975L12 4.5L7.05273 9.44727L11 9.44826V14.5501L7.05078 14.55L12.0005 19.5L16.9502 14.5503L13 14.5502V9.44876L16.9497 9.44975ZM18 20V22H6V20H18Z"></path></svg>',
    cardMenu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6H21V18H3V6ZM2 4C1.44772 4 1 4.44772 1 5V19C1 19.5523 1.44772 20 2 20H22C22.5523 20 23 19.5523 23 19V5C23 4.44772 22.5523 4 22 4H2ZM13 9H19V11H13V9ZM18 13H13V15H18V13ZM6 13H7V16H9V11H6V13ZM9 8H7V10H9V8Z"></path></svg>',
    bookmark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18.5V5C3 3.34315 4.34315 2 6 2H20C20.5523 2 21 2.44772 21 3V21C21 21.5523 20.5523 22 20 22H6.5C4.567 22 3 20.433 3 18.5ZM19 20V17H6.5C5.67157 17 5 17.6716 5 18.5C5 19.3284 5.67157 20 6.5 20H19ZM10 4H6C5.44772 4 5 4.44772 5 5V15.3368C5.45463 15.1208 5.9632 15 6.5 15H19V4H17V12L13.5 10L10 12V4Z"></path></svg>',
    addCard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 11H7V13H11V17H13V13H17V11H13V7H11V11Z"></path></svg>',
    return: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.0003 13.0001L22.0004 11.0002L5.82845 11.0002L9.77817 7.05044L8.36396 5.63623L2 12.0002L8.36396 18.3642L9.77817 16.9499L5.8284 13.0002L22.0003 13.0001Z"></path></svg>',
    foldUp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 13.9142L16.7929 18.7071L18.2071 17.2929L12 11.0858L5.79289 17.2929L7.20711 18.7071L12 13.9142ZM6 7L18 7V9L6 9L6 7Z"></path></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    circle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z"></path></svg>',
    close_x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    selectSon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10L8 10V14H4V10ZM4 19V16H8V19H4ZM10 19V16H14V19H10ZM16 19V16H20V19H16ZM16 14V10H20V14H16ZM16 8V5H20V8H16ZM14 5V8H10V5H14ZM14 10V14H10V10H14ZM4 8V5H8V8L4 8ZM3 3C2.44772 3 2 3.44772 2 4V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3H3Z"></path></svg>',
    rename: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10.9042 2.10025L20.8037 3.51446L22.2179 13.414L13.0255 22.6063C12.635 22.9969 12.0019 22.9969 11.6113 22.6063L1.71184 12.7069C1.32131 12.3163 1.32131 11.6832 1.71184 11.2926L10.9042 2.10025ZM11.6113 4.22157L3.83316 11.9997L12.3184 20.485L20.0966 12.7069L19.036 5.28223L11.6113 4.22157ZM13.7327 10.5855C12.9516 9.80448 12.9516 8.53815 13.7327 7.7571C14.5137 6.97606 15.78 6.97606 16.5611 7.7571C17.3421 8.53815 17.3421 9.80448 16.5611 10.5855C15.78 11.3666 14.5137 11.3666 13.7327 10.5855Z"></path></svg>',
};

GG.icon = function (name) {
  return GG.icons[name] || '';
};

/* ---- Custom tooltip driver ----
 * 监听 [data-tip] 元素的 hover，动态创建 .gg-tip 气泡并夹紧到视口内。
 * 默认位置为下方居中；空间不足时自动翻转到上方。鼠标悬浮超过
 * HOVER_DELAY(ms) 后才显示，离开即隐藏。
 * 使用 mouseover/mouseout（冒泡）+ closest 委托，配合 contains 判断
 * 是否仍在元素内，避免鼠标在元素内部移动时气泡闪烁。 */
(function () {
  let tipEl = null;
  let showTimer = null;
  const GAP = 8;            // 气泡与目标元素的间距
  const MARGIN = 6;         // 气泡距视口边缘的最小距离
  const HOVER_DELAY = 500; // 悬浮多久后显示

  // 用鼠标事件坐标定位 tooltip，绕开某些布局下 getBoundingClientRect 异常的问题。
  // 目标：tooltip 显示在鼠标附近（控件下方）。show 前由 mouseover 记录鼠标位置。
  let lastClientX = 0, lastClientY = 0;
  function place(target) {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // 先放到 0,0 强制布局，再测真实尺寸
    tipEl.style.left = '0px';
    tipEl.style.top = '0px';
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;

    // 水平：以鼠标 X 为基准居中，再夹紧到视口内
    let left = lastClientX - tw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));
    // 垂直：鼠标下方
    let top = lastClientY + GAP;
    if (top + th > vh - MARGIN) {
      top = lastClientY - th - GAP;
      if (top < MARGIN) top = MARGIN;
    }
    top = Math.min(top, Math.max(MARGIN, vh - th - MARGIN));
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  function show(target) {
    if (!target || !target.dataset.tip) return;
    hide(); // 先移除旧的，避免连续触发时堆积多个 tooltip
    const el = document.createElement('div');
    el.className = 'gg-tip';
    el.textContent = target.dataset.tip;
    document.body.appendChild(el);
    tipEl = el;
    place(el);
    // rAF 回调前可能已被新的 show/hide 移除，需确认仍是当前元素
    requestAnimationFrame(() => { if (tipEl === el) el.classList.add('show'); });
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }

  function schedule(target) {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    showTimer = setTimeout(() => show(target), HOVER_DELAY);
  }

  // 捕获阶段委托：进入/悬停在 [data-tip] 元素内时安排显示
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target) {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      schedule(target);
    }
  }, true);

  // 离开 [data-tip] 元素（鼠标移到元素外）时才隐藏
  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    const related = e.relatedTarget;
    // 鼠标仍停留在同一 [data-tip] 元素内部则忽略
    if (related && target.contains(related)) return;
    hide();
  }, true);

  // 拖拽/滚动时隐藏，避免气泡残留
  document.addEventListener('scroll', hide, true);
  // 点击/按下时隐藏（覆盖自定义 mousedown 拖拽，如卡片高度手柄）
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('click', hide, true);
  // 拖拽开始时隐藏（拖拽手柄带有 data-tip，拖拽时 tooltip 可能残留）
  document.addEventListener('dragstart', hide, true);
  document.addEventListener('dragend', hide, true);
})();

/* ---- favicon 本地缓存 ----
 * favicon 图片获取成功后按「来源 + 网站 url」缓存到 chrome.storage.local，
 * 同时在内存里保留一份（同页面零延迟命中）。下次渲染直接读缓存，不再请求网络。
 * 缓存键：favicon:<source>:<url>，值为图片的 data URL。
 */
const FAV_CACHE_PREFIX = 'favicon:';
const favMemCache = new Map();          // key -> dataURL  （内存一级缓存）
const favStorage = GG.api && GG.api.storage; // chrome.storage.local
GG.FAVICON_TIMEOUT = 20000; // ms; 图标加载超过该时间仍未成功则放弃，显示首字母

// 用「来源 + 网站主机名」作为缓存键，避免同一站点多个 URL 重复缓存图标
function favKey(source, url) {
  let host = url;
  try { host = new URL(url).host; } catch (e) { /* 保持原样 */ }
  return FAV_CACHE_PREFIX + (source || '') + ':' + host;
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
    const fallback = () => {
      if (container.contains(img)) {
        img.remove();
        showLetter();
      }
    };
    // 若缓存/转换出的 dataURL 加载失败，或为 1x1 空白占位图，回退显示首字母
    img.onload = () => { if (img.naturalWidth <= 1 || img.naturalHeight <= 1) fallback(); };
    img.onerror = fallback;
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

  // 2) 未命中：先查持久化缓存；否则直接用网络 URL 加载（成功即显示，失败显示字母），
  //    成功后后台转 dataURL 写入缓存，下次命中缓存直接显示。
  showLetter();
  (async () => {
    const cached = await favLoadFromStorage(key);
    if (cached) { showImg(cached); return; }
    // 直接加载网络 URL（避免先字母后空白：成功就是图，失败就字母）
    const img = new Image();
    const timer = setTimeout(() => { img.remove(); if (!container.querySelector('img')) showLetter(); }, GG.FAVICON_TIMEOUT);
    img.onload = () => {
      clearTimeout(timer);
      // 某些服务对无 favicon 的站点返回 1x1 空白占位图，视为无效，回退字母
      if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
        showLetter();
        return;
      }
      // 显示原始网络图（img 已加载，直接 append 显示）
      showImg(img.src);
      // 后台转 dataURL 缓存
      favToDataURL(src).then((dataURL) => { if (dataURL) favStore(key, dataURL); });
    };
    img.onerror = () => {
      clearTimeout(timer);
      showLetter(); // 加载失败：显示首字母
    };
    img.src = src;
  })();
};

/* ---- 可复用书签编辑浮动窗口 ----
 * 用法：
 *   GG.bookmarkEditor.open({
 *     title: '当前名称', url: '当前链接',
 *     onSave: async (data) => {  data = {title, url} 调用方保存并刷新 
 *   });
 * 居中浮动、毛玻璃、名称+链接输入、保存/取消。
 */
GG.bookmarkEditor = (function () {
  let overlay = null;

  function open(opts) {
    opts = opts || {};
    if (overlay) close();

    overlay = document.createElement('div');
    overlay.className = 'gg-editor-overlay';

    const box = document.createElement('div');
    box.className = 'gg-editor';

    const head = document.createElement('div');
    head.className = 'gg-editor-head';
    const hTitle = document.createElement('div');
    hTitle.className = 'gg-editor-title';
    hTitle.textContent = opts.titleOnly ? '编辑名称' : '编辑书签';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gg-editor-close';
    closeBtn.innerHTML = GG.icon('close_x');
    closeBtn.title = '关闭';
    head.append(hTitle, closeBtn);

    const body = document.createElement('div');
    body.className = 'gg-editor-body';

    const nameField = field('名称', opts.title || '');
    body.append(nameField.wrap);
    let urlField = null;
    if (!opts.titleOnly) {
      urlField = field('链接', opts.url || '');
      body.append(urlField.wrap);
    }

    const foot = document.createElement('div');
    foot.className = 'gg-editor-foot';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary';
    saveBtn.textContent = '保存';
    foot.append(cancelBtn, saveBtn);

    box.append(head, body, foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function field(label, value) {
      const wrap = document.createElement('div');
      wrap.className = 'gg-editor-field';
      const lb = document.createElement('label');
      lb.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value || '';
      input.spellcheck = false;
      wrap.append(lb, input);
      return { wrap, input };
    }

    nameField.input.focus();
    nameField.input.select();

    function destroy() {
      if (overlay) { overlay.remove(); overlay = null; }
    }
    function save() {
      const title = nameField.input.value.trim();
      if (!opts.titleOnly) {
        const url = urlField.input.value.trim();
        if (!url) { urlField.input.focus(); return; }
        destroy();
        if (opts.onSave) opts.onSave({ title, url });
        return;
      }
      destroy();
      if (opts.onSave) opts.onSave({ title });
    }

    closeBtn.addEventListener('click', destroy);
    cancelBtn.addEventListener('click', destroy);
    saveBtn.addEventListener('click', save);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
    const onKey = (e) => {
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') destroy();
    };
    nameField.input.addEventListener('keydown', onKey);
    urlField.input.addEventListener('keydown', onKey);
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  return { open, close };
})();

/* ---- 可复用新建文件夹浮动窗口 ----
 * 用法：
 *   GG.folderCreator.open({
 *     tree: <书签树节点数组（含 type/children）>,
 *     defaultId: <默认父文件夹 id>,
 *     onSave: (data) => { ... }  // data = { name, parentId }，调用方创建文件夹
 *   });
 * 包含：名称输入 + 树形位置选择（可展开折叠、单选）。
 */
GG.folderCreator = (function () {
  let overlay = null;
  let selectedId = null;

  function open(opts) {
    opts = opts || {};
    if (overlay) close();
    selectedId = opts.defaultId || null;

    overlay = document.createElement('div');
    overlay.className = 'gg-editor-overlay';

    const box = document.createElement('div');
    box.className = 'gg-editor';

    const head = document.createElement('div');
    head.className = 'gg-editor-head';
    const hTitle = document.createElement('div');
    hTitle.className = 'gg-editor-title';
    hTitle.textContent = '新建文件夹';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gg-editor-close';
    closeBtn.innerHTML = GG.icon('close_x');
    closeBtn.title = '关闭';
    head.append(hTitle, closeBtn);

    const body = document.createElement('div');
    body.className = 'gg-editor-body';

    // 名称
    const nameWrap = document.createElement('div');
    nameWrap.className = 'gg-editor-field';
    const nameLb = document.createElement('label');
    nameLb.textContent = '文件夹名称';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = '';
    nameInput.placeholder = '新文件夹';
    nameInput.spellcheck = false;
    nameWrap.append(nameLb, nameInput);

    // 位置
    const locWrap = document.createElement('div');
    locWrap.className = 'gg-editor-field';
    const locLb = document.createElement('label');
    locLb.textContent = '位置（父文件夹）';
    const treeBox = document.createElement('div');
    treeBox.className = 'gg-fc-tree';
    const nodes = (opts.tree && opts.tree[0] && opts.tree[0].children) || opts.tree || [];

    // 判断 selectedId 是否位于 node 的子树内（用于自动展开路径）
    function containsSelected(node) {
      if (selectedId === node.id) return true;
      return (node.children || []).some(containsSelected);
    }

    nodes.forEach((n) => { if (n.type === 'folder' || n.type === undefined) treeBox.appendChild(buildNode(n, 0)); });
    locWrap.append(locLb, treeBox);

    body.append(nameWrap, locWrap);

    const foot = document.createElement('div');
    foot.className = 'gg-editor-foot';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary';
    saveBtn.textContent = '创建';
    foot.append(cancelBtn, saveBtn);

    box.append(head, body, foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    nameInput.focus();

    function buildNode(node, depth) {
      const wrap = document.createElement('div');
      wrap.className = 'gg-fc-node';
      const children = (node.children || []).filter((c) => c.type === 'folder' || c.type === undefined);
      const isSelected = selectedId === node.id;
      const onPath = containsSelected(node); // 该节点是默认位置的路径（含自身）
      const row = document.createElement('div');
      row.className = 'gg-fc-row' + (isSelected ? ' selected' : '');
      row.dataset.id = node.id;
      row.style.paddingLeft = (8 + depth * 14) + 'px';

      const toggle = document.createElement('span');
      if (children.length) {
        // 路径上的节点默认展开，否则折叠
        toggle.className = 'gg-fc-toggle' + (onPath ? '' : ' collapsed');
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
        toggle.addEventListener('click', (e) => { e.stopPropagation(); toggle.classList.toggle('collapsed'); const sub = wrap.querySelector(':scope > .gg-fc-children'); if (sub) sub.classList.toggle('collapsed'); });
      } else {
        toggle.className = 'gg-fc-toggle gg-fc-toggle-empty';
      }

      const ico = document.createElement('span');
      ico.className = 'gg-fc-ico';
      ico.innerHTML = GG.icon('folder');

      const name = document.createElement('span');
      name.className = 'gg-fc-name';
      name.textContent = node.title || '（未命名）';

      row.append(toggle, ico, name);
      row.addEventListener('click', () => {
        selectedId = node.id;
        treeBox.querySelectorAll('.gg-fc-row').forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
      });

      wrap.appendChild(row);
      if (children.length) {
        const sub = document.createElement('div');
        sub.className = 'gg-fc-children' + (onPath ? '' : ' collapsed');
        children.forEach((c) => sub.appendChild(buildNode(c, depth + 1)));
        wrap.appendChild(sub);
      }
      return wrap;
    }

    function destroy() {
      if (overlay) { overlay.remove(); overlay = null; }
    }
    function save() {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      if (!selectedId) { GG.toast.show('请选择文件夹位置', 'info'); return; }
      destroy();
      if (opts.onSave) opts.onSave({ name, parentId: selectedId });
    }

    closeBtn.addEventListener('click', destroy);
    cancelBtn.addEventListener('click', destroy);
    saveBtn.addEventListener('click', save);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) destroy(); });
    const onKey = (e) => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') destroy(); };
    nameInput.addEventListener('keydown', onKey);
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  return { open, close };
})();


