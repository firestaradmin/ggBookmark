/* GG Bookmark - settings page logic */

(() => {
  'use strict';
  const ACCENTS = ['#4f7cff', '#7a5bff', '#00c6a7', '#ff7a59', '#f54d6a', '#ffb84d', '#4f9fff'];
  const $ = (s) => document.querySelector(s);
  let settings = {};
  const PRESET_WALLPAPERS = [
    'mojave_dynamic-14_scaled.webp',
    'Scene_D_1.webp',
    'vgoxxm.webp',
    'wallhaven-1k6y7g_scaled.webp',
    'wallhaven-1ko5xg.webp',
    'wallhaven-7229oo.webp',
    'wallhaven-83qyry.webp',
    'wallhaven-9d17m1.webp',
    'wallhaven-gp1977.webp',
    'wallhaven-jxlk35.webp',
    'wallhaven-kxov7q.webp',
    'wallhaven-pkq3zp.webp',
    'wallhaven-rrd6gj.webp',
    'wallhaven-z8zd2j.webp'
  ];
  function presetURL(name) {
    return browser.runtime.getURL('pics/wallpapers/' + name);
  }

  function applyBgPreview() {
    const bg = $('.gg-bg');
    const currentStyle = document.querySelector('.seg-btn.active').dataset.bg;
    const blur = Number($('#bgBlur').value) || 0;
    const dim = Number($('#bgDim').value);
    $('#bgBlurVal').textContent = blur + 'px';
    $('#bgDimVal').textContent = dim.toFixed(2);
    bg.style.setProperty('--bg-blur', blur + 'px');
    bg.style.setProperty('--bg-dim', String(dim));
    if (currentStyle === 'image' && $('#bgUrl').value.trim()) {
      bg.dataset.style = 'image';
      bg.style.setProperty('--bg-image', `url("${$('#bgUrl').value.trim()}")`);
    } else if (currentStyle === 'gradient') {
      bg.dataset.style = 'gradient';
    } else {
      bg.dataset.style = 'default';
    }
  }
  function applyCardWidthPreview() {
    $('#cardWidthVal').textContent = $('#cardWidth').value + 'px';
  }

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

  function buildPresets() {
    const grid = $('#presetGrid');
    grid.innerHTML = '';
    PRESET_WALLPAPERS.forEach((name) => {
      const url = presetURL(name);
      const d = document.createElement('div');
      d.className = 'preset';
      d.dataset.url = url;
      d.title = name;
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.loading = 'lazy';
      d.appendChild(img);
      d.addEventListener('click', () => {
        $('#bgUrl').value = url;
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === 'image'));
        applyBgPreview();
        updatePreview();
        markActivePreset();
      });
      grid.appendChild(d);
    });
  }
  function markActivePreset() {
    const current = $('#bgUrl').value.trim();
    document.querySelectorAll('#presetGrid .preset').forEach((p) => {
      p.classList.toggle('active', p.dataset.url === current);
    });
  }

  function load() {
    const seg = settings.backgroundStyle === 'image' ? 'image'
              : settings.backgroundStyle === 'gradient' ? 'gradient' : 'default';
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === seg));
    $('#bgUrl').value = settings.backgroundImage || '';
    $('#bgBlur').value = settings.backgroundBlur ?? 0;
    $('#bgDim').value = settings.backgroundDim ?? 0.35;
    $('#cardWidth').value = settings.cardWidth || 320;
    buildSeSelect();
    $('#seSelect').value = settings.searchEngine || 'bing';
    $('#showDesc').checked = settings.showDescriptions !== false;
    $('#fontSize').value = settings.fontSize || 'medium';
    buildColors();
    buildPresets();
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--accent-2', settings.accentColor);
    applyBgPreview();
    applyCardWidthPreview();
    updatePreview();
    markActivePreset();
  }
  function updatePreview() {
    const preview = $('#bgPreview');
    const img = $('#previewImg');
    const url = $('#bgUrl').value.trim();
    if (url) {
      img.src = url;
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  }
  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  function wire() {
    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        applyBgPreview();
      });
    });
    $('#bgUrl').addEventListener('input', applyBgPreview);
    $('#bgUrl').addEventListener('input', updatePreview);
    $('#bgUrl').addEventListener('input', markActivePreset);
    $('#bgBlur').addEventListener('input', applyBgPreview);
    $('#bgDim').addEventListener('input', applyBgPreview);

    // 本地图片上传 -> 转为 data URL 插入输入框（自动选“自定义图片”）
    $('#bgFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const dataURL = await fileToDataURL(file);
      $('#bgUrl').value = dataURL;
      document.querySelector('[data-bg="image"]').classList.add('active');
      document.querySelectorAll('.seg-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.bg === 'image');
      });
      applyBgPreview();
      updatePreview();
      markActivePreset();
    });
    if ($('#bgClear')) {
      $('#bgClear').addEventListener('click', () => {
        $('#bgUrl').value = '';
        $('#bgFile').value = '';
        $('#bgPreview').classList.add('hidden');
        applyBgPreview();
        markActivePreset();
      });
    }
    $('#cardWidth').addEventListener('input', applyCardWidthPreview);
    $('#bgApply').addEventListener('click', () => {
      document.querySelector('[data-bg="image"]').click();
      applyBgPreview();
    });

    $('#btnSave').addEventListener('click', async () => {
      settings.backgroundStyle = document.querySelector('.seg-btn.active').dataset.bg;
      settings.backgroundImage = $('#bgUrl').value.trim() || '';
      settings.backgroundBlur = Number($('#bgBlur').value) || 0;
      settings.backgroundDim = Number($('#bgDim').value) || 0;
      settings.cardWidth = Number($('#cardWidth').value) || 320;
      settings.searchEngine = $('#seSelect').value;
      settings.showDescriptions = $('#showDesc').checked;
      settings.fontSize = $('#fontSize').value;
      const activeDot = document.querySelector('.color-dot.active');
      if (activeDot) settings.accentColor = activeDot.dataset.color;
      await GG.saveSettings(settings);
      GG.toast.show('设置已保存', 'success');
    });

    $('#btnResetBg').addEventListener('click', async () => {
      settings.backgroundImage = '';
      settings.backgroundStyle = 'default';
      settings.backgroundBlur = 0;
      settings.backgroundDim = 0.35;
      $('#bgUrl').value = '';
      $('#bgBlur').value = 0;
      $('#bgDim').value = 0.35;
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === 'default'));
      applyBgPreview();
      await GG.saveSettings(settings);
      GG.toast.show('已重置背景', 'success');
    });
  }

  async function init() {
    const data = await browser.storage.local.get('settings');
    settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
    load();
    wire();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
