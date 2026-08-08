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
    return GG.api.runtime.getURL('pics/wallpapers/' + name);
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
    if ((currentStyle === 'image' || currentStyle === 'preset') && $('#bgUrl').value.trim()) {
      const raw = $('#bgUrl').value.trim();
      const preset = presetNameFromValue(raw);
      const imgUrl = preset ? presetURL(preset) : raw;
      bg.dataset.style = 'image';
      bg.style.setProperty('--bg-image', `url("${imgUrl}")`);
    } else if (currentStyle === 'preset') {
      bg.dataset.style = 'default';
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
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === 'preset'));
        settings.backgroundImage = presetRef(name);
        settings.backgroundStyle = 'preset';
        toggleBgFields();
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
  async function recreateBookmarks(trees, targetParentId) {
    const idToPath = new Map();
    const oldPathToId = new Map();
    (trees || []).forEach((sub) => {
      indexBookmarkPaths(sub.node, [], oldPathToId, idToPath);
    });

    const root = targetParentId || 'toolbar_____';
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
          const p = parentPath.concat(n.title);
          newPathToId.set(p.join(PATH_SEP), f.id);
          if (n.children) await recreate(n.children, f.id, p);
        } else if (n.type === 'bookmark' && n.url) {
          if (!(await findExisting(parentId, n))) {
            await GG.api.bookmarks.create({ title: n.title || n.url, url: n.url, parentId });
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

  function toggleBgFields() {
    const style = (document.querySelector('.seg-btn.active') || {}).dataset?.bg || 'default';
    const imageField = document.getElementById('imageSourceField');
    const presetField = document.getElementById('presetField');
    const preview = document.getElementById('bgPreview');
    const hint = document.getElementById('bgHint');
    if (imageField) imageField.style.display = style === 'image' ? '' : 'none';
    if (presetField) presetField.style.display = style === 'preset' ? '' : 'none';
    // 预览仅在“自定义图片”下显示；预设壁纸只显示缩略图网格
    if (preview) {
      if (style === 'image') preview.classList.remove('hidden');
      else preview.classList.add('hidden');
    }
    if (hint) hint.style.display = (style === 'image' || style === 'preset') ? '' : 'none';
  }
  function load() {
    const seg = settings.backgroundStyle === 'preset' ? 'preset'
              : settings.backgroundStyle === 'image' ? 'image'
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
    if ($('#faviconSource')) $('#faviconSource').value = settings.faviconSource || GG.DEFAULTS.faviconSource;
    buildColors();
    buildPresets();
    buildImportFolderSelect();
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--accent-2', settings.accentColor);
    document.documentElement.dataset.fontSize = settings.fontSize || 'medium';
    document.documentElement.dataset.theme = settings.theme || 'dark';
    document.querySelectorAll('.theme-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === (settings.theme || 'dark'));
    });
    applyBgPreview();
    applyCardWidthPreview();
    updatePreview();
    markActivePreset();
    toggleBgFields();
    loadSync();
    renderSyncLogs();
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
    const triggers = Array.isArray(sync.triggers) ? sync.triggers : [];
    if ($('#syncTrigInterval')) $('#syncTrigInterval').checked = triggers.includes('interval');
    if ($('#syncTrigSettings')) $('#syncTrigSettings').checked = triggers.includes('settingsChange');
    if ($('#syncTrigBookmark')) $('#syncTrigBookmark').checked = triggers.includes('bookmarkChange');
    if ($('#syncInterval')) $('#syncInterval').value = sync.intervalMinutes || 30;
    const iv = document.getElementById('syncIntervalField');
    if (iv) iv.style.display = triggers.includes('interval') ? '' : 'none';
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
    return {
      enabled: $('#syncEnabled') ? $('#syncEnabled').checked : false,
      server: $('#syncServer') ? $('#syncServer').value.trim() : '',
      username: $('#syncUser') ? $('#syncUser').value.trim() : '',
      password: $('#syncPass') ? $('#syncPass').value : '',
      filename: ($('#syncFile') ? $('#syncFile').value.trim() : '') || 'ggbookmark-config.json',
      triggers: triggers,
      intervalMinutes: $('#syncInterval') ? (Number($('#syncInterval').value) || 30) : 30
    };
  }
  function updatePreview() {
    const preview = $('#bgPreview');
    const img = $('#previewImg');
    const style = (document.querySelector('.seg-btn.active') || {}).dataset?.bg || 'default';
    const raw = $('#bgUrl').value.trim();
    if (style !== 'image' || !raw) {
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
    // 背景相关输入框实时预览
    $('#bgUrl').addEventListener('input', () => {
      applyBgPreview();
      updatePreview();
      markActivePreset();
    });
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
      });
    });

    // 背景风格切换
    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        if (b.dataset.bg !== 'image' && b.dataset.bg !== 'preset') {
          settings.backgroundImage = '';
        }
        if (b.dataset.bg === 'preset') {
          // 切换到预设壁纸：若已有预设选择则应用，否则等用户点缩略图
          const active = document.querySelector('#presetGrid .preset.active');
          if (active) { settings.backgroundImage = presetRef(active.dataset.name); }
        }
        toggleBgFields();
        applyBgPreview();
        updatePreview();
        markActivePreset();
      });
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
    if ($('#btnClearImportFolder')) {
      $('#btnClearImportFolder').addEventListener('click', () => {
        $('#importFolderSelect').value = '';
        settings.bookmarkImportFolder = '';
        GG.saveSettings(settings);
        GG.toast.show('已清除默认导入文件夹', 'info');
      });
    }
    // 选择导入文件夹后即时保存，避免忘记点“保存设置”导致不生效
    if ($('#importFolderSelect')) {
      $('#importFolderSelect').addEventListener('change', () => {
        settings.bookmarkImportFolder = $('#importFolderSelect').value || '';
        GG.saveSettings(settings);
        GG.toast.show('已记住书签导入文件夹', 'success');
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
      settings.faviconSource = $('#faviconSource') ? $('#faviconSource').value : GG.DEFAULTS.faviconSource;
      settings.bookmarkImportFolder = $('#importFolderSelect').value || '';
      const activeTheme = document.querySelector('.theme-btn.active');
      if (activeTheme) settings.theme = activeTheme.dataset.theme;
      settings.sync = readSync();
      // 密码加密后存储（不落明文）
      if (GG.Sync && GG.Sync.encryptPassword && settings.sync.password) {
        settings.sync.password = await GG.Sync.encryptPassword(settings.sync.password);
      }
      const activeDot = document.querySelector('.color-dot.active');
      if (activeDot) settings.accentColor = activeDot.dataset.color;
      await GG.saveSettings(settings);
      if (GG.Sync && GG.Sync.scheduleAlarm) GG.Sync.scheduleAlarm();
      GG.toast.show('设置已保存', 'success');
    });

    if ($('#btnResetBg')) {
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

    // 导出配置为 JSON 文件（不含壁纸图片数据，但包含主页面卡片配置与全部书签）
    $('#btnExport').addEventListener('click', async () => {
      const stored = await GG.api.storage.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings']);
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
      // 导出被卡片引用的书签子树（不含整个 Firefox 书签树），并记录原始容器与完整路径
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
              const importFolder = importedSettings.bookmarkImportFolder
                || (await GG.api.storage.get('settings')).settings?.bookmarkImportFolder
                || '';
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
          activeCat: imported.activeCat || null
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
    if ($('#btnSyncUpload')) {
      $('#btnSyncUpload').addEventListener('click', async () => {
        const filename = settings.sync && settings.sync.filename ? settings.sync.filename : 'ggbookmark-config.json';
        try {
          await GG.Sync.upload();
          if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: true, msg: '上传成功' }).catch(() => {});
          GG.toast.show('已上传到服务器', 'success');
          renderSyncLogs();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'upload', source: '手动', target: 'webdav', filename, ok: false, msg: '上传失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('上传失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
        }
      });
    }
    if ($('#btnSyncDownload')) {
      $('#btnSyncDownload').addEventListener('click', async () => {
        const filename = settings.sync && settings.sync.filename ? settings.sync.filename : 'ggbookmark-config.json';
        try {
          await GG.Sync.download();
          if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: true, msg: '下载并应用成功' }).catch(() => {});
          GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
          GG.toast.show('已从服务器下载并应用', 'success');
          renderSyncLogs();
        } catch (e) {
          if (GG.Sync.log) GG.Sync.log({ type: 'download', source: '手动', target: 'webdav', filename, ok: false, msg: '下载失败：' + (e && e.message ? e.message : '未知错误') }).catch(() => {});
          GG.toast.show('下载失败：' + (e && e.message ? e.message : '未知错误'), 'error');
          renderSyncLogs();
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
      await GG.api.storage.remove(['settings', 'apps', 'categories', 'orderByCat', 'activeCat']);
      settings = Object.assign({}, GG.DEFAULTS);
      load();
      GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
      GG.toast.show('已清除配置', 'success');
    });
  }

  async function init() {
    const data = await GG.api.storage.get('settings');
    settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
    load();
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
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
