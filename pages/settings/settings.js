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
  const PRESET_PREFIX = 'preset:';
  function presetNameFromValue(value) {
    return value && value.startsWith(PRESET_PREFIX) ? value.slice(PRESET_PREFIX.length) : null;
  }
  function presetURL(name) {
    return browser.runtime.getURL('pics/wallpapers/' + name);
  }
  // 存储/导出时使用预设文件名标识，而非完整 URL
  function presetRef(name) {
    return PRESET_PREFIX + name;
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
      const raw = $('#bgUrl').value.trim();
      const preset = presetNameFromValue(raw);
      const imgUrl = preset ? presetURL(preset) : raw;
      bg.dataset.style = 'image';
      bg.style.setProperty('--bg-image', `url("${imgUrl}")`);
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
      d.dataset.name = name;
      d.title = name;
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.loading = 'lazy';
      d.appendChild(img);
      d.addEventListener('click', () => {
        $('#bgUrl').value = presetRef(name);
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
    const sel = presetNameFromValue(current);
    document.querySelectorAll('#presetGrid .preset').forEach((p) => {
      p.classList.toggle('active', sel ? p.dataset.name === sel : p.dataset.url === current);
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
  // 仅快照被卡片引用的书签文件夹子树（而非整个 Firefox 书签树），减小体积
  async function snapshotBookmarks(apps) {
    const ids = Array.from(new Set((apps || []).map((a) => a.folderId).filter(Boolean)));
    const subs = [];
    for (const id of ids) {
      try {
        const sub = await browser.bookmarks.getSubTree(id);
        if (sub && sub[0]) subs.push(sub[0]);
      } catch (e) { /* 文件夹可能已不存在 */ }
    }
    return subs;
  }
  async function hasExistingBookmarks() {
    for (const r of ['menu________', 'toolbar_____', 'unfiled_____']) {
      try {
        const kids = await browser.bookmarks.getChildren(r);
        if (kids && kids.length) return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }
  // 在“其他书签”下创建“GG Bookmark 导入”根，重建导出的书签子树，返回 { newPathToId, idToPath }
  async function recreateBookmarks(trees) {
    const idToPath = new Map();
    const oldPathToId = new Map();
    (trees || []).forEach((sub) => indexBookmarkPaths(sub, [], oldPathToId, idToPath));

    const top = await browser.bookmarks.create({ title: 'GG Bookmark 导入', parentId: 'unfiled_____' });
    const newPathToId = new Map();

    async function recreate(nodes, parentId, parentPath) {
      for (const n of nodes) {
        if (n.type === 'folder') {
          const f = await browser.bookmarks.create({ title: n.title, parentId, type: 'folder' });
          const p = parentPath.concat(n.title);
          newPathToId.set(p.join(PATH_SEP), f.id);
          if (n.children) await recreate(n.children, f.id, p);
        } else if (n.type === 'bookmark' && n.url) {
          await browser.bookmarks.create({ title: n.title || n.url, url: n.url, parentId });
        }
      }
    }
    for (const sub of (trees || [])) {
      await recreate(sub.children || [], top.id, []);
    }
    return { newPathToId, idToPath };
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
    const raw = $('#bgUrl').value.trim();
    if (!raw) {
      preview.classList.add('hidden');
      return;
    }
    const preset = presetNameFromValue(raw);
    img.src = preset ? presetURL(preset) : raw;
    preview.classList.remove('hidden');
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

    // 导出配置为 JSON 文件（不含壁纸图片数据，但包含主页面卡片配置与全部书签）
    $('#btnExport').addEventListener('click', async () => {
      const stored = await browser.storage.local.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings']);
      const cfg = {
        version: GG.VERSION,
        settings: Object.assign({}, stored.settings || {})
      };
      // 仅排除体积很大的本地上传（data URL）壁纸；内置预设壁纸的 runtime URL 予以保留
      if (cfg.settings.backgroundImage && cfg.settings.backgroundImage.startsWith('data:')) {
        delete cfg.settings.backgroundImage;
      }
      cfg.apps = stored.apps || [];
      cfg.categories = stored.categories || [];
      cfg.orderByCat = stored.orderByCat || {};
      cfg.activeCat = stored.activeCat || null;
      // 导出被卡片引用的书签子树（不含整个 Firefox 书签树）
      try {
        cfg.bookmarks = await snapshotBookmarks(stored.apps || []);
      } catch (e) {
        cfg.bookmarks = null;
      }
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ggbookmark-config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      GG.toast.show('已导出配置', 'success');
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
        const current = await browser.storage.local.get('settings');
        const currentBg = (current.settings || {}).backgroundImage || '';
        const importedSettings = Object.assign({}, GG.DEFAULTS, imported.settings || {});
        if (!importedSettings.backgroundImage) importedSettings.backgroundImage = currentBg;

        let apps = imported.apps || [];
        let skipBookmarks = false;

        // 导入书签：若会覆盖/新增已有书签，先提示用户备份
        if (imported.bookmarks) {
          const existing = await hasExistingBookmarks();
          if (existing && !window.confirm('导入的配置包含书签，将重新创建书签（可能与现有书签重复）。\n建议先到 Firefox 书签库备份现有书签，再继续导入。\n仍要继续？')) {
            // 仅跳过书签重建，仍导入设置与卡片配置
            skipBookmarks = true;
            GG.toast.show('已跳过书签导入，仅导入设置与卡片', 'info');
          }
          if (!skipBookmarks) {
            try {
              const { newPathToId, idToPath } = await recreateBookmarks(imported.bookmarks);
              apps = remapFolderIds(apps, idToPath, newPathToId);
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
          activeCat: imported.activeCat || null
        };
        await browser.storage.local.set(toSave);

        settings = importedSettings;
        load();
        // 通知主页面刷新卡片配置（若同时打开）
        browser.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
        GG.toast.show('已导入配置', 'success');
      } catch (err) {
        GG.toast.show('导入失败：文件无效', 'error');
      }
    });

    // 清除配置：恢复默认并删除本地存储（仅本扩展配置，不删除 Firefox 书签）
    $('#btnClear').addEventListener('click', async () => {
      if (!window.confirm('确定清除所有配置？将恢复默认设置且无法撤销（含卡片与壁纸）。\n注意：此操作仅清除本扩展配置，不会删除 Firefox 中的书签。')) return;
      await browser.storage.local.remove(['settings', 'apps', 'categories', 'orderByCat', 'activeCat']);
      settings = Object.assign({}, GG.DEFAULTS);
      load();
      browser.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
      GG.toast.show('已清除配置', 'success');
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
