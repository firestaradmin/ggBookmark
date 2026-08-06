/* GG Bookmark - settings page logic */

(() => {
  'use strict';
  const ACCENTS = ['#4f7cff', '#7a5bff', '#00c6a7', '#ff7a59', '#f54d6a', '#ffb84d', '#4f9fff'];
  const $ = (s) => document.querySelector(s);
  let settings = {};

  function applyBgPreview() {
    const bg = $('.gg-bg');
    const currentStyle = document.querySelector('.seg-btn.active').dataset.bg;
    if (currentStyle === 'image' && $('#bgUrl').value.trim()) {
      bg.dataset.style = 'image';
      bg.style.setProperty('--bg-image', `url("${$('#bgUrl').value.trim()}")`);
    } else if (currentStyle === 'gradient') {
      bg.dataset.style = 'gradient';
    } else {
      bg.dataset.style = 'default';
    }
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

  function load() {
    const seg = settings.backgroundStyle === 'image' ? 'image'
              : settings.backgroundStyle === 'gradient' ? 'gradient' : 'default';
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === seg));
    $('#bgUrl').value = settings.backgroundImage || '';
    buildSeSelect();
    $('#seSelect').value = settings.searchEngine || 'bing';
    $('#showDesc').checked = settings.showDescriptions !== false;
    $('#fontSize').value = settings.fontSize || 'medium';
    buildColors();
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--accent-2', settings.accentColor);
    applyBgPreview();
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
    $('#bgApply').addEventListener('click', () => {
      document.querySelector('[data-bg="image"]').click();
      applyBgPreview();
    });

    $('#btnSave').addEventListener('click', async () => {
      settings.backgroundStyle = document.querySelector('.seg-btn.active').dataset.bg;
      settings.backgroundImage = $('#bgUrl').value.trim() || '';
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
      $('#bgUrl').value = '';
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
