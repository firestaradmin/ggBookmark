/* GG Bookmark - settings page logic */

(() => {
  'use strict';
  const ACCENTS = ['#4f7cff', '#7a5bff', '#00c6a7', '#ff7a59', '#f54d6a', '#ffb84d', '#4f9fff'];
  // 卡片背景预设色：黑白灰基础色 + 多色系淡色（共 8 个）
  const GLASS_COLORS = ['#ffffff', '#e8ecf5', '#8b93a8', '#0c1220', '#dbe7ff', '#ffd9d9', '#dff3e3', '#ffeec2'];
  // 纯色背景预设色：8 个流行的深色系背景色
  const BG_COLORS = ['#141b2d', '#1a1a2e', '#16213e', '#0f3460', '#222831', '#2d1b3d', '#1b263b', '#0b2e1f'];
  const $ = (s) => document.querySelector(s);
  let settings = {};
  // 同步引擎自动维护的元数据字段：保存设置时不得被页面内存旧值覆盖，否则下次同步会误判远端变更。
  const SYNC_META_KEYS = ['lastSyncAt', 'lastRemoteModified', 'lastRemoteETag', 'lastSyncedFingerprint', 'configVersion'];
  // 保存设置：以页面内存 settings 为准，但同步元数据字段强制取 storage 最新值。
  // 这样避免用陈旧的页面内存 settings 整体覆盖 storage 而把它们回退成旧值/undefined，
  // 导致下次同步 remoteChanged 误判为 true → 假冲突。
  async function saveSettingsPreservingSyncMeta(settingsObj) {
    const latest = await GG.api.storage.get('settings');
    const ls = (latest && latest.settings) || {};
    const merged = Object.assign({}, ls, settingsObj);
    for (const k of SYNC_META_KEYS) {
      const strDefault = (k === 'lastSyncedFingerprint' || k === 'lastRemoteETag');
      merged[k] = ls[k] || (strDefault ? '' : 0);
    }
    await GG.saveSettings(merged);
    return merged;
  }
  const PRESET_WALLPAPERS = [
    '1.webp',
    '2.webp',
    '3.webp',
    '4.webp',
    '5.webp',
    '6.webp',
    '7.webp',
    '8.webp',
    '9.webp',
    '10.webp',
    '11.webp',
    '12.webp',
    '13.webp',
    '14.webp',
    '15.webp'
  ];
  let currentPreset = ''; // 当前选中的预设壁纸（preset: 引用），与 #bgUrl 输入框分离
  const PRESET_PREFIX = 'preset:';
  const BLOB_PREFIX = 'blob:'; // 自定义本地图片：settings 只存 blob:文件名 引用，实际图片数据存 IndexedDB
  const COLOR_PREFIX = 'color:'; // 纯色背景：settings 存 color:#hex 引用
  let currentBgColor = ''; // 当前选中的纯色背景色（color:#hex 引用）
  // ---------- 自定义背景图数据（IndexedDB），避免把大 data URL 存进 chrome.storage ----------
  const BG_DB = 'gg-bookmark';
  const BG_STORE = 'backgroundImages';
  function openBgDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BG_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(BG_STORE)) {
          req.result.createObjectStore(BG_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveBgBlob(key, blob) {
    const db = await openBgDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, 'readwrite');
      tx.objectStore(BG_STORE).put({ key, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function getBgBlob(key) {
    const db = await openBgDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, 'readonly');
      const req = tx.objectStore(BG_STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteBgBlob(key) {
    const db = await openBgDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BG_STORE, 'readwrite');
      tx.objectStore(BG_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  // 将 IndexedDB 中的 Blob 转成可用的对象 URL；返回 null 表示无图。
  // 用 object URL（而非超大 data URL）作为 background-image，可支持任意大图片。
  async function bgBlobURL(key) {
    const blob = await getBgBlob(key);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }
  // 把 data: URL 转成 Blob（用于旧数据迁移）
  function dataURLtoBlob(dataURL) {
    const [meta, base64] = dataURL.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function presetNameFromValue(value) {
    return value && value.startsWith(PRESET_PREFIX) ? value.slice(PRESET_PREFIX.length) : null;
  }
  function presetURL(name) {
    return GG.api.runtime.getURL('pics/wallpapers/' + name);
  }
  // 存储/导出时使用预设文件名标识，而非完整 URL
  function presetRef(name) {
    return PRESET_PREFIX + name;
  }
  function colorFromValue(value) {
    return value && value.startsWith(COLOR_PREFIX) ? value.slice(COLOR_PREFIX.length) : null;
  }
  function colorRef(hex) {
    return COLOR_PREFIX + normalizeHex(hex);
  }

  async function applyBgPreview() {
    const bg = $('.gg-bg');
    const bgActive = document.querySelector('.seg-btn[data-bg].active');
    const currentStyle = bgActive ? bgActive.dataset.bg : 'default';
    const blur = Number($('#bgBlur').value) || 0;
    const dim = Number($('#bgDim').value);
    $('#bgBlurVal').textContent = blur + 'px';
    $('#bgDimVal').textContent = dim.toFixed(2);
    bg.style.setProperty('--bg-blur', blur + 'px');
    bg.style.setProperty('--bg-dim', String(dim));
    // 自定义图片从输入框读取；预设壁纸从当前选中项读取，互不干扰
    let raw = currentStyle === 'image' ? $('#bgUrl').value.trim() : currentPreset;
    let objectUrl = null;
    // blob: 引用表示自定义本地图片，从 IndexedDB 取回 Blob 并生成对象 URL（支持大图）
    if (raw && raw.startsWith(BLOB_PREFIX)) {
      objectUrl = await bgBlobURL(raw.slice(BLOB_PREFIX.length));
      raw = objectUrl || '';
    }
    if ((currentStyle === 'image' || currentStyle === 'preset') && raw) {
      const imgUrl = currentStyle === 'preset' ? presetURL(presetNameFromValue(raw)) : raw;
      bg.dataset.style = 'image';
      bg.style.setProperty('--bg-image', `url("${imgUrl}")`);
    } else if (currentStyle === 'gradient') {
      bg.dataset.style = 'gradient';
    } else if (currentStyle === 'color') {
      const hex = colorFromValue(currentBgColor) || $('#bgColor').value || '#141b2d';
      bg.dataset.style = 'color';
      bg.style.setProperty('--bg-color', hex);
    } else {
      bg.dataset.style = 'default';
    }
  }
  function applyCardWidthPreview() {
    const cols = Number($('#cardCols').value) || 5;
    const minW = Number($('#cardMinWidth').value) || 280;
    $('#cardColsVal').textContent = cols + ' 列';
    $('#cardMinWidthVal').textContent = minW + 'px';
    document.documentElement.style.setProperty('--card-cols', String(cols));
    document.documentElement.style.setProperty('--card-min-width', minW + 'px');
  }
  // 磨砂玻璃滑块实时预览：更新显示值并写入 CSS 变量（即时生效）
  function applyGlassPreview() {
    const color = $('#glassColor').value || '#ffeec2';
    const blur = Number($('#glassBlur').value) || 0;
    const op = Number($('#glassOpacity').value);
    const hexEl = $('#glassColorHex');
    if (hexEl && document.activeElement !== hexEl) hexEl.value = color;
    const swatch = $('#ccSwatch');
    if (swatch) swatch.style.background = color;
    $('#glassBlurVal').textContent = blur + 'px';
    $('#glassOpacityVal').textContent = op.toFixed(2);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--glass-blur', blur + 'px');
    document.documentElement.style.setProperty('--panel-bg', `rgba(${r}, ${g}, ${b}, ${op})`);
    // 同步预设色选中态：匹配则高亮对应圆点，否则取消全部选中
    const dots = document.querySelectorAll('#glassColors .color-dot');
    if (dots.length) {
      const cl = color.toLowerCase();
      let matched = false;
      dots.forEach((x) => {
        const hit = x.dataset.color.toLowerCase() === cl;
        x.classList.toggle('active', hit);
        if (hit) matched = true;
      });
      if (!matched) dots.forEach((x) => x.classList.remove('active'));
    }
  }

  // 规范化 hex：支持 #fff / fff / #ffffff / ffffff，非法返回 null
  function normalizeHex(v) {
    let s = (v || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
      s = s.split('').map((c) => c + c).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return '#' + s.toLowerCase();
  }

  // ---------- HSL / RGB / HEX 转换（用于自定义取色器） ----------
  function hexToRgb(hex) {
    const n = normalizeHex(hex);
    if (!n) return null;
    return {
      r: parseInt(n.slice(1, 3), 16),
      g: parseInt(n.slice(3, 5), 16),
      b: parseInt(n.slice(5, 7), 16)
    };
  }
  function rgbToHex(r, g, b) {
    const h = (x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  // ---------- 自定义颜色选择器（RGB 圆形取色） ----------
  let cpState = { h: 0, s: 100, l: 50, hex: '#ffffff' };
  let cpActive = false; // 是否为“拖动中”，避免鼠标事件竞争
  let cpTarget = 'glass'; // 取色器当前目标：'glass' 卡片背景 | 'bg' 纯色背景

  function openColorPicker(hex) {
    const ov = $('#cpOverlay');
    if (!ov) return;
    cpState.hex = normalizeHex(hex) || '#ffffff';
    const rgb = hexToRgb(cpState.hex) || { r: 255, g: 255, b: 255 };
    Object.assign(cpState, rgbToHsl(rgb.r, rgb.g, rgb.b));
    ov.classList.remove('hidden');
    // 等一帧让元素可见后再定位指针（隐藏时 offsetWidth 为 0）
    requestAnimationFrame(() => {
      renderCpWheel();
      renderCpSv();
      renderCpFields();
    });
  }
  function closeColorPicker() {
    const ov = $('#cpOverlay');
    if (ov) ov.classList.add('hidden');
  }
  // 根据车轮事件位置计算 hue（0-360）
  function hueFromEvent(e, el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180
    if (ang < 0) ang += 360;
    return Math.round(ang);
  }
  // 根据 SV 区域事件位置计算 sat/light（0-100）
  function svFromEvent(e, el) {
    const rect = el.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    return { s: Math.round(x * 100), l: Math.round((1 - y) * 100) };
  }
  // 渲染圆环 + hue 指针
  function renderCpWheel() {
    const dot = $('#cpWheelDot');
    if (!dot) return;
    const wrap = $('#cpWheelWrap') || dot.parentElement;
    const size = wrap.offsetWidth || 200;
    const rad = (size / 2) * 0.7;
    const ang = cpState.h * Math.PI / 180;
    const cx = size / 2, cy = size / 2;
    const px = cx + rad * Math.cos(ang);
    const py = cy + rad * Math.sin(ang);
    dot.style.left = px + 'px';
    dot.style.top = py + 'px';
  }
  // 渲染 SV 区域 + 指针，并更新 --cp-h
  function renderCpSv() {
    const sv = $('#cpSv');
    const dot = $('#cpSvDot');
    if (sv) sv.style.setProperty('--cp-h', cpState.h + 'deg');
    if (dot && dot.parentElement) {
      const wrap = dot.parentElement;
      const w = wrap.offsetWidth || 200;
      const h = wrap.offsetHeight || 120;
      dot.style.left = (cpState.s / 100 * w) + 'px';
      dot.style.top = ((1 - cpState.l / 100) * h) + 'px';
    }
  }
  // 渲染数字字段
  function renderCpFields() {
    const hEl = $('#cpH'), sEl = $('#cpS'), lEl = $('#cpL'), hexEl = $('#cpHex');
    if (hEl) hEl.value = cpState.h;
    if (sEl) sEl.value = cpState.s;
    if (lEl) lEl.value = cpState.l;
    if (hexEl) hexEl.value = cpState.hex;
  }
  // 将 cpState 应用为当前卡片背景色（实时预览）
  function applyCpToGlass() {
    const { r, g, b } = hslToRgb(cpState.h, cpState.s, cpState.l);
    cpState.hex = rgbToHex(r, g, b);
    if (cpTarget === 'bg') {
      // 应用到纯色背景
      const input = $('#bgColor');
      if (input) input.value = cpState.hex;
      const hexInput = $('#bgColorHex');
      if (hexInput) hexInput.value = cpState.hex;
      const swatch = $('#ccBgSwatch');
      if (swatch) swatch.style.background = cpState.hex;
      currentBgColor = colorRef(cpState.hex);
      applyBgPreview();
    } else {
      // 应用到卡片背景
      const input = $('#glassColor');
      if (input) input.value = cpState.hex;
      const hexInput = $('#glassColorHex');
      if (hexInput) hexInput.value = cpState.hex;
      applyGlassPreview();
      const swatch = $('#ccSwatch');
      if (swatch) swatch.style.background = cpState.hex;
    }
    renderCpFields();
  }
  // 根据 hex 更新 cpState 并重绘
  function setCpFromHex(hex) {
    const n = normalizeHex(hex);
    if (!n) return false;
    const rgb = hexToRgb(n);
    Object.assign(cpState, rgbToHsl(rgb.r, rgb.g, rgb.b));
    cpState.hex = n;
    renderCpWheel();
    renderCpSv();
    renderCpFields();
    return true;
  }
  function wireColorPicker() {
    const ov = $('#cpOverlay');
    const swatch = $('#ccSwatch');
    if (!ov) return;

    // 打开（卡片背景）
    swatch.addEventListener('click', () => {
      cpTarget = 'glass';
      const cur = $('#glassColor') ? $('#glassColor').value : '#ffeec2';
      openColorPicker(cur);
    });
    // 打开（纯色背景）
    const bgSwatch = $('#ccBgSwatch');
    if (bgSwatch) {
      bgSwatch.addEventListener('click', () => {
        cpTarget = 'bg';
        const cur = $('#bgColor') ? $('#bgColor').value : '#141b2d';
        openColorPicker(cur);
      });
    }
    // 关闭
    $('#cpClose').addEventListener('click', closeColorPicker);
    $('#cpCancel').addEventListener('click', () => {
      // 取消：回填初始色
      setCpFromHex(cpState.hex);
      closeColorPicker();
    });
    $('#cpOk').addEventListener('click', () => {
      applyCpToGlass();
      closeColorPicker();
    });
    ov.addEventListener('click', (e) => { if (e.target === ov) closeColorPicker(); });
    // Esc 关闭
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.classList.contains('hidden')) closeColorPicker(); });
    // 窗口尺寸变化时重绘指针位置
    window.addEventListener('resize', () => {
      if (!ov.classList.contains('hidden')) { renderCpWheel(); renderCpSv(); }
    });

    // 圆环取 hue
    const wheel = $('#cpWheel');
    wheel.addEventListener('mousedown', (e) => {
      cpActive = true;
      cpLastTarget = 'wheel';
      cpState.h = hueFromEvent(e, wheel);
      renderCpWheel(); renderCpSv(); renderCpFields(); applyCpToGlass();
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!cpActive || cpLastTarget !== 'wheel') return;
      if (!ov.classList.contains('hidden')) {
        cpState.h = hueFromEvent(e, wheel);
        renderCpWheel(); renderCpSv(); renderCpFields(); applyCpToGlass();
      }
    });
    document.addEventListener('mouseup', () => { cpActive = false; cpLastTarget = null; });

    // SV 区域取 sat/light
    const svWrap = $('#cpSvWrap');
    svWrap.addEventListener('mousedown', (e) => {
      cpActive = true;
      cpLastTarget = 'sv';
      Object.assign(cpState, svFromEvent(e, svWrap));
      renderCpSv(); renderCpFields(); applyCpToGlass();
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!cpActive || cpLastTarget !== 'sv') return;
      if (!ov.classList.contains('hidden')) {
        Object.assign(cpState, svFromEvent(e, svWrap));
        renderCpSv(); renderCpFields(); applyCpToGlass();
      }
    });

    // 数字字段输入
    const bindNum = (el, key) => {
      el.addEventListener('input', () => {
        let v = Number(el.value);
        if (isNaN(v)) return;
        if (key === 'h') cpState.h = ((v % 360) + 360) % 360;
        else if (key === 's') cpState.s = Math.max(0, Math.min(100, v));
        else cpState.l = Math.max(0, Math.min(100, v));
        renderCpWheel(); renderCpSv(); applyCpToGlass();
      });
    };
    if ($('#cpH')) bindNum($('#cpH'), 'h');
    if ($('#cpS')) bindNum($('#cpS'), 's');
    if ($('#cpL')) bindNum($('#cpL'), 'l');
    if ($('#cpHex')) {
      $('#cpHex').addEventListener('input', () => {
        if (setCpFromHex($('#cpHex').value)) applyCpToGlass();
      });
    }
  }
  let cpLastTarget = null; // 'wheel' | 'sv' | null，区分拖动来源


  function buildSeSelect() {
    const sel = $('#seSelect');
    sel.innerHTML = '';
    Object.entries(GG.SEARCH_ENGINES).forEach(([key, se]) => {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = se.name;
      sel.appendChild(o);
    });
  }

  function buildColors() {
    const c = $('#colors');
    c.innerHTML = '';
    ACCENTS.forEach((color) => {
      const d = document.createElement('span');
      d.className = 'color-dot';
      d.style.background = color;
      d.dataset.color = color;
      if (color === settings.accentColor) d.classList.add('active');
      d.addEventListener('click', () => {
        c.querySelectorAll('.color-dot').forEach((x) => x.classList.remove('active'));
        d.classList.add('active');
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--accent-2', color);
      });
      c.appendChild(d);
    });
  }

  // 卡片背景预设色：点击即应用并写回输入框 / 实时预览，与主题色交互一致
  function buildGlassColors() {
    const c = $('#glassColors');
    if (!c) return;
    c.innerHTML = '';
    GLASS_COLORS.forEach((color) => {
      const d = document.createElement('span');
      d.className = 'color-dot';
      d.style.background = color;
      d.dataset.color = color;
      if (color.toLowerCase() === (settings.glassColor || '').toLowerCase()) d.classList.add('active');
      d.addEventListener('click', () => {
        c.querySelectorAll('.color-dot').forEach((x) => x.classList.remove('active'));
        d.classList.add('active');
        const input = $('#glassColor');
        if (input) input.value = color;
        applyGlassPreview();
      });
      c.appendChild(d);
    });
  }

  // 纯色背景预设色：点击即应用并写回输入框 / 实时预览
  function buildBgColors() {
    const c = $('#bgColors');
    if (!c) return;
    c.innerHTML = '';
    BG_COLORS.forEach((color) => {
      const d = document.createElement('span');
      d.className = 'color-dot';
      d.style.background = color;
      d.dataset.color = color;
      const curHex = colorFromValue(currentBgColor) || ($('#bgColor') ? $('#bgColor').value : '');
      if (color.toLowerCase() === (curHex || '').toLowerCase()) d.classList.add('active');
      d.addEventListener('click', () => {
        c.querySelectorAll('.color-dot').forEach((x) => x.classList.remove('active'));
        d.classList.add('active');
        const input = $('#bgColor');
        if (input) input.value = color;
        const hexInput = $('#bgColorHex');
        if (hexInput) hexInput.value = color;
        const swatch = $('#ccBgSwatch');
        if (swatch) swatch.style.background = color;
        currentBgColor = colorRef(color);
        applyBgPreview();
      });
      c.appendChild(d);
    });
  }

  function buildPresets() {
    const grid = $('#presetGrid');
    grid.innerHTML = '';
    PRESET_WALLPAPERS.forEach((name) => {
      const url = presetURL(name);
      const d = document.createElement('div');
      d.className = 'preset';
      d.dataset.url = url;
      d.dataset.name = name;
      d.title = name;
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.loading = 'lazy';
      d.appendChild(img);
      d.addEventListener('click', () => {
        currentPreset = presetRef(name);
        settings.backgroundImage = currentPreset;
        settings.backgroundStyle = 'preset';
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === 'preset'));
        toggleBgFields();
        applyBgPreview();
        updatePreview();
        markActivePreset();
      });
      grid.appendChild(d);
    });
  }
  function markActivePreset() {
    const sel = presetNameFromValue(currentPreset);
    document.querySelectorAll('#presetGrid .preset').forEach((p) => {
      p.classList.toggle('active', sel ? p.dataset.name === sel : false);
    });
  }

  // ---------- 书签快照 / 还原 ----------
  // 导出时把整个书签树序列化进配置；导入时按路径重建并把卡片的 folderId 重新映射。
  const PATH_SEP = '|||';
  function indexBookmarkPaths(node, parentPath, pathToId, idToPath) {
    (node.children || []).forEach((child) => {
      if (child.type === 'folder') {
        const p = parentPath.concat(child.title);
        pathToId.set(p.join(PATH_SEP), child.id);
        idToPath.set(child.id, p);
        indexBookmarkPaths(child, p, pathToId, idToPath);
      }
    });
  }
  // 快照整个浏览器的书签树（menu/toolbar/unfiled 三个容器及其全部子孙），用于完整备份与还原。
  // 快照整个浏览器的书签树（menu/toolbar/unfiled 三个容器及其全部子孙），用于完整备份与还原。
  async function snapshotBookmarks() {
    const roots = await GG.api.bookmarks.getTree();
    const containers = (roots[0] && roots[0].children) || [];
    const subs = [];
    for (const c of containers) {
      if (c.type !== 'folder') continue;
      // 直接以容器本身作为子树根，导入时其 children 会被整体倒入用户选择的目标文件夹
      subs.push({ node: c, containerId: c.id, path: [] });
    }
    return subs;
  }
  async function hasExistingBookmarks() {
    const names = [];
    for (const r of ['menu________', 'toolbar_____', 'unfiled_____']) {
      try {
        const kids = await GG.api.bookmarks.getChildren(r);
        if (kids && kids.length) {
          const rootName = r === 'toolbar_____' ? '书签栏' : '其他书签';
          names.push(rootName);
        }
      } catch (e) { /* ignore */ }
    }
    return names;
  }
  // 重建导出的书签子树：将其内部内容（文件夹 + 书签）直接导入到用户选定的目标文件夹下，
  // 不再额外包裹一层顶层文件夹，保留原有的内部子文件夹结构。返回 { newPathToId, idToPath }
  // 解析真实的“书签栏”根文件夹 id（Chrome 根容器 id 是数字，不能硬编码 Firefox 的 'toolbar_____'）
  async function resolveToolbarId() {
    try {
      const tree = await GG.api.bookmarks.getTree();
      const containers = (tree[0] && tree[0].children) || [];
      const byTitle = containers.find((c) => c.type === 'folder' && /书签栏|Bookmarks bar|Bookmarks Toolbar/i.test(c.title || ''));
      if (byTitle) return byTitle.id;
      const first = containers.find((c) => c.type === 'folder');
      if (first) return first.id;
    } catch (e) { /* ignore */ }
    return '1';
  }
  async function recreateBookmarks(trees, targetParentId) {
    const idToPath = new Map();
    const oldPathToId = new Map();
    (trees || []).forEach((sub) => {
      indexBookmarkPaths(sub.node, [], oldPathToId, idToPath);
    });

    const root = targetParentId || await resolveToolbarId();
    const newPathToId = new Map();

    // 缓存父子关系，避免重复查询
    const childrenCache = new Map();
    async function getChildren(parentId) {
      if (!childrenCache.has(parentId)) {
        childrenCache.set(parentId, await GG.api.bookmarks.getChildren(parentId));
      }
      return childrenCache.get(parentId);
    }
    // 在同一个父文件夹下查找同名（含书签/文件夹）的现有节点，重复使用以避免重复
    async function findExisting(parentId, node) {
      const kids = await getChildren(parentId);
      const title = node.title || node.url;
      return kids.find((k) => {
        if (node.type === 'folder') return k.type === 'folder' && k.title === node.title;
        return k.type === 'bookmark' && k.title === (node.title || node.url) && k.url === node.url;
      });
    }

    async function recreate(nodes, parentId, parentPath) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          let f = await findExisting(parentId, n);
          if (!f) f = await GG.api.bookmarks.create({ title: n.title, parentId, type: 'folder' });
          // 创建后失效父级缓存，确保后续 findExisting 能看到最新子节点（避免重复创建）
          childrenCache.delete(parentId);
          const p = parentPath.concat(n.title);
          newPathToId.set(p.join(PATH_SEP), f.id);
          if (n.children) await recreate(n.children, f.id, p);
        } else if (n.type === 'bookmark' && n.url) {
          if (!(await findExisting(parentId, n))) {
            await GG.api.bookmarks.create({ title: n.title || n.url, url: n.url, parentId });
            // 创建后失效父级缓存，避免同文件夹内重复创建
            childrenCache.delete(parentId);
          }
        }
      }
    }

    for (const sub of (trees || [])) {
      const node = sub.node;
      if (!node) continue;
      // 直接将顶层文件夹的内部内容导入到目标文件夹下，避免多包一层同名文件夹
      await recreate(node.children || [], root, []);
    }
    return { newPathToId, idToPath };
  }

  // 展示书签文件夹选择对话框，返回用户选定的文件夹 id（取消则返回 null）
  async function pickBookmarkFolder() {
    const tree = await GG.api.bookmarks.getTree();
    const roots = (tree[0] && tree[0].children) || [];
    const options = [];
    (function walk(nodes, depth) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          options.push({ id: n.id, title: '　'.repeat(depth) + n.title, depth });
          if (n.children) walk(n.children, depth + 1);
        }
      }
    })(roots, 0);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gg-modal-overlay';
      const box = document.createElement('div');
      box.className = 'gg-modal';
      const sel = document.createElement('select');
      sel.className = 'gg-folder-select';
      sel.size = Math.min(options.length, 12);
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.title;
        if (o.id === 'toolbar_____') opt.selected = true;
        sel.appendChild(opt);
      }
      const tip = document.createElement('div');
      tip.className = 'gg-modal-tip';
      tip.textContent = '选择导入书签的目标文件夹（将保留原有内部结构）：';
      const row = document.createElement('div');
      row.className = 'gg-modal-row';
      const ok = document.createElement('button');
      ok.className = 'btn';
      ok.textContent = '确定';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.textContent = '取消';
      row.appendChild(ok);
      row.appendChild(cancel);
      box.appendChild(tip);
      box.appendChild(sel);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function close(val) {
        overlay.remove();
        resolve(val);
      }
      ok.addEventListener('click', () => close(sel.value));
      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }
  // 构建“书签导入文件夹”下拉，列出全部文件夹并显示当前默认设置
  async function buildImportFolderSelect() {
    const sel = $('#importFolderSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '（每次导入时手动选择）';
    sel.appendChild(placeholder);

    const tree = await GG.api.bookmarks.getTree();
    const roots = (tree[0] && tree[0].children) || [];
    (function walk(nodes, depth) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          const opt = document.createElement('option');
          opt.value = n.id;
          opt.textContent = '　'.repeat(depth) + n.title;
          sel.appendChild(opt);
          if (n.children) walk(n.children, depth + 1);
        }
      }
    })(roots, 0);

    sel.value = settings.bookmarkImportFolder || '';
  }
  // 根据旧 id 映射到新创建的文件夹 id（按路径匹配）
  function remapFolderIds(apps, idToPath, newPathToId) {
    const remap = {};
    idToPath.forEach((path, oldId) => {
      const newId = newPathToId.get(path.join(PATH_SEP));
      if (newId) remap[oldId] = newId;
    });
    return (apps || []).map((a) => {
      const nf = a.folderId && remap[a.folderId] ? remap[a.folderId] : a.folderId;
      return Object.assign({}, a, { folderId: nf });
    });
  }

  // 根据 settings.backgroundStyle 同步背景风格按钮的选中状态
  function syncBgSegActive() {
    const seg = settings.backgroundStyle === 'preset' ? 'preset'
              : settings.backgroundStyle === 'image' ? 'image'
              : settings.backgroundStyle === 'color' ? 'color'
              : settings.backgroundStyle === 'gradient' ? 'gradient' : 'default';
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === seg));
  }

  function toggleBgFields() {
    const style = (document.querySelector('.seg-btn[data-bg].active') || {}).dataset?.bg || 'default';
    const imageField = document.getElementById('imageSourceField');
    const presetField = document.getElementById('presetField');
    const colorField = document.getElementById('colorField');
    const preview = document.getElementById('bgPreview');
    const hint = document.getElementById('bgHint');
    if (imageField) imageField.style.display = style === 'image' ? '' : 'none';
    if (presetField) presetField.style.display = style === 'preset' ? '' : 'none';
    if (colorField) colorField.style.display = style === 'color' ? '' : 'none';
    // 预览仅在“自定义图片”下显示；预设壁纸只显示缩略图网格
    if (preview) {
      if (style === 'image') preview.classList.remove('hidden');
      else preview.classList.add('hidden');
    }
    if (hint) hint.style.display = (style === 'image' || style === 'preset' || style === 'color') ? '' : 'none';
  }
  async function load() {
    const seg = settings.backgroundStyle === 'preset' ? 'preset'
              : settings.backgroundStyle === 'image' ? 'image'
              : settings.backgroundStyle === 'color' ? 'color'
              : settings.backgroundStyle === 'gradient' ? 'gradient' : 'default';
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === seg));
    const bgImageVal = settings.backgroundImage || '';
    if (bgImageVal.startsWith('data:')) {
      // 旧版：data URL 直接存在 settings 里，迁移到 IndexedDB 以减小 storage 负担
      const key = 'legacy-' + Date.now();
      await saveBgBlob(key, dataURLtoBlob(bgImageVal));
      settings.backgroundImage = BLOB_PREFIX + key;
      await saveSettingsPreservingSyncMeta(settings);
    }
    if (settings.backgroundStyle === 'preset') {
      currentPreset = settings.backgroundImage && settings.backgroundImage.startsWith(PRESET_PREFIX)
        ? settings.backgroundImage : '';
      $('#bgUrl').value = '';
    } else {
      currentPreset = '';
      $('#bgUrl').value = settings.backgroundImage || '';
    }
    markActivePreset();
    $('#bgBlur').value = settings.backgroundBlur ?? 0;
    $('#bgDim').value = settings.backgroundDim ?? 0.15;
    $('#cardCols').value = settings.cardCols || 3;
    $('#cardMinWidth').value = settings.cardMinWidth || 320;
    $('#glassColor').value = settings.glassColor || '#ffeec2';
    $('#glassBlur').value = settings.glassBlur ?? 20;
    $('#glassOpacity').value = settings.glassOpacity ?? 0.06;
    applyGlassPreview();
    // 初始化纯色背景状态
    const savedColor = settings.backgroundImage && settings.backgroundImage.startsWith(COLOR_PREFIX)
      ? settings.backgroundImage : '';
    currentBgColor = savedColor;
    const initBgHex = colorFromValue(savedColor) || '#141b2d';
    const bgColorInput = $('#bgColor');
    if (bgColorInput) bgColorInput.value = initBgHex;
    const bgColorHex = $('#bgColorHex');
    if (bgColorHex) bgColorHex.value = initBgHex;
    const bgSwatch = $('#ccBgSwatch');
    if (bgSwatch) bgSwatch.style.background = initBgHex;
    buildSeSelect();
    $('#seSelect').value = settings.searchEngine || 'bing';
    $('#fontSize').value = settings.fontSize || 'medium';
    if ($('#faviconSource')) $('#faviconSource').value = settings.faviconSource || GG.DEFAULTS.faviconSource;
    if ($('#openInPlace')) $('#openInPlace').checked = !!settings.openInPlace;
    buildColors();
    buildGlassColors();
    buildBgColors();
    buildPresets();
    buildImportFolderSelect();
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--accent-2', settings.accentColor);
    document.documentElement.dataset.fontSize = settings.fontSize || 'medium';
    document.documentElement.dataset.theme = settings.theme || 'dark';
    document.querySelectorAll('.theme-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === (settings.theme || 'dark'));
    });
    await applyBgPreview();
    applyCardWidthPreview();
    updatePreview();
    markActivePreset();
    toggleBgFields();
    // 本地上传按钮使用 GGicon 的 upload 图标
    const upIcon = document.getElementById('bgUploadIcon');
    if (upIcon && GG.icon) upIcon.innerHTML = GG.icon('upload');
    loadSync();
    renderSyncLogs();
  }
  function updateSyncIntervalVal(v) {
    const el = document.getElementById('syncIntervalVal');
    if (el) el.textContent = `${v} 分钟`;
  }
  async function loadSync() {
    const sync = Object.assign({}, GG.DEFAULTS.sync, settings.sync || {});
    if ($('#syncEnabled')) $('#syncEnabled').checked = !!sync.enabled;
    if ($('#syncServer')) $('#syncServer').value = sync.server || '';
    if ($('#syncUser')) $('#syncUser').value = sync.username || '';
    // 密码加密存储：解密后填入输入框
    const passEl = $('#syncPass');
    if (passEl) {
      let pwd = sync.password || '';
      if (pwd && pwd.indexOf('enc:') === 0 && GG.Sync && GG.Sync.decryptPassword) {
        pwd = await GG.Sync.decryptPassword(pwd).catch(() => '');
      }
      passEl.value = pwd || '';
    }
    if ($('#syncFile')) $('#syncFile').value = sync.filename || 'ggbookmark-config.json';
    if ($('#syncDirection')) $('#syncDirection').value = ['both', 'up', 'down'].includes(sync.direction) ? sync.direction : 'both';
    if ($('#syncBookmarks')) $('#syncBookmarks').checked = sync.syncBookmarks !== false;
    const triggers = Array.isArray(sync.triggers) ? sync.triggers : [];
    if ($('#syncTrigInterval')) $('#syncTrigInterval').checked = triggers.includes('interval');
    if ($('#syncTrigSettings')) $('#syncTrigSettings').checked = triggers.includes('settingsChange');
    if ($('#syncTrigBookmark')) $('#syncTrigBookmark').checked = triggers.includes('bookmarkChange');
    if ($('#syncTrigCard')) $('#syncTrigCard').checked = triggers.includes('cardChange');
    if ($('#syncTrigStartup')) $('#syncTrigStartup').checked = triggers.includes('startup');
    const ivEl = $('#syncInterval');
    if (ivEl) {
      const v = Math.min(120, Math.max(1, sync.intervalMinutes || 30));
      ivEl.value = v;
      updateSyncIntervalVal(v);
    }
    const iv = document.getElementById('syncIntervalField');
    if (iv) iv.style.display = triggers.includes('interval') ? '' : 'none';
    refreshSyncStatus();
  }

  // ---------- 同步状态显示（上次成功 / 下次定时 / 远端状态 / 冲突提示） ----------
  function fmtTime(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch (e) { return '—'; }
  }
  async function refreshSyncStatus() {
    const lastEl = document.getElementById('syncLastSuccess');
    const nextEl = document.getElementById('syncNextRun');
    const remoteEl = document.getElementById('syncRemoteState');
    if (!lastEl || !nextEl) return;
    // 上次成功时间 / 冲突状态
    if (GG.Sync && GG.Sync.getSyncState) {
      const st = await GG.Sync.getSyncState();
      lastEl.textContent = fmtTime(st.lastSuccessAt) + (st.lastDirection === 'download' ? '（下载）' : st.lastDirection === 'upload' ? '（上传）' : '');
      if (remoteEl && st.conflict) {
        remoteEl.className = 'v conflict';
        remoteEl.textContent = st.conflict.type === 'big-change'
          ? '远端变更超过 20%，待确认'
          : '本地与远端均有修改（冲突）';
      } else if (remoteEl && (remoteEl.textContent === '远端变更超过 20%，待确认' || remoteEl.textContent === '本地与远端均有修改（冲突）' || remoteEl.classList.contains('conflict'))) {
        remoteEl.className = 'v';
        remoteEl.textContent = '未检查';
      }
    }
    // 下次定时备份时间：直接读取 alarm 计划时间
    nextEl.className = 'v';
    try {
      const alarm = await GG.api.alarms.get(GG.Sync ? GG.Sync.SYNC_ALARM : 'gg-sync-interval');
      if (alarm && alarm.scheduledTime) {
        nextEl.textContent = fmtTime(alarm.scheduledTime);
      } else {
        const sync = Object.assign({}, GG.DEFAULTS.sync, settings.sync || {});
        const triggers = Array.isArray(sync.triggers) ? sync.triggers : [];
        if (sync.enabled && triggers.includes('interval')) {
          nextEl.textContent = '未调度（保存设置后生效）';
          nextEl.className = 'v warn';
        } else {
          nextEl.textContent = '未启用';
        }
      }
    } catch (e) {
      nextEl.textContent = '—';
    }
  }
  // 渲染同步日志面板
  async function renderSyncLogs() {
    const box = document.getElementById('syncLogs');
    if (!box) return;
    if (!GG.Sync || !GG.Sync.getLogs) return;
    const logs = await GG.Sync.getLogs();
    if (!logs.length) {
      box.innerHTML = '<div class="sync-log-empty">暂无同步日志</div>';
      return;
    }
    const typeLabel = { upload: '上传', download: '下载', test: '连接', other: '同步' };
    box.innerHTML = logs.map((l) => {
      const d = new Date(l.time);
      const time = d.toLocaleString();
      const act = typeLabel[l.type] || '同步';
      const source = l.source || '手动';
      const target = l.target || 'webdav';
      const filename = l.filename || '';
      const cls = l.ok ? 'ok' : 'err';
      const parts = [time, act, source, target].filter(Boolean);
      const line = parts.join(' - ') + (filename ? ' - ' + filename : '');
      return `<div class="sync-log-item ${cls}">
        <span class="sync-log-line">${escapeHtml(line)}</span>
        <span class="sync-log-msg">${escapeHtml(l.msg || '')}</span>
      </div>`;
    }).join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function readSync() {
    const triggers = [];
    if ($('#syncTrigInterval') && $('#syncTrigInterval').checked) triggers.push('interval');
    if ($('#syncTrigSettings') && $('#syncTrigSettings').checked) triggers.push('settingsChange');
    if ($('#syncTrigBookmark') && $('#syncTrigBookmark').checked) triggers.push('bookmarkChange');
    if ($('#syncTrigCard') && $('#syncTrigCard').checked) triggers.push('cardChange');
    if ($('#syncTrigStartup') && $('#syncTrigStartup').checked) triggers.push('startup');
    return {
      enabled: $('#syncEnabled') ? $('#syncEnabled').checked : false,
      server: $('#syncServer') ? $('#syncServer').value.trim() : '',
      username: $('#syncUser') ? $('#syncUser').value.trim() : '',
      password: $('#syncPass') ? $('#syncPass').value : '',
      filename: ($('#syncFile') ? $('#syncFile').value.trim() : '') || 'ggbookmark-config.json',
      direction: $('#syncDirection') ? $('#syncDirection').value : 'both',
      syncBookmarks: $('#syncBookmarks') ? $('#syncBookmarks').checked : true,
      versionedBackup: true, // 版本化备份默认开启，不再提供开关
      triggers: triggers,
      intervalMinutes: $('#syncInterval') ? (Number($('#syncInterval').value) || 30) : 30
    };
  }
  async function updatePreview() {
    const preview = $('#bgPreview');
    const img = $('#previewImg');
    const style = (document.querySelector('.seg-btn[data-bg].active') || {}).dataset?.bg || 'default';
    let raw = $('#bgUrl').value.trim();
    if (style !== 'image' || !raw) {
      preview.classList.add('hidden');
      return;
    }
    if (raw.startsWith(BLOB_PREFIX)) {
      raw = await bgBlobURL(raw.slice(BLOB_PREFIX.length));
      if (!raw) {
        preview.classList.add('hidden');
        return;
      }
    }
    const preset = presetNameFromValue(raw);
    img.src = preset ? presetURL(preset) : raw;
    preview.classList.remove('hidden');
  }
  function wire() {
    // 背景相关输入框实时预览
    $('#bgUrl').addEventListener('input', () => {
      applyBgPreview();
      updatePreview();
      markActivePreset();
    });
    $('#bgBlur').addEventListener('input', applyBgPreview);
    $('#bgDim').addEventListener('input', applyBgPreview);

    // 同步间隔滑动条实时显示
    $('#syncInterval').addEventListener('input', (e) => {
      updateSyncIntervalVal(e.target.value);
    });

    // 本地图片上传 -> 存入 IndexedDB，仅把轻量引用写入输入框/设置，避免大 data URL 拖慢 storage
    $('#bgFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      // 直接把原始图片 Blob 存入 IndexedDB（支持任意大小），settings 仅存 blob: 引用
      const key = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      await saveBgBlob(key, file);
      $('#bgUrl').value = BLOB_PREFIX + key;
      currentPreset = '';
      document.querySelector('[data-bg="image"]').classList.add('active');
      document.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.bg === 'image'));
      toggleBgFields();
      applyBgPreview();
      updatePreview();
      markActivePreset();
    });

    // 主题模式切换
    document.querySelectorAll('.theme-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        settings.theme = b.dataset.theme;
        document.documentElement.dataset.theme = settings.theme;
        // 保持背景风格按钮的选中状态（避免主题切换时被意外清除）
        syncBgSegActive();
      });
    });

    // 背景风格切换（仅作用于带 data-bg 的背景风格按钮，排除主题按钮）
    document.querySelectorAll('.seg-btn[data-bg]').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-bg]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        if (b.dataset.bg !== 'image' && b.dataset.bg !== 'preset' && b.dataset.bg !== 'color') {
          settings.backgroundImage = '';
        }
        if (b.dataset.bg === 'preset') {
          // 切换到预设壁纸：若已有预设选择则应用，否则等用户点缩略图
          if (currentPreset) { settings.backgroundImage = currentPreset; }
        }
        if (b.dataset.bg === 'color') {
          // 切换到纯色背景：应用当前选中颜色
          if (currentBgColor) { settings.backgroundImage = currentBgColor; }
        }
        if (b.dataset.bg === 'image') {
          // 切换到自定义图片：仅当输入框有真实 URL 时采用；预设引用不再塞入输入框
          currentPreset = '';
          const v = $('#bgUrl').value.trim();
          if (v.startsWith(PRESET_PREFIX)) $('#bgUrl').value = '';
        }
        toggleBgFields();
        applyBgPreview();
        updatePreview();
        markActivePreset();
        // 切换时同步预设色选中态
        if ($('#bgColors')) {
          const curHex = colorFromValue(currentBgColor) || ($('#bgColor') ? $('#bgColor').value : '');
          document.querySelectorAll('#bgColors .color-dot').forEach((x) => {
            x.classList.toggle('active', !!curHex && x.dataset.color.toLowerCase() === curHex.toLowerCase());
          });
        }
      });
    });

    if ($('#bgClear')) {
      $('#bgClear').addEventListener('click', () => {
        $('#bgUrl').value = '';
        $('#bgFile').value = '';
        currentPreset = '';
        $('#bgPreview').classList.add('hidden');
        applyBgPreview();
        markActivePreset();
      });
    }
    if ($('#btnClearImportFolder')) {
      $('#btnClearImportFolder').addEventListener('click', () => {
        $('#importFolderSelect').value = '';
        settings.bookmarkImportFolder = '';
        saveSettingsPreservingSyncMeta(settings);
        GG.toast.show('已清除默认导入文件夹', 'info');
      });
    }
    // 选择导入文件夹后即时保存，避免忘记点“保存设置”导致不生效
    if ($('#importFolderSelect')) {
      $('#importFolderSelect').addEventListener('change', () => {
        settings.bookmarkImportFolder = $('#importFolderSelect').value || '';
        saveSettingsPreservingSyncMeta(settings);
        GG.toast.show('已记住书签导入文件夹', 'success');
      });
    }
    $('#cardCols').addEventListener('change', applyCardWidthPreview);
    $('#cardMinWidth').addEventListener('input', applyCardWidthPreview);
    $('#glassColor').addEventListener('input', applyGlassPreview);
    $('#glassBlur').addEventListener('input', applyGlassPreview);
    $('#glassOpacity').addEventListener('input', applyGlassPreview);
    // 自定义颜色 hex 输入：边输入边校验（合法则实时应用），失焦时回填规范化值
    const glassHex = $('#glassColorHex');
    if (glassHex) {
      glassHex.addEventListener('input', () => {
        const n = normalizeHex(glassHex.value);
        glassHex.classList.toggle('invalid', !!glassHex.value && !n);
        if (n) {
          const colorInput = $('#glassColor');
          if (colorInput && colorInput.value !== n) colorInput.value = n;
          applyGlassPreview();
        }
      });
      glassHex.addEventListener('blur', () => {
        const n = normalizeHex(glassHex.value);
        if (n) {
          glassHex.value = n;
          const colorInput = $('#glassColor');
          if (colorInput) colorInput.value = n;
          applyGlassPreview();
        }
        glassHex.classList.remove('invalid');
      });
      glassHex.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const n = normalizeHex(glassHex.value);
          if (n) { glassHex.value = n; $('#glassColor').value = n; applyGlassPreview(); }
          glassHex.blur();
        }
      });
    }
    // 纯色背景自定义颜色 hex 输入：边输入边校验（合法则实时应用），失焦时回填规范化值
    const bgHex = $('#bgColorHex');
    if (bgHex) {
      bgHex.addEventListener('input', () => {
        const n = normalizeHex(bgHex.value);
        bgHex.classList.toggle('invalid', !!bgHex.value && !n);
        if (n) {
          const colorInput = $('#bgColor');
          if (colorInput && colorInput.value !== n) colorInput.value = n;
          currentBgColor = colorRef(n);
          applyBgPreview();
        }
      });
      bgHex.addEventListener('blur', () => {
        const n = normalizeHex(bgHex.value);
        if (n) {
          bgHex.value = n;
          const colorInput = $('#bgColor');
          if (colorInput) colorInput.value = n;
          currentBgColor = colorRef(n);
          applyBgPreview();
        }
        bgHex.classList.remove('invalid');
      });
      bgHex.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const n = normalizeHex(bgHex.value);
          if (n) { bgHex.value = n; $('#bgColor').value = n; currentBgColor = colorRef(n); applyBgPreview(); }
          bgHex.blur();
        }
      });
    }

    $('#btnSave').addEventListener('click', async () => {
      const bgActive = document.querySelector('.seg-btn[data-bg].active');
      settings.backgroundStyle = bgActive ? bgActive.dataset.bg : 'default';
      if (settings.backgroundStyle === 'preset') {
        settings.backgroundImage = currentPreset || '';
      } else if (settings.backgroundStyle === 'image') {
        settings.backgroundImage = $('#bgUrl').value.trim() || '';
      } else if (settings.backgroundStyle === 'color') {
        const hex = normalizeHex($('#bgColor').value) || colorFromValue(currentBgColor) || '#141b2d';
        currentBgColor = colorRef(hex);
        settings.backgroundImage = currentBgColor;
      } else {
        settings.backgroundImage = '';
      }
      settings.backgroundBlur = Number($('#bgBlur').value) || 0;
      settings.backgroundDim = Number($('#bgDim').value) || 0;
      settings.cardCols = Number($('#cardCols').value) || 5;
      settings.cardMinWidth = Number($('#cardMinWidth').value) || 280;
      settings.glassColor = $('#glassColor').value || '#ffeec2';
      settings.glassBlur = Number($('#glassBlur').value) || 0;
      settings.glassOpacity = Number($('#glassOpacity').value);
      settings.searchEngine = $('#seSelect').value;
      settings.fontSize = $('#fontSize').value;
      settings.faviconSource = $('#faviconSource') ? $('#faviconSource').value : GG.DEFAULTS.faviconSource;
      settings.openInPlace = $('#openInPlace') ? $('#openInPlace').checked : false;
      settings.bookmarkImportFolder = $('#importFolderSelect').value || '';
      const activeTheme = document.querySelector('.theme-btn.active');
      if (activeTheme) settings.theme = activeTheme.dataset.theme;
      settings.sync = readSync();
      // 密码加密后存储（不落明文）
      if (GG.Sync && GG.Sync.encryptPassword && settings.sync.password) {
        settings.sync.password = await GG.Sync.encryptPassword(settings.sync.password);
      }
      const activeDot = document.querySelector('#colors .color-dot.active');
      if (activeDot) settings.accentColor = activeDot.dataset.color;
      // 记录本地变更时间，供同步冲突判定；确保严格大于上次同步点，避免同毫秒误判
      settings.lastLocalChangeAt = Math.max(Date.now(), (settings.lastSyncAt || 0) + 1);
      // 合并 storage 最新同步元数据，避免覆盖成旧值导致误判远端变更
      await saveSettingsPreservingSyncMeta(settings);
      if (GG.Sync && GG.Sync.scheduleAlarm) GG.Sync.scheduleAlarm();
      refreshSyncStatus();
      GG.toast.show('设置已保存', 'success');
    });

    if ($('#btnResetBg')) {
        $('#btnResetBg').addEventListener('click', async () => {
        settings.backgroundImage = '';
        settings.backgroundStyle = 'default';
        settings.backgroundBlur = 0;
        settings.backgroundDim = 0.15;
        $('#bgUrl').value = '';
        currentPreset = '';
        currentBgColor = '';
        $('#bgBlur').value = 0;
        $('#bgDim').value = 0.15;
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === 'default'));
        applyBgPreview();
        markActivePreset();
        await saveSettingsPreservingSyncMeta(settings);
        GG.toast.show('已重置背景', 'success');
      });
    }

    // 导出配置为 JSON 文件（不含壁纸图片数据，但包含主页面卡片配置与全部书签）
    $('#btnExport').addEventListener('click', async () => {
      try {
        const stored = await GG.api.storage.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings', 'pinned']);
        const cfg = {
          version: GG.VERSION,
          settings: Object.assign({}, stored.settings || {})
        };
        // 自定义壁纸的图片数据不写入配置，避免体积膨胀：
        // 本地上传的图片存于 IndexedDB（settings 仅存 blob: 引用），跨设备无法解析，一并剔除；
        // 网络图片 URL 与内置预设引用予以保留（导入时不会覆盖当前壁纸，见下方导入逻辑）
        const bg = cfg.settings.backgroundImage || '';
        if (bg.startsWith('data:') || bg.startsWith(BLOB_PREFIX)) {
          delete cfg.settings.backgroundImage;
        }
        cfg.apps = stored.apps || [];
        cfg.categories = stored.categories || [];
        cfg.orderByCat = stored.orderByCat || {};
        cfg.activeCat = stored.activeCat || null;
        cfg.pinned = stored.pinned || [];
        // 导出全部书签（整个浏览器书签树），并记录原始容器与完整路径
        try {
          const snaps = await snapshotBookmarks();
          cfg.bookmarks = snaps.map((s) => ({
            node: s.node,
            containerId: s.containerId,
            path: s.path
          }));
        } catch (e) {
          cfg.bookmarks = null;
        }
        // 统计书签 / 文件夹数量，随配置一并导出，便于备份文件快速识别内容
        if (GG.Sync && GG.Sync.countBookmarksInConfig) {
          const stats = GG.Sync.countBookmarksInConfig(cfg);
          cfg.bookmarkCount = stats.bookmarkCount;
          cfg.folderCount = stats.folderCount;
        }
        cfg.exportedAt = Date.now();
        const json = JSON.stringify(cfg, null, 2);
        const filename = 'ggbookmark-config.json';
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        GG.toast.show('已导出配置（' + (cfg.bookmarkCount != null ? cfg.bookmarkCount + ' 个书签' : '无书签') + '）', 'success');
      } catch (e) {
        GG.toast.show('导出失败：' + (e && e.message), 'error');
      }
    });

    // 导入配置：触发文件选择，读入后合并并应用
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!imported || typeof imported !== 'object') throw new Error('invalid');

        // 读取当前壁纸，导入文件未携带壁纸时不覆盖
        const current = await GG.api.storage.get('settings');
        const currentBg = (current.settings || {}).backgroundImage || '';
        // 保留已保存的“书签导入文件夹”，不被导入的配置覆盖（导入文件通常不含该字段）
        const savedImportFolder = (current.settings || {}).bookmarkImportFolder || '';
        const importedSettings = Object.assign({}, GG.DEFAULTS, imported.settings || {});
        if (!imported.settings || !imported.settings.bookmarkImportFolder) {
          importedSettings.bookmarkImportFolder = savedImportFolder;
        }
        if (!importedSettings.backgroundImage) importedSettings.backgroundImage = currentBg;

        let apps = imported.apps || [];
        let skipBookmarks = false;

        // 导入书签：若会覆盖/新增已有书签，先提示用户备份
        if (imported.bookmarks) {
          const existing = await hasExistingBookmarks();
          const existingHint = existing.length
            ? ('\n\n当前已有书签的位置：' + existing.join('、'))
            : '';
          if (existing.length && !window.confirm('导入的配置包含书签，将重新创建书签（可能与现有书签重复）。\n强烈建议先到浏览器书签管理器备份现有书签，再继续导入。' + existingHint + '\n\n仍要继续导入书签吗？')) {
            // 仅跳过书签重建，仍导入设置与卡片配置
            skipBookmarks = true;
            GG.toast.show('已跳过书签导入，仅导入设置与卡片', 'info');
          }
          if (!skipBookmarks) {
            try {
              // 优先使用配置文件里记录的导入文件夹；其次用本地保存的设置；都没有才询问用户
              let importFolder = importedSettings.bookmarkImportFolder
                || (await GG.api.storage.get('settings')).settings?.bookmarkImportFolder
                || '';
              // 配置文件里的文件夹 id 可能来自其他设备，在本机未必存在，需校验
              if (importFolder) {
                try {
                  await GG.api.bookmarks.getChildren(importFolder);
                } catch (e) {
                  importFolder = '';
                }
              }
              const target = importFolder
                ? importFolder
                : await pickBookmarkFolder();
              if (target == null) {
                skipBookmarks = true;
                GG.toast.show('已取消书签导入，仅导入设置与卡片', 'info');
              } else {
                const { newPathToId, idToPath } = await recreateBookmarks(imported.bookmarks, target);
                apps = remapFolderIds(apps, idToPath, newPathToId);
              }
            } catch (e) {
              GG.toast.show('书签导入失败：' + (e && e.message ? e.message : '未知错误'), 'error');
            }
          }
        }

        const toSave = {
          settings: importedSettings,
          apps: apps,
          categories: imported.categories || [],
          orderByCat: imported.orderByCat || {},
          activeCat: imported.activeCat || null,
          pinned: Array.isArray(imported.pinned) ? imported.pinned : []
        };
        await GG.api.storage.set(toSave);

        settings = importedSettings;
        load();
        // 通知主页面刷新卡片配置（若同时打开）
        GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
        GG.toast.show('已导入配置', 'success');
      } catch (err) {
        GG.toast.show('导入失败：文件无效', 'error');
      }
    });

    // 同步：手动上传 / 下载 + 勾选定时后显示间隔
    const syncTrigInterval = $('#syncTrigInterval');
    if (syncTrigInterval) {
      syncTrigInterval.addEventListener('change', () => {
        const iv = document.getElementById('syncIntervalField');
        if (iv) iv.style.display = syncTrigInterval.checked ? '' : 'none';
      });
    }

    // 冲突 / 大幅变更确认弹窗：返回 'local'（保留本地上传）| 'remote'（下载远端）| null（取消）
    function showConflictModal(info, isBigChange) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'gg-modal-overlay';
        const box = document.createElement('div');
        box.className = 'gg-modal';
        const title = document.createElement('div');
        title.className = 'gg-modal-tip';
        title.style.fontWeight = '600';
        title.textContent = isBigChange ? '远端配置将大幅修改本地书签' : '检测到同步冲突';
        const detail = document.createElement('div');
        detail.className = 'gg-modal-tip';
        const lines = [];
        if (info && info.remoteLastModified) lines.push('远端修改时间：' + fmtTime(info.remoteLastModified));
        if (info && info.remoteBookmarkCount != null) lines.push('远端书签：' + info.remoteBookmarkCount + ' 个');
        if (info && info.localBookmarkCount != null) lines.push('本地书签：' + info.localBookmarkCount + ' 个');
        if (info && info.diff) {
          const pct = Math.round((info.diff.ratio || 0) * 100);
          lines.push('预计变化：新增 ' + info.diff.added + ' 个 / 移除 ' + info.diff.removed + ' 个（约 ' + pct + '%）');
        }
        if (isBigChange) lines.push('远端覆盖本地将超过 20% 的书签变化，请确认是否继续。');
        else lines.push('本地与远端在上次同步后都发生过修改，请选择保留哪一份。');
        detail.textContent = lines.join('\n');
        detail.style.whiteSpace = 'pre-line';
        const row = document.createElement('div');
        row.className = 'gg-modal-row';
        const btnLocal = document.createElement('button');
        btnLocal.className = 'btn';
        btnLocal.textContent = '保留本地（上传）';
        const btnRemote = document.createElement('button');
        btnRemote.className = 'btn primary';
        btnRemote.textContent = isBigChange ? '确认覆盖（下载）' : '保留远端（下载）';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-ghost';
        btnCancel.textContent = '取消';
        row.appendChild(btnLocal);
        row.appendChild(btnRemote);
        row.appendChild(btnCancel);
        box.appendChild(title);
        box.appendChild(detail);
        box.appendChild(row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        function close(val) { overlay.remove(); resolve(val); }
        btnLocal.addEventListener('click', () => close('local'));
        btnRemote.addEventListener('click', () => close('remote'));
        btnCancel.addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      });
    }

    // 应用下载结果后刷新界面与主页
    async function afterDownloaded() {
      const data = await GG.api.storage.get('settings');
      settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
      load();
      GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
    }

    function syncFilename() {
      return (settings.sync && settings.sync.filename) ? settings.sync.filename : 'ggbookmark-config.json';
    }

    // 立即同步：按方向策略自动判断上传/下载；冲突或大幅变更时弹窗询问
    if ($('#btnSyncNow')) {
      $('#btnSyncNow').addEventListener('click', async () => {
        const filename = syncFilename();
        try {
          GG.toast.show('正在检查同步状态…', 'info');
          const r = await GG.Sync.smartSync({ source: '手动', force: true });
          if (r.action === 'uploaded') {
            if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: true, msg: '上传成功（' + r.bookmarkCount + ' 个书签）' }).catch(() => {});
            GG.toast.show('已上传到服务器（' + r.bookmarkCount + ' 个书签）', 'success');
          } else if (r.action === 'downloaded') {
            if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: true, msg: '远端较新，已下载并应用' }).catch(() => {});
            GG.toast.show('远端较新，已下载并应用', 'success');
            await afterDownloaded();
          } else if (r.action === 'in-sync') {
            GG.toast.show('本地与远端已是最新，无需同步', 'info');
          } else if (r.action === 'conflict' || r.action === 'big-change') {
            const choice = await showConflictModal(r.info, r.action === 'big-change');
            if (choice === 'local') {
              const rr = await GG.Sync.resolveConflict('local');
              if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: true, msg: '冲突已解决：保留本地并上传' }).catch(() => {});
              GG.toast.show('已保留本地并上传（' + (rr.bookmarkCount != null ? rr.bookmarkCount + ' 个书签' : '') + '）', 'success');
            } else if (choice === 'remote') {
              await GG.Sync.resolveConflict('remote');
              if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: true, msg: '冲突已解决：下载远端配置' }).catch(() => {});
              GG.toast.show('已下载远端配置并应用', 'success');
              await afterDownloaded();
            } else {
              GG.toast.show('已取消同步', 'info');
            }
          }
          renderSyncLogs();
          refreshSyncStatus();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'other', source: '手动', target: 'webdav', filename, ok: false, msg: '同步失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('同步失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
          refreshSyncStatus();
        }
      });
    }

    // 强制上传：不做比较直接覆盖远端
    if ($('#btnSyncUpload')) {
      $('#btnSyncUpload').addEventListener('click', async () => {
        const filename = syncFilename();
        try {
          const r = await GG.Sync.upload();
          const cnt = r && r.bookmarkCount != null ? '（' + r.bookmarkCount + ' 个书签）' : '';
          if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: true, msg: '强制上传成功' + cnt }).catch(() => {});
          GG.toast.show('已上传到服务器' + cnt, 'success');
          renderSyncLogs();
          refreshSyncStatus();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: false, msg: '上传失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('上传失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
        }
      });
    }

    // 强制下载：先比对变化幅度，超过 20% 时要求确认
    if ($('#btnSyncDownload')) {
      $('#btnSyncDownload').addEventListener('click', async () => {
        const filename = syncFilename();
        try {
          // 先检查远端状态与变化幅度
          let needConfirm = false;
          let info = null;
          try {
            const st = await GG.Sync.checkStatus();
            if (st && st.info && st.info.diff && st.info.diff.big) {
              needConfirm = true;
              info = st.info;
            }
          } catch (e) { /* 状态检查失败时仍按原逻辑直接下载 */ }
          if (needConfirm) {
            const choice = await showConflictModal(info, true);
            if (choice !== 'remote') { GG.toast.show('已取消下载', 'info'); return; }
          }
          await GG.Sync.download();
          if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: true, msg: '下载并应用成功' }).catch(() => {});
          GG.toast.show('已从服务器下载并应用', 'success');
          await afterDownloaded();
          renderSyncLogs();
          refreshSyncStatus();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: false, msg: '下载失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('下载失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
        }
      });
    }

    // 检查同步状态：显示 本地较新 / 远端较新 / 已同步 / 冲突
    if ($('#btnSyncCheck')) {
      $('#btnSyncCheck').addEventListener('click', async () => {
        const el = document.getElementById('syncRemoteState');
        if (el) { el.className = 'v'; el.textContent = '检查中…'; }
        try {
          const st = await GG.Sync.checkStatus();
          if (!el) return;
          if (st.status === 'no-server') { el.textContent = '未配置服务器'; return; }
          if (st.status === 'no-remote') { el.textContent = '远端尚无配置文件（首次同步将上传）'; return; }
          const map = {
            'in-sync': '本地与远端已同步',
            'local-newer': '本地较新（下次同步将上传）',
            'remote-newer': '远端较新（下次同步将下载）',
            'conflict': '本地与远端均有修改（冲突）'
          };
          el.textContent = map[st.status] || st.status;
          el.className = 'v' + (st.status === 'conflict' ? ' conflict' : st.status === 'in-sync' ? '' : ' warn');
          if (st.status === 'conflict') {
            const choice = await showConflictModal(st.info, false);
            if (choice === 'local') {
              await GG.Sync.resolveConflict('local');
              GG.toast.show('已保留本地并上传', 'success');
              el.className = 'v'; el.textContent = '已解决（本地已上传）';
              renderSyncLogs(); refreshSyncStatus();
            } else if (choice === 'remote') {
              await GG.Sync.resolveConflict('remote');
              GG.toast.show('已下载远端配置并应用', 'success');
              await afterDownloaded();
              renderSyncLogs(); refreshSyncStatus();
            }
          }
        } catch (e) {
          if (el) { el.className = 'v conflict'; el.textContent = '检查失败：' + (e && e.message ? e.message : '未知错误'); }
        }
      });
    }

    // 历史版本：列出服务器上的版本备份（含时间与书签数量），可选择下载恢复
    if ($('#btnListVersions')) {
      $('#btnListVersions').addEventListener('click', async () => {
        const box = document.getElementById('versionList');
        if (!box) return;
        box.innerHTML = '<div class="version-empty">正在读取版本列表…</div>';
        try {
          const versions = await GG.Sync.listVersions();
          if (!versions.length) {
            box.innerHTML = '<div class="version-empty">暂无版本备份（开启“版本化备份”后自动保留）</div>';
            return;
          }
          box.innerHTML = '';
          versions.forEach((v) => {
            const item = document.createElement('div');
            item.className = 'version-item';
            const time = document.createElement('span');
            time.className = 'v-time';
            time.textContent = fmtTime(v.time);
            const count = document.createElement('span');
            count.className = 'v-count' + (v.bookmarkCount == null ? ' loading' : '');
            count.textContent = v.bookmarkCount != null
              ? (v.bookmarkCount + ' 个书签')
              : '读取中…';
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = '下载此版本';
            btn.addEventListener('click', async () => {
              try {
                const cfgData = await GG.Sync.downloadVersion(null, v.name);
                const applied = await GG.Sync.applyConfig(cfgData);
                if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '版本恢复', target: 'webdav', filename: v.name, ok: true, msg: '已恢复历史版本' }).catch(() => {});
                GG.toast.show('已恢复版本：' + v.name, 'success');
                await afterDownloaded();
                renderSyncLogs();
                refreshSyncStatus();
              } catch (e) {
                if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '版本恢复', target: 'webdav', filename: v.name, ok: false, msg: '恢复失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
                GG.toast.show('恢复失败：' + (e && e.message ? e.message : '未知错误'), 'error');
              }
            });
            item.appendChild(time);
            item.appendChild(count);
            item.appendChild(btn);
            box.appendChild(item);
            // 旧版本文件名未含书签数量时，降级：下载文件读取统计字段
            if (v.bookmarkCount == null) {
              GG.Sync.downloadVersion(null, v.name).then((cfgData) => {
                const cnt = cfgData && cfgData.bookmarkCount != null
                  ? cfgData.bookmarkCount
                  : (GG.Sync.countBookmarksInConfig ? GG.Sync.countBookmarksInConfig(cfgData).bookmarkCount : null);
                count.classList.remove('loading');
                count.textContent = cnt != null ? (cnt + ' 个书签') : '';
              }).catch(() => {
                count.classList.remove('loading');
                count.textContent = v.size != null ? (Math.round(v.size / 1024) + ' KB') : '';
              });
            }
          });
        } catch (e) {
          box.innerHTML = '<div class="version-empty">读取失败：' + escapeHtml(e && e.message ? e.message : '未知错误') + '</div>';
        }
      });
    }
    if ($('#btnSyncTest')) {
      $('#btnSyncTest').addEventListener('click', async () => {
        const cfg = readSync();
        if (!cfg.server) {
          GG.toast.show('请先填写服务器地址', 'info');
          return;
        }
        const filename = cfg.filename || 'ggbookmark-config.json';
        try {
          const status = await GG.Sync.testConnection(cfg);
          if (GG.Sync.log) GG.Sync.log({ type: 'test', source: '手动', target: 'webdav', filename, ok: true, msg: '连接成功（HTTP ' + status + '）' }).catch(() => {});
          GG.toast.show('连接成功（HTTP ' + status + '）', 'success');
          renderSyncLogs();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'test', source: '手动', target: 'webdav', filename, ok: false, msg: '连接失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('连接失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
        }
      });
    }
    if ($('#btnClearLogs')) {
      $('#btnClearLogs').addEventListener('click', async () => {
        if (GG.Sync && GG.Sync.clearLogs) await GG.Sync.clearLogs();
        renderSyncLogs();
        GG.toast.show('已清空同步日志', 'info');
      });
    }

    // 清除配置：恢复默认并删除本地存储（仅本扩展配置，不删除 Firefox 书签）
    $('#btnClear').addEventListener('click', async () => {
      if (!window.confirm('确定清除所有配置？将恢复默认设置且无法撤销（含卡片与壁纸）。\n注意：此操作仅清除本扩展配置，不会删除 Firefox 中的书签。')) return;
      await GG.api.storage.remove(['settings', 'apps', 'categories', 'orderByCat', 'activeCat', 'pinned']);
      settings = Object.assign({}, GG.DEFAULTS);
      load();
      GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
      GG.toast.show('已清除配置', 'success');
    });
  }

  async function init() {
    const data = await GG.api.storage.get('settings');
    settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
    await load();
    wire();
    // 同步日志写入时实时刷新日志面板（后台定时/自动上传也会写日志）
    // 用防抖合并高频写入（如书签批量变更），避免频繁重渲染
    let logTimer = null;
    GG.api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes && 'syncLogs' in changes) {
        if (logTimer) clearTimeout(logTimer);
        logTimer = setTimeout(() => { logTimer = null; renderSyncLogs(); }, 300);
      }
      // 后台自动同步写入的状态（上次成功时间 / 冲突）实时刷新
      if (changes && 'syncState' in changes) {
        refreshSyncStatus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  // ---------- 设置分类标签切换 ----------
  function wireTabs() {
    const tabs = document.querySelectorAll('.s-tab');
    const panels = document.querySelectorAll('.s-panel');
    if (!tabs.length || !panels.length) return;
    function show(panelName) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.panel === panelName));
      panels.forEach((p) => {
        const show = p.dataset.panel === panelName;
        p.style.display = show ? '' : 'none';
        // 切到「关于」时填充版本号
        if (show && p.dataset.panel === 'about') fillAbout();
        if (show && p.dataset.panel === 'update') fillUpdateVersion();
      });
    }
    tabs.forEach((t) => {
      t.addEventListener('click', () => show(t.dataset.panel));
    });
  }

  // 关于面板：填充版本号
  function fillAbout() {
    const el = document.getElementById('aboutVersion');
    if (el) {
      try { el.textContent = chrome.runtime.getManifest().version || ''; } catch (e) { el.textContent = ''; }
    }
  }

  // 更新检查面板：填充当前版本
  function fillUpdateVersion() {
    const el = document.getElementById('updateCurrentVersion');
    if (el) {
      try { el.textContent = 'v' + (chrome.runtime.getManifest().version || ''); } catch (e) { el.textContent = '—'; }
    }
  }

  // 检查 GitHub 最新发布版本
  async function checkUpdate() {
    const latestEl = document.getElementById('updateLatestVersion');
    const btn = document.getElementById('btnCheckUpdate');
    const releaseBtn = document.getElementById('btnOpenRelease');
    const hint = document.getElementById('updateHint');
    if (!latestEl) return;
    if (btn) btn.disabled = true;
    latestEl.textContent = '检查中…';
    if (hint) hint.textContent = '正在连接 GitHub…';
    try {
      const cur = (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
      const res = await fetch('https://api.github.com/repos/firestaradmin/ggBookmark/releases/latest');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const latest = (data && data.tag_name) || '';
      const latestVer = latest.replace(/^v/, '');
      latestEl.textContent = latest ? 'v' + latestVer : '—';
      const isNewer = latestVer && cur && compareVersions(latestVer, cur) > 0;
      if (hint) {
        if (isNewer) {
          // 有新版：提示文字包含可点击的更新链接（指向 GitHub releases 页面）
          const url = data.html_url || 'https://github.com/firestaradmin/ggBookmark/releases';
          hint.style.color = 'var(--text-faint)';
          hint.innerHTML = '发现新版本 v' + latestVer + '，点击 <a class="update-link" href="' + url + '" target="_blank" rel="noopener">前往更新页面</a> 下载。';
          hint.querySelectorAll('.update-link').forEach((a) => {
            a.addEventListener('click', (e) => { e.preventDefault(); GG.api.tabs.create({ url: a.href }); });
          });
        } else {
          hint.style.color = 'var(--text-faint)';
          hint.textContent = '已是最新版本。';
        }
      }
      if (releaseBtn) {
        releaseBtn.style.display = isNewer ? '' : 'none';
        if (data.html_url) {
          releaseBtn.onclick = () => { GG.api.tabs.create({ url: data.html_url }); };
        }
      }
    } catch (e) {
      latestEl.textContent = '检查失败';
      if (hint) { hint.textContent = '无法连接 GitHub：' + (e && e.message ? e.message : '未知错误'); hint.style.color = '#ff7a7a'; }
      if (releaseBtn) releaseBtn.style.display = 'none';
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  // 在 DOMContentLoaded 之后再接入标签与更新检查（保持原有 init 行为）
  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    const btnCheck = document.getElementById('btnCheckUpdate');
    if (btnCheck) btnCheck.addEventListener('click', checkUpdate);
    const btnHelp = document.getElementById('btnOpenHelp');
    if (btnHelp) btnHelp.addEventListener('click', () => { GG.api.tabs.create({ url: chrome.runtime.getURL('pages/help/help.html') }); });
    wireColorPicker();
  });
})();
