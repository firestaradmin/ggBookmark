/* GG Bookmark - new tab page logic */

(() => {
  'use strict';

  const state = {
    settings: {},
    apps: [],             // [{ id, title, folderId, recursive }]
    categories: [],       // [{ id, name }]
    activeCategory: null,
    cards: [],            // category filter result -> workspace order [{appId, categoryId}]
    history: [],          // undo stack
    trash: [],
    pinned: []            // 置顶快速访问 [{ id, url, title }]
  };

  let cardOrder = [];     // persisted order of {appId} among current category
  let colWidth = 320;     // global card column width (px), set in settings
  let suppressCardRender = false; // 拖拽高度等局部操作时，避免 onChanged 触发全量重渲染

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const catsBar = $('#catsBar');
  const pinbarItems = $('#pinbarItems');

  // ---------- Persistence ----------
  async function loadPersistent() {
    const data = await GG.api.storage.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings', 'pinned']);
    state.settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
    window.__ggSettings = state.settings;
    state.apps = data.apps || [];
    state.categories = data.categories || [];
    if (!state.categories.length) {
      state.categories = [{ id: 'cat0', name: '主要' }, { id: 'cat1', name: '工具' }, { id: 'cat2', name: '游戏' }];
    }
    state.activeCategory = data.activeCat || (state.categories[0] && state.categories[0].id) || null;
    state.pinned = Array.isArray(data.pinned) ? data.pinned : [];
    const byCat = data.orderByCat || {};
    cardOrder = byCat[state.activeCategory] || [];
    colWidth = state.settings.cardWidth || 320;
  }

  async function persist() {
    // 本页面自己的保存已自行触发渲染，抑制 onChanged 触发的重复 reloadAndRender；
    // 仅外部来源（设置页导入/清除）的 onChanged 会执行 reloadAndRender。
    suppressCardRender = true;
    try {
      const data = await GG.api.storage.get('orderByCat');
      const byCat = data.orderByCat || {};
      byCat[state.activeCategory] = cardOrder;
      await GG.api.storage.set({
        apps: state.apps,
        categories: state.categories,
        activeCat: state.activeCategory,
        orderByCat: byCat,
        pinned: state.pinned
      });
    } finally {
      suppressCardRender = false;
    }
  }

  // ---------- Background image ----------
  function resolveBgImage(value) {
    if (value && value.startsWith('preset:')) {
      const name = value.slice('preset:'.length);
      return GG.api.runtime.getURL('pics/wallpapers/' + name);
    }
    return value;
  }
  function applyBg() {
    const bg = $('.gg-bg');
    const s = state.settings;
    const hasImage = (s.backgroundStyle === 'image' || s.backgroundStyle === 'preset') && s.backgroundImage;
    bg.dataset.style = hasImage ? 'image' : (s.backgroundStyle === 'gradient' ? 'gradient' : 'default');
    bg.style.setProperty('--bg-image', `url("${resolveBgImage(s.backgroundImage)}")`);
    bg.style.setProperty('--bg-blur', `${s.backgroundBlur || 0}px`);
    bg.style.setProperty('--bg-dim', `${s.backgroundDim ?? 0.15}`);
    document.documentElement.style.setProperty('--accent-color', s.accentColor);
    document.documentElement.style.setProperty('--accent', s.accentColor);
    document.documentElement.style.setProperty('--accent-2', s.accentColor);
    document.documentElement.dataset.fontSize = s.fontSize || 'medium';
    document.documentElement.dataset.theme = s.theme || 'dark';
    document.querySelectorAll('.theme-btn').forEach((b) => {
      b.classList.toggle('active', (b.dataset.theme === (s.theme || 'dark')));
    });
    applyGlass();
  }

  // 应用磨砂玻璃设置（顶部工具栏/卡片/置顶行的模糊度、背景颜色与透明度）
  function applyGlass() {
    const s = state.settings;
    const blur = (typeof s.glassBlur === 'number' && s.glassBlur >= 0) ? s.glassBlur : 20;
    const op = (typeof s.glassOpacity === 'number' && s.glassOpacity >= 0 && s.glassOpacity <= 1) ? s.glassOpacity : 0.06;
    let color = s.glassColor || '#ffffff';
    // 解析颜色为 rgb
    let r = 255, g = 255, b = 255;
    if (/^#([0-9a-f]{6})$/i.test(color)) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    }
    document.documentElement.style.setProperty('--glass-blur', blur + 'px');
    document.documentElement.style.setProperty('--panel-bg', `rgba(${r}, ${g}, ${b}, ${op})`);
  }

  // 根据同步模式触发上传（由设置/书签变更事件调用）
  let syncTimer = null;
  const SYNC_SOURCE = { settingsChange: '设置更改', bookmarkChange: '书签变更', interval: '定时同步' };
  function maybeSync(mode) {
    if (!GG.Sync) return;
    const raw = (state.settings && state.settings.sync) || GG.DEFAULTS.sync;
    const sync = (GG.Sync.normalizeTriggers ? GG.Sync.normalizeTriggers(raw) : raw);
    if (!sync.enabled || !sync.triggers.includes(mode)) {
      if (window.location && window.location.href.indexOf('newtab') !== -1) {
        console.log('[gg-sync] maybeSync 跳过', mode, 'enabled=', sync.enabled, 'triggers=', sync.triggers);
      }
      return;
    }
    // 防抖：短时间内多次变更只同步一次
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      doUpload(SYNC_SOURCE[mode] || mode);
    }, 1500);
  }

  // 统一的手动/自动上传入口：上传并弹出结果提示（同时记录日志）
  async function doUpload(source) {
    if (!GG.Sync || !GG.Sync.upload) return;
    const filename = ((state.settings && state.settings.sync && state.settings.sync.filename) || 'ggbookmark-config.json');
    const base = { type: 'upload', source: source || '手动', target: 'webdav', filename };
    try {
      await GG.Sync.upload();
      if (GG.Sync.log) GG.Sync.log(Object.assign({}, base, { ok: true, msg: '上传成功' })).catch(() => {});
      GG.toast.show((source ? source + '：' : '') + '已上传到服务器', 'success');
    } catch (e) {
      if (GG.Sync.log) GG.Sync.log(Object.assign({}, base, { ok: false, msg: '上传失败：' + (e && e.message) })).catch(() => {});
      GG.toast.show((source ? source + '失败：' : '上传失败：') + (e && e.message), 'error');
    }
  }

  // ---------- Search ----------
  function renderSearchEngine() {
    const se = GG.SEARCH_ENGINES[state.settings.searchEngine] || GG.SEARCH_ENGINES.bing;
    const seIcon = $('#seIcon');
    seIcon.style.backgroundImage = `url("../../icons/se/${state.settings.searchEngine}.svg")`;
    $('#searchInput').placeholder = `搜索（${se.name}）...`;
  }
  function doSearch() {
    const q = $('#searchInput').value.trim();
    if (!q) return;
    const se = GG.SEARCH_ENGINES[state.settings.searchEngine] || GG.SEARCH_ENGINES.bing;
    GG.api.tabs.update({ url: se.url.replace('{q}', encodeURIComponent(q)) });
  }

  // ---------- 置顶快速访问 ----------
  const PIN_MIME = 'application/x-gg-pin';
  function renderPinbar() {
    const bar = $('#pinbar');
    if (!bar) return;
    // 空置顶时隐藏整行
    bar.classList.toggle('empty', !state.pinned.length);
    pinbarItems.innerHTML = '';
    state.pinned.forEach((pin, idx) => {
      const el = document.createElement('div');
      el.className = 'pin-item';
      el.dataset.url = pin.url;
      el.dataset.idx = idx;
      el.draggable = true;

      const ico = document.createElement('span');
      ico.className = 'pin-ico';
      GG.renderFavicon(ico, pin.url, pin.title, (state.settings && state.settings.faviconSource) || GG.DEFAULTS.faviconSource);

      const name = document.createElement('span');
      name.className = 'pin-name';
      name.textContent = pin.title || hostOf(pin.url);
      name.dataset.tip = pin.url;

      el.append(ico, name);
      el.addEventListener('click', () => {
        GG.api.tabs.create({ url: pin.url });
      });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); openPinMenu(e, idx, el); });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(PIN_MIME, String(idx));
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(PIN_MIME)) e.preventDefault(); });
      el.addEventListener('drop', (e) => {
        if (!e.dataTransfer.types.includes(PIN_MIME)) return;
        e.preventDefault();
        const from = Number(e.dataTransfer.getData(PIN_MIME));
        const to = idx;
        if (from === to) return;
        const arr = state.pinned.slice();
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        state.pinned = arr;
        persist();
        renderPinbar();
      });

      pinbarItems.appendChild(el);
    });
  }

  let pinMenuEl = null;
  function openPinMenu(e, idx, el) {
    closePinMenu();
    const pin = state.pinned[idx];
    if (!pin) return;
    const menu = document.createElement('div');
    menu.className = 'menu glass pin-ctx';
    const items = [
      { label: '在新标签打开', ic: 'external', fn: () => GG.api.tabs.create({ url: pin.url }) },
      { label: '复制链接', ic: 'copy', fn: () => navigator.clipboard.writeText(pin.url).then(() => GG.toast.show('已复制链接', 'success')) },
      { label: '编辑书签', ic: 'settings', fn: () => editPin(idx) },
      { label: '取消置顶', ic: 'backspace', fn: () => removePin(idx), danger: true }
    ];
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.innerHTML = GG.icon(it.ic) + '<span></span>';
      b.querySelector('span').textContent = it.label;
      b.addEventListener('click', () => { closePinMenu(); it.fn(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    pinMenuEl = menu;
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }
  function closePinMenu() {
    if (pinMenuEl) { pinMenuEl.remove(); pinMenuEl = null; }
  }
  function removePin(idx) {
    state.pinned.splice(idx, 1);
    persist();
    renderPinbar();
  }
  function editPin(idx) {
    const pin = state.pinned[idx];
    if (!pin) return;
    if (!GG.bookmarkEditor) return;
    GG.bookmarkEditor.open({
      title: pin.title,
      url: pin.url,
      onSave: (data) => {
        pin.title = data.title || pin.title;
        pin.url = data.url || pin.url;
        persist();
        renderPinbar();
        GG.toast.show('已更新置顶', 'success');
      }
    });
  }
  function addPin(url, title) {
    if (!url) return;
    if (!state.pinned.some((p) => p.url === url)) {
      state.pinned.push({ id: 'pin_' + Date.now(), url, title: title || '' });
      persist();
      renderPinbar();
    }
  }
  function wirePinbar() {
    const addBtn = $('#pinbarAdd');
    if (addBtn) addBtn.addEventListener('click', () => openPinAddPicker());
  }
  // 从书签选择置顶项（+ 按钮）：引导输入网址，或提示右键书签项置顶
  async function openPinAddPicker() {
    const chosen = prompt('输入要置顶的网址：\n\n更便捷的方式：在卡片里的书签上右键 → 选择「置顶到快速访问」\n\n示例：https://example.com');
    if (!chosen) return;
    let url = chosen.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!url) return;
    addPin(url, hostOf(url));
    GG.toast.show('已添加到置顶', 'success');
  }

  // ---------- Categories ----------
  function renderCats() {
    catsBar.innerHTML = '';
    state.categories.forEach((cat) => {
      const b = document.createElement('button');
      b.className = 'cat' + (cat.id === state.activeCategory ? ' active' : '');
      b.dataset.id = cat.id;
      b.innerHTML = `<span class="cat-name"></span>`;
      b.querySelector('.cat-name').textContent = cat.name;
      b.addEventListener('click', () => setActiveCategory(cat.id));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCatMenu(e, cat);
      });
      catsBar.appendChild(b);
    });
    // single "+" button at the far right of the category bar
    const add = document.createElement('button');
    add.className = 'cat cat-add';
    add.dataset.tip = '新建分类';
    add.textContent = '＋';
    add.addEventListener('click', (e) => { e.stopPropagation(); addCategory(); });
    catsBar.appendChild(add);
  }

  // Right-click context menu for a category (rename / delete / add).
  let catMenuEl = null;
  function openCatMenu(e, cat) {
    closeCatMenu();
    const menu = document.createElement('div');
    menu.className = 'menu glass cat-ctx';
    const items = [
      { label: '重命名', fn: () => renameCategory(cat.id) },
      { label: '新建分类', fn: () => addCategory() },
      { label: '删除分类', danger: true, fn: () => removeCategory(cat.id) },
    ];
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.addEventListener('click', () => { closeCatMenu(); it.fn(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    catMenuEl = menu;
    // position near the cursor, clamped to viewport
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }
  function closeCatMenu() {
    if (catMenuEl) { catMenuEl.remove(); catMenuEl = null; }
  }

  function renameCategory(id) {
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return;
    const name = prompt('重命名分类：', cat.name);
    if (!name || !name.trim()) return;
    cat.name = name.trim();
    persist();
    renderCats();
  }

  function setActiveCategory(id) {
    state.activeCategory = id;
    GG.api.storage.get('orderByCat').then((d) => {
      cardOrder = (d.orderByCat || {})[id] || [];
      persist().then(() => {});
      renderAll();
    });
  }

  function addCategory() {
    const name = prompt('输入分类名称：', '新分类');
    if (!name || !name.trim()) return;
    state.categories.push({ id: 'cat_' + Date.now(), name: name.trim() });
    persist();
    renderCats();
  }

  function removeCategory(id) {
    if (!confirm('删除分类及其下的卡片？')) return;
    const removed = []; // for undo handled elsewhere
    state.apps = state.apps.map((a) => { const c = a.categoryId; if (c === id) removed.push(a); return a; }).filter((a) => a.categoryId !== id);
    state.categories = state.categories.filter((c) => c.id !== id);
    if (state.activeCategory === id) {
      state.activeCategory = (state.categories[0] && state.categories[0].id) || null;
    }
    pushUndo({ type: 'removeCategory', categoryId: id, apps: removed, name: removed.length });
    persist().then(renderAll);
  }

  // ---------- Cards (apps) ----------
  function activeCards() {
    return state.apps.filter((a) => a.categoryId === state.activeCategory);
  }

  function reorderCards() {
    const active = activeCards();
    const orderMap = new Map(cardOrder.map((o, i) => [o.appId, i]));
    active.sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
      const ib = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
      return ia === ib ? a.title.localeCompare(b.title, 'zh') : ia - ib;
    });
    return active;
  }

  function appendOrder(appId) {
    if (!cardOrder.some((o) => o.appId === appId)) cardOrder.push({ appId });
  }

  // ---------- Tile (bookmark) ----------
  async function buildTiles(card, folderId, recursive, app) {
    let list;
    try {
      list = await GG.api.bookmarks.getChildren(folderId);
    } catch (e) {
      list = [];
    }
    const items = list || [];
    let bookmarks = items.filter((b) => b.type === 'bookmark');
    if (recursive) {
      const folders = items.filter((b) => b.type === 'folder');
      for (const f of folders) {
        try {
          const sub = await GG.api.bookmarks.getChildren(f.id);
          bookmarks = bookmarks.concat((sub || []).filter((b) => b.type === 'bookmark'));
        } catch (e) {}
      }
    }
    const body = card.querySelector('.card-body');
    body.innerHTML = '';
    const tpl = $('#bookmarkTileTpl');
    bookmarks.forEach((bm) => {
      const tile = tpl.content.cloneNode(true).querySelector('.tile');
      const icon = tile.querySelector('.tile-icon');
      icon.dataset.title = bm.title || bm.url;
      // icon: 依次尝试多个在线来源，全部失败则显示首字母
      GG.renderFavicon(icon, bm.url, bm.title, (state.settings && state.settings.faviconSource) || GG.DEFAULTS.faviconSource);
      tile.querySelector('.tile-title').textContent = bm.title || (function () { try { return new URL(bm.url).host; } catch (e) { return bm.url; } })();
      tile.querySelector('.tile-desc').textContent = hostOf(bm.url);
      tile.dataset.url = bm.url;
      tile.dataset.bookmarkId = bm.id;
      tile.dataset.title = bm.title || bm.url;

      tile.addEventListener('click', (e) => {
        if (e.target.closest('.tile-more')) return;
        GG.api.tabs.create({ url: bm.url });
      });

      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTileMenu(e.clientX, e.clientY, tile, bm, card);
      });

      body.appendChild(tile);
    });
    // shortcut & empty note
    if (!bookmarks.length) {
      const li = document.createElement('li');
      li.className = 'tile-empty';
      li.textContent = '这个文件夹是空的';
      body.appendChild(li);
    }
    // tiles 渲染完成后重算紧凑模式：此时 tile 数量已正确，
    // 否则 buildCardEl 里同步调用 applyCompact 时 tiles 尚未加载，会误判。
    applyCompact(card, app);
  }

  // 判断 childId 是否位于 ancestorId 的子树内（用于 recursive 卡片）
  async function isFolderInTree(childId, ancestorId) {
    if (childId === ancestorId) return true;
    try {
      const tree = await GG.api.bookmarks.getSubTree(ancestorId);
      const root = tree && tree[0];
      if (!root) return false;
      let found = false;
      (function walk(n) {
        (n.children || []).forEach((c) => {
          if (c.id === childId) found = true;
          else walk(c);
        });
      })(root);
      return found;
    } catch (e) {
      return false;
    }
  }

  // 书签增删改后，只刷新受影响的卡片（重新获取书签列表并重算紧凑）
  async function refreshCardsForFolder(folderId) {
    if (!folderId) return;
    // 找出绑定该文件夹（或递归包含）的卡片
    for (const app of state.apps) {
      if (!app.folderId) continue;
      const direct = app.folderId === folderId;
      const recursiveHit = app.recursive && await isFolderInTree(folderId, app.folderId);
      if (!direct && !recursiveHit) continue;
      const card = document.querySelector(`.card[data-folder-id="${CSS.escape(app.folderId)}"]`);
      if (!card) continue;
      // 重新加载该卡片书签
      await buildTiles(card, app.folderId, app.recursive, app);
      applyExclusions(card, app);
    }
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  function openMenu(menu, anchor) {
    document.querySelectorAll('.card-menu.open').forEach((m) => {
      m.classList.remove('open');
      m.closest('.card')?.classList.remove('menu-open');
    });
    // Decide whether to open to the left (when the card sits near the right edge)
    menu.classList.remove('left');
    menu.classList.add('open');
    menu.closest('.card')?.classList.add('menu-open');
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) menu.classList.add('left');
    else menu.classList.remove('left');
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.classList.remove('open');
        menu.closest('.card')?.classList.remove('menu-open');
      }
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function openTileMenu(x, y, tile, bm, card) {
    closeTileMenu();
    const menu = document.createElement('div');
    menu.className = 'menu glass tile-ctx';
    const add = (label, ic, handler, danger) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (danger ? ' danger' : '');
      b.innerHTML = GG.icon(ic) + '<span></span>';
      b.querySelector('span').textContent = label;
      b.addEventListener('click', () => { closeTileMenu(); handler(); });
      menu.appendChild(b);
    };
    add('打开', 'external', () => GG.api.tabs.create({ url: bm.url }));
    add('复制链接', 'copy', () => navigator.clipboard.writeText(bm.url).then(() => GG.toast.show('已复制链接', 'success')));
    add('编辑书签', 'settings', () => editBookmark(bm, tile));
    add('置顶到快速访问', 'target', () => { addPin(bm.url, bm.title); GG.toast.show('已添加到置顶', 'success'); });
    add('移出卡片', 'backspace', () => removeTile(tile, bm, card));
    add('删除书签', 'trash', () => deleteBookmark(tile, bm, card), true);
    document.body.appendChild(menu);
    tileMenuEl = menu;
    menu.style.left = Math.min(x, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 8) + 'px';
  }

  let tileMenuEl = null;
  function closeTileMenu() {
    if (tileMenuEl) { tileMenuEl.remove(); tileMenuEl = null; }
  }

  function removeTile(tile, bm, card) {
    tile.remove();
    const app = state.apps.find((a) => a.id === card.dataset.appId && a.folderId === card.dataset.folderId);
    if (app) {
      ensureExclusions(app, bm.url);
      GG.toast.show('已隐藏此书签', 'success');
    }
  }

  function ensureExclusions(app, url) {
    app.excluded = app.excluded || [];
    if (!app.excluded.includes(url)) {
      app.excluded.push(url);
      persist();
    }
  }

  function deleteBookmark(tile, bm, card) {
    if (!confirm(`确定删除书签“${bm.title || bm.url}”？`)) return;
    GG.api.bookmarks.remove(bm.id).then(() => {
      tile.remove();
      pushUndo({ type: 'restoreBookmark', bookmarkId: bm.id, parentId: (card.dataset.folderId) });
      GG.toast.show('已删除', 'success');
    }, () => GG.toast.show('删除失败', 'error'));
  }

  // 编辑书签（名称/链接），通过可复用浮动窗口
  function editBookmark(bm, tile) {
    if (!GG.bookmarkEditor) return;
    GG.bookmarkEditor.open({
      title: bm.title,
      url: bm.url,
      onSave: async (data) => {
        const changes = {};
        if (data.title && data.title !== bm.title) changes.title = data.title;
        if (data.url && data.url !== bm.url) changes.url = data.url;
        if (!Object.keys(changes).length) return;
        try {
          await GG.api.bookmarks.update(bm.id, changes);
          // 更新本地显示
          bm.title = data.title || bm.title;
          bm.url = data.url || bm.url;
          if (tile) {
            tile.querySelector('.tile-title').textContent = bm.title || (function () { try { return new URL(bm.url).host; } catch (e) { return bm.url; } })();
            tile.querySelector('.tile-desc').textContent = hostOf(bm.url);
            tile.dataset.url = bm.url;
            tile.dataset.title = bm.title || bm.url;
            const icon = tile.querySelector('.tile-icon');
            GG.renderFavicon(icon, bm.url, bm.title, (state.settings && state.settings.faviconSource) || GG.DEFAULTS.faviconSource);
          }
          GG.toast.show('已更新书签', 'success');
        } catch (e) {
          GG.toast.show('更新失败：' + (e && e.message), 'error');
        }
      }
    });
  }

  // ---------- Card rendering ----------
  // Each app may carry an explicit `col` (column index) so the user can freely
  // place cards into any column. When the column count changes or `col` is
  // missing/out-of-range, we re-balance by keeping existing assignments and
  // appending overflow cards to the emptiest column.
  function assignColumns(cards, cols) {
    // clamp/normalize existing col values; returns true if any col changed
    const buckets = Array.from({ length: cols }, () => []);
    let dirty = false;
    cards.forEach((app) => {
      let c = (typeof app.col === 'number') ? app.col : -1;
      if (c < 0 || c >= cols) c = -1;
      if (c === -1) {
        // place into the shortest column (keeps two-card same-column possible)
        let minIdx = 0;
        for (let i = 1; i < cols; i++) if (buckets[i].length < buckets[minIdx].length) minIdx = i;
        c = minIdx;
      }
      if (app.col !== c) { app.col = c; dirty = true; }
      buckets[c].push(app);
    });
    // sort each column by the global cardOrder
    const orderMap = new Map(cardOrder.map((o, i) => [o.appId, i]));
    buckets.forEach((list) => {
      list.sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
        return ia === ib ? a.title.localeCompare(b.title, 'zh') : ia - ib;
      });
    });
    return { buckets, dirty };
  }

  function renderCards() {
    const cards = reorderCards();
    grid.innerHTML = '';
    const tpl = $('#cardTpl');
    const cols = computedColumnCount();
    const { buckets, dirty } = assignColumns(cards, cols);
    // build column wrappers
    const colEls = [];
    for (let i = 0; i < cols; i++) {
      const c = document.createElement('div');
      c.className = 'grid-col';
      c.dataset.col = i;
      colEls.push(c);
      grid.appendChild(c);
    }
    // place each card into its assigned column
    buckets.forEach((list, colIdx) => {
      list.forEach((app) => {
        const card = buildCardEl(app, tpl);
        colEls[colIdx].appendChild(card);
      });
      // flexible filler so the column always has droppable empty space
      // (reaching the bottom of the grid), not just the 18px gaps.
      const fill = document.createElement('div');
      fill.className = 'col-fill';
      colEls[colIdx].appendChild(fill);
    });
    if (cards.length) grid.dataset.empty = 'false'; else grid.dataset.empty = 'true';
    // 空状态时重建居中浮动的引导提示（grid.innerHTML='' 会清掉静态的 .grid-empty）
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'grid-empty';
      const btn = document.createElement('button');
      btn.className = 'empty-add-btn';
      btn.innerHTML = GG.icon('addCard');
      btn.dataset.tip = '创建新卡片';
      btn.addEventListener('click', () => createBlankCard());
      const p = document.createElement('p');
      p.textContent = '还没有卡片';
      const sub = document.createElement('p');
      sub.className = 'sub';
      sub.innerHTML = '在空白处<strong>右键</strong>，或点击右上角<strong>“卡片添加”</strong>，选择一个书签文件夹来生成卡片。';
      empty.append(btn, p, sub);
      grid.appendChild(empty);
    }
    // persist normalized col assignments asynchronously (avoid feedback loop)
    if (dirty) persist();
  }

  function buildCardEl(app, tpl) {
    const card = tpl.content.cloneNode(true).querySelector('.card');
    card.dataset.appId = app.id;
    card.dataset.folderId = app.folderId;
    card.dataset.recursive = app.recursive ? '1' : '0';
    card.querySelector('.card-title').textContent = app.title;
    const titleEl = card.querySelector('.card-title');
    titleEl.dataset.tip = '双击重命名';
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editCardTitle(card, app, titleEl);
    });
    const body = card.querySelector('.card-body');
    body.dataset.appId = app.id;
    const fit = app.fitMode === 'auto';
    if (fit) body.dataset.fit = 'auto';
    else if (app.bodyH) body.style.setProperty('--card-body-h', app.bodyH + 'px');
    setupCardMenu(card, app);
    setupCardDrag(card, app);
    if (!app.folderId) {
      card.classList.add('unconfigured');
      const body = card.querySelector('.card-body');
      body.innerHTML = '';
      const ph = document.createElement('button');
      ph.className = 'card-set-folder';
      ph.innerHTML = GG.icon('panelSide') + '<span>设置文件夹</span>';
      ph.addEventListener('click', (e) => { e.stopPropagation(); openPicker(card, app); });
      body.appendChild(ph);
    } else {
      buildTiles(card, app.folderId, app.recursive, app);
      applyExclusions(card, app);
    }
    setupCardResize(card, app);
    const fitBtn = card.querySelector('.card-fit');
    const syncFitBtn = () => {
      const auto = app.fitMode === 'auto';
      fitBtn.innerHTML = GG.icon(auto ? 'heightAuto' : 'heightAutoOff');
      fitBtn.dataset.tip = auto ? '适应高度：开（点击固定高度）' : '适应高度：关（点击自动适应）';
      fitBtn.classList.toggle('active', auto);
    };
    syncFitBtn();
    fitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.fitMode = app.fitMode === 'auto' ? 'fixed' : 'auto';
      persist();
      renderCards();
    });
    const compactBtn = card.querySelector('.card-compact');
    const syncCompactBtnCard = () => {
      const ic = app.compact === true ? 'compactOn' : (app.compact === false ? 'compactOff' : 'compactAuto');
      const title = app.compact === true ? '当前紧凑模式：固定开启（点击关闭/自动）'
        : (app.compact === false ? '当前紧凑模式：固定关闭（点击恢复自动）' : '当前紧凑模式：自动模式（点击全部开启）');
      compactBtn.innerHTML = GG.icon(ic);
      compactBtn.dataset.tip = title;
      compactBtn.classList.toggle('active', app.compact !== false);
    };
    syncCompactBtnCard();
    compactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.compact = app.compact === undefined ? true : (app.compact ? false : undefined);
      persist();
      renderCards();
    });
    applyCompact(card, app);
    return card;
  }

  function applyExclusions(card, app) {
    if (!app.excluded || !app.excluded.length) return;
    const body = card.querySelector('.card-body');
    app.excluded.forEach((url) => {
      const t = body.querySelector(`.tile[data-url="${CSS.escape(url)}"]`);
      if (t) t.remove();
    });
  }

  function editCardTitle(card, app, titleEl) {
    if (titleEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'card-title-edit';
    input.value = app.title;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
    const finish = (save) => {
      if (save && input.value.trim() && input.value.trim() !== app.title) {
        const newTitle = input.value.trim();
        app.title = newTitle;
        persist();
        GG.api.bookmarks.update(app.folderId, { title: newTitle }).catch(() => {});
      }
      titleEl.textContent = app.title;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // Compact mode: when a card's body is short, tiles collapse to a single row
  // (title + domain on one line) with a smaller icon.
  // app.compact: undefined = auto-detect, true/false = per-card user override.
  // The global "compact mode" menu writes the same value into every card's
  // app.compact, so each card can still be overridden individually later.
  function resolveCompact(app) {
    return app.compact; // may be undefined -> caller handles auto-detect
  }
  function applyCompact(card, app) {
    const verbosePerTile = 44;
    let compact = resolveCompact(app);
    if (compact === undefined) {
      const body = card.querySelector('.card-body');
      const tileCount = body.querySelectorAll('.tile').length || 1;
      const bodyH = app.fitMode === 'auto'
        ? Math.max(body.scrollHeight, body.clientHeight)
        : (app.bodyH || body.clientHeight);
      compact = (bodyH / tileCount) < verbosePerTile && bodyH > 0;
    }
    card.classList.toggle('compact', !!compact);
  }

  // Live recompute during resize; only reflects DOM, does not persist pref.
  function recomputeCompact(card, app) {
    if (app.compact !== undefined) {
      card.classList.toggle('compact', !!app.compact);
      return;
    }
    const verbosePerTile = 44;
    const body = card.querySelector('.card-body');
    const tileCount = body.querySelectorAll('.tile').length || 1;
    const bodyH = app.fitMode === 'auto' ? body.scrollHeight : (app.bodyH || body.clientHeight);
    const compact = (bodyH / tileCount) < verbosePerTile && bodyH > 0;
    card.classList.toggle('compact', !!compact);
  }

  // ---------- Card resize (corner drag, vertical only) ----------
  // Vertical drag -> this card's body height.
  // Column width is controlled globally in settings.
  function setupCardResize(card, app) {
    const handle = card.querySelector('.card-resize');
    // 同步卡片上的「自适应高度」按钮图标状态（拖动后 fitMode 变为 fixed）
    const updateFitBtn = () => {
      const fitBtn = card.querySelector('.card-fit');
      if (!fitBtn) return;
      const auto = app.fitMode === 'auto';
      fitBtn.innerHTML = GG.icon(auto ? 'heightAuto' : 'heightAutoOff');
      fitBtn.dataset.tip = auto ? '适应高度：开（点击固定高度）' : '适应高度：关（点击自动适应）';
      fitBtn.classList.toggle('active', auto);
    };
    // vertical-only cursor is handled via CSS
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      // fitMode 为 undefined（如新建空白卡片）时按自适应高度处理，
      // 否则会误用 app.bodyH||360 导致起始高度错误（首次拖动跳变）。
      const startH = (app.fitMode === 'auto' || app.fitMode === undefined)
        ? Math.max(card.querySelector('.card-body').offsetHeight, card.querySelector('.card-body').scrollHeight)
        : (app.bodyH || 360);
      let moved = false;
      app.fitMode = 'fixed';
      updateFitBtn();

      const onMove = (ev) => {
        moved = true;
        const dy = ev.clientY - startY;
        const newH = Math.max(120, Math.round(startH + dy));
        app.bodyH = newH;
        const body = card.querySelector('.card-body');
        body.style.setProperty('--card-body-h', newH + 'px');
        body.dataset.fit = '';
        recomputeCompact(card, app);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) {
          // 仅保存高度/紧凑状态，不触发全量重渲染（onChanged 会跳过）
          suppressCardRender = true;
          persist().then(() => { suppressCardRender = false; recomputeCompact(card, app); updateFitBtn(); });
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Number of columns based on the global column width setting
  function computedColumnCount() {
    const gap = 18;
    const w = grid.clientWidth || document.body.clientWidth || 900;
    const cw = colWidth || 320;
    return Math.max(1, Math.min(Math.floor((w + gap) / (cw + gap)), 6));
  }

  // Set every card to auto-fit (height expands to show all children).
  // Preserve each card's explicit compact preference; auto-detected (undefined)
  // values will recompute against the new full height during render.
  function fitAllCards() {
    state.apps.forEach((a) => {
      if (a.categoryId === state.activeCategory) {
        a.fitMode = 'auto';
      }
    });
    persist();
    renderCards();
    GG.toast.show('已按子项数量调整所有卡片高度', 'success');
  }

  // Global "view" menu: batch-set compact mode / fit mode on every card.
  // Writing directly into each app.compact / app.fitMode means a card can
  // still be overridden individually from its own card menu afterwards.
  function syncViewBtn() {
    const btn = $('#btnView');
    if (!btn) return;
    const mode = globalCompact();
    // const ic = mode === 'on' ? 'compactOn' : (mode === 'off' ? 'compactOff' : 'compactAuto');
    // btn.innerHTML = GG.icon(ic);
    btn.innerHTML = GG.icon('cardMenu');
    btn.dataset.tip = '显示设置：紧凑模式与卡片高度';
  }
  // Derive the current global compact state from existing cards.
  function globalCompact() {
    const on = state.apps.filter((a) => a.compact === true).length;
    const off = state.apps.filter((a) => a.compact === false).length;
    const auto = state.apps.filter((a) => a.compact === undefined).length;
    const total = state.apps.length || 1;
    if (on === total) return 'on';
    if (off === total) return 'off';
    if (auto === total) return 'auto';
    return 'mixed';
  }
  function globalFit() {
    const auto = state.apps.filter((a) => a.fitMode === 'auto').length;
    const fixed = state.apps.filter((a) => a.fitMode !== 'auto').length;
    const total = state.apps.length || 1;
    if (auto === total) return 'auto';
    if (fixed === total) return 'fixed';
    return 'mixed';
  }
  function applyGlobalCompact(val) {
    // val: 'auto' | 'on' | 'off'  -> undefined | true | false
    const v = val === 'on' ? true : (val === 'off' ? false : undefined);
    state.apps.forEach((a) => { a.compact = v; });
    persist(); renderCards();
    const label = val === 'on' ? '已设置所有卡片为紧凑开启' : (val === 'off' ? '已设置所有卡片为紧凑关闭' : '已恢复所有卡片为紧凑自动');
    GG.toast.show(label, 'success');
  }
  function applyGlobalFit(val) {
    state.apps.forEach((a) => { a.fitMode = val === 'auto' ? 'auto' : 'fixed'; });
    persist(); renderCards();
    GG.toast.show(val === 'auto' ? '已设置所有卡片为自适应高度' : '已设置所有卡片为固定高度', 'success');
  }
  function syncViewMenu() {
    const menu = $('#viewMenu');
    if (!menu) return;
    const c = globalCompact();
    const f = globalFit();
    menu.querySelectorAll('[data-view="compact"]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.val === c);
    });
    menu.querySelectorAll('[data-view="fit"]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.val === f);
    });
  }
  // 书签导入文件夹：下拉填充 + 选择/清除时即时保存到 storage
  async function wireImportFolder() {
    const sel = document.getElementById('importFolderSelect');
    if (!sel) return;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '（每次导入时手动选择）';
    sel.appendChild(placeholder);

    try {
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
    } catch (e) { /* ignore */ }

    const saved = await GG.api.storage.get('settings');
    sel.value = (saved.settings && saved.settings.bookmarkImportFolder) || '';

    sel.addEventListener('change', () => {
      const folder = sel.value || '';
      state.settings.bookmarkImportFolder = folder;
      GG.saveSettings(state.settings);
      GG.toast.show(folder ? '已记住书签导入文件夹' : '已清除默认导入文件夹', folder ? 'success' : 'info');
    });
    const clearBtn = document.getElementById('btnClearImportFolder');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      sel.value = '';
      state.settings.bookmarkImportFolder = '';
      GG.saveSettings(state.settings);
      GG.toast.show('已清除默认导入文件夹', 'info');
    });
  }

  function wireViewMenu() {
    const btn = $('#btnView');
    const menu = $('#viewMenu');
    if (!btn || !menu) return;
    btn.innerHTML = GG.icon('compactAuto');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.contains('open');
      document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
      if (!open) { syncViewMenu(); menu.classList.add('open'); }
    });
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (!item) return;
      if (item.dataset.view === 'compact') applyGlobalCompact(item.dataset.val);
      else if (item.dataset.view === 'fit') applyGlobalFit(item.dataset.val);
      syncViewMenu();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.view-menu-wrap')) menu.classList.remove('open'); });
  }

  function setupCardMenu(card, app) {
    const more = card.querySelector('.card-more');
    const menu = card.querySelector('.card-menu');
    menu.innerHTML = '';
    const add = (label, ic, handler, danger, title) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (danger ? ' danger' : '');
      b.innerHTML = GG.icon(ic) + '<span></span>';
      b.querySelector('span').textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', () => { menu.classList.remove('open'); menu.closest('.card')?.classList.remove('menu-open'); handler(); });
      menu.appendChild(b);
    };
    add('重新选择文件夹', 'folder', () => openPicker(card, app));
    add('包含子文件夹', 'selectSon', () => { app.recursive = !app.recursive; persist(); renderCards(); });
    add('重命名', 'settings', () => { const n = prompt('卡片名称：', app.title); if (n && n.trim() && n.trim() !== app.title) { const t = n.trim(); app.title = t; persist(); GG.api.bookmarks.update(app.folderId, { title: t }).catch(() => {}); renderAll(); } });
    add('删除卡片', 'trash', () => removeCard(app), true);
    more.innerHTML = GG.icon('settings');
    more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu, more); });
  }

  function removeCard(app, push = true) {
    if (push && state.apps.includes(app)) pushUndo({ type: 'addCard', app });
    state.apps = state.apps.filter((a) => a.id !== app.id);
    cardOrder = cardOrder.filter((o) => o.appId !== app.id);
    persist().then(renderAll);
  }

  // ---------- Card header drag (reorder + free column placement) ----------
  // Cards are dragged via their header grip. They can be dropped:
  //   - before/after another card (decided by pointer position within target)
  //   - into an empty column (drop zone rendered at column bottoms)
  // The dragged card's `col` is set to the target column so it stays there.
  const CARD_MIME = 'application/x-gg-card';

  function setupCardDrag(card, app) {
    const handle = card.querySelector('.card-drag');
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(CARD_MIME, app.id);
      e.dataTransfer.setData('text/plain', app.id); // fallback for some Firefox configurations
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.card.drop-target').forEach((c) => c.classList.remove('drop-target'));
      document.querySelectorAll('.grid-col.col-drop').forEach((c) => c.classList.remove('col-drop'));
    });
    card.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(CARD_MIME)) return;
      if (e.target.closest('.card-drag') === handle) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drop-target');
      // visual cue: top half = insert before, bottom half = insert after
      const r = card.getBoundingClientRect();
      const before = (e.clientY - r.top) < r.height / 2;
      card.dataset.dropPos = before ? 'before' : 'after';
    });
    card.addEventListener('dragleave', (e) => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drop-target');
        delete card.dataset.dropPos;
      }
    });
    card.addEventListener('drop', (e) => {
      if (!e.dataTransfer.types.includes(CARD_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('drop-target');
      const draggedId = e.dataTransfer.getData(CARD_MIME) || e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === app.id) { delete card.dataset.dropPos; return; }
      const before = card.dataset.dropPos === 'before';
      delete card.dataset.dropPos;
      moveCardTo(draggedId, app.col, app.id, before);
    });
  }

  // Move a card into `col` at a position relative to `anchorId` (or end of col
  // when anchorId is null). Updates both the per-app `col` and the linear
  // `cardOrder` so the within-column order is preserved across renders.
  function moveCardTo(draggedId, col, anchorId, before) {
    const draggedApp = state.apps.find((a) => a.id === draggedId);
    if (!draggedApp) return;
    const prevOrder = cardOrder.slice();
    const prevCol = draggedApp.col;
    // 1) update card's column
    draggedApp.col = col;
    // 2) rebuild cardOrder so that, within `col`, the dragged card sits in the
    //    right place. Strategy: build per-column ordered lists from current
    //    cardOrder + apps, then re-insert dragged at desired spot, then
    //    flatten back to a new cardOrder.
    const cols = computedColumnCount();
    const safeCol = Math.max(0, Math.min(col, cols - 1));
    // gather all active apps grouped by their col (in current cardOrder order)
    const active = activeCards();
    const orderMap = new Map(cardOrder.map((o, i) => [o.appId, i]));
    active.sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
      const ib = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
      return ia === ib ? a.title.localeCompare(b.title, 'zh') : ia - ib;
    });
    const buckets = Array.from({ length: cols }, () => []);
    active.forEach((a) => {
      let c = (typeof a.col === 'number') ? a.col : 0;
      if (c < 0 || c >= cols) c = 0;
      buckets[c].push(a);
    });
    // remove dragged from its (possibly old) bucket
    for (const list of buckets) {
      const i = list.findIndex((a) => a.id === draggedId);
      if (i !== -1) { list.splice(i, 1); break; }
    }
    // insert into target bucket
    const target = buckets[safeCol];
    if (!anchorId) {
      target.push(draggedApp);
    } else {
      const idx = target.findIndex((a) => a.id === anchorId);
      if (idx === -1) target.push(draggedApp);
      else target.splice(before ? idx : idx + 1, 0, draggedApp);
    }
    // flatten: column-major order so future renders keep this layout
    const newOrder = [];
    buckets.forEach((list) => list.forEach((a) => newOrder.push({ appId: a.id })));
    cardOrder = newOrder;
    pushUndo({ type: 'reorder', from: prevOrder, to: cardOrder.slice() });
    persist().then(renderCards);
  }

  // Allow dropping anywhere inside a column. The whole column highlights as a
  // drop target (even when hovering over its cards) so the user gets clear
  // feedback and can release the mouse anywhere in the column's space.
  function enableColumnDrop() {
    grid.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(CARD_MIME)) return;
      const col = e.target.closest('.grid-col');
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // highlight the column under the pointer; clear the others
      document.querySelectorAll('.grid-col.col-drop').forEach((c) => {
        if (c !== col) c.classList.remove('col-drop');
      });
      col.classList.add('col-drop');
    });
    grid.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.grid-col');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('col-drop');
    });
    grid.addEventListener('drop', (e) => {
      if (!e.dataTransfer.types.includes(CARD_MIME)) return;
      const col = e.target.closest('.grid-col');
      if (!col) return;
      // When dropped onto a card, let the card's own handler manage the
      // before/after placement (it stops propagation). Otherwise, dropping in
      // the column's empty space moves the card to that column (appended).
      if (e.target.closest('.card')) return;
      e.preventDefault();
      e.stopPropagation();
      col.classList.remove('col-drop');
      const draggedId = e.dataTransfer.getData(CARD_MIME) || e.dataTransfer.getData('text/plain');
      if (!draggedId) return;
      const colIdx = Number(col.dataset.col);
      moveCardTo(draggedId, colIdx, null, false);
    });
  }

  // ---------- Tile drag (reorder within a card / move between cards) ----------
  let dragTile = null;   // the tile element being dragged
  let dragStartY = 0;    // 拖拽开始时的鼠标 Y，用于判断拖拽方向

  // 用「间隔中点」计算鼠标 my 应插入的位置，返回 { over, dropPos }
  // dropPos: 'before' 插到 over 前，'after' 插到 over 后。
  // tiles 需为已排除拖拽项的 DOM tile 数组（按 DOM 顺序）。
  // movingDown: 本次拖拽是否向下移动，用于修正“往下拖少一格”的偏差。
  function computeDropTarget(tiles, my, movingDown) {
    if (!tiles.length) return null;
    const rs = tiles.map((t) => t.getBoundingClientRect());
    // 最上方：插到第一个之前
    if (my < rs[0].top) return { over: tiles[0], dropPos: 'before' };
    // 最下方：插到最后一个之后
    if (my >= rs[rs.length - 1].bottom) return { over: tiles[tiles.length - 1], dropPos: 'after' };
    // 找鼠标所在的 tile 区域
    for (let i = 0; i < tiles.length - 1; i++) {
      const gapMid = (rs[i].bottom + rs[i + 1].top) / 2;
      if (my < gapMid) {
        // 往下拖：默认插到目标后（避免少一格）；只有鼠标在目标顶部极小区域才插到前。
        // 往上拖：鼠标在目标上半插到前，下半插到后。
        let before;
        if (movingDown) {
          before = (my - rs[i].top) < rs[i].height * 0.2;
        } else {
          before = my < rs[i].top + rs[i].height / 2;
        }
        return { over: tiles[i], dropPos: before ? 'before' : 'after' };
      }
    }
    // 兜底：最后一个之后
    return { over: tiles[tiles.length - 1], dropPos: 'after' };
  }

  function enableGridDrag() {
    grid.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.tile');
      // 非 tile 的拖拽（如卡片拖拽）不在这里处理，也不阻止
      if (!tile) return;
      // tile 本体不允许拖拽，只允许通过右侧手柄（.tile-more）拖动排序
      if (!e.target.closest('.tile-more')) { e.preventDefault(); return; }
      e.dataTransfer.setData('bookmark-id', tile.dataset.bookmarkId);
      e.dataTransfer.setData('from-folder', tile.closest('.card').dataset.folderId);
      e.dataTransfer.setData('text/plain', tile.dataset.url || '');
      e.dataTransfer.effectAllowed = 'copyMove';
      tile.classList.add('tile-dragging');
      dragTile = tile;
      dragStartY = e.clientY;
    });
    grid.addEventListener('dragend', (e) => {
      if (e.target.closest && e.target.closest('.tile')) e.target.closest('.tile').classList.remove('tile-dragging');
      dragTile = null;
      document.querySelectorAll('.card.drop-target').forEach((c) => c.classList.remove('drop-target'));
      document.querySelectorAll('.tile.tile-drop').forEach((t) => t.classList.remove('tile-drop'));
    });
    // show a drop indicator as the tile hovers over another tile
    grid.addEventListener('dragover', (e) => {
      const card = e.target.closest('.card');
      if (!card || !e.dataTransfer.types.includes('bookmark-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drop-target');
      document.querySelectorAll('.tile.tile-drop').forEach((t) => t.classList.remove('tile-drop'));
      // 高亮：鼠标落在哪个 gap 就高亮到对应位置
      const tiles = Array.from(card.querySelectorAll('.tile')).filter((t) => t !== dragTile);
      const hit = computeDropTarget(tiles, e.clientY, e.clientY > dragStartY);
      if (hit) {
        hit.over.classList.add('tile-drop');
        hit.over.dataset.dropPos = hit.dropPos;
        console.log('[gg-drag] highlight', { target: hit.over.dataset.bookmarkId, dropPos: hit.dropPos, my: e.clientY });
      }
    });
    grid.addEventListener('dragleave', (e) => {
      const card = e.target.closest('.card');
      if (card && !card.contains(e.relatedTarget)) card.classList.remove('drop-target');
    });
    grid.addEventListener('drop', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const bmId = e.dataTransfer.getData('bookmark-id');
      const bmUrl = e.dataTransfer.getData('text/plain');
      if (!bmId) return;
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.tile.tile-drop').forEach((t) => t.classList.remove('tile-drop'));
      const srcCard = dragTile && dragTile.closest('.card');
      // reorder within the same card
      if (srcCard === card) {
        // 与 dragover 高亮使用完全一致的 computeDropTarget，保证所见即所得
        const tiles = Array.from(card.querySelectorAll('.tile')).filter((t) => t !== dragTile);
        const hit = computeDropTarget(tiles, e.clientY, e.clientY > dragStartY);
        let targetBmId = null;
        let insertBefore = false;
        if (hit) {
          targetBmId = hit.over.dataset.bookmarkId;
          insertBefore = hit.dropPos === 'before';
        }
        console.log('[gg-drag] drop', { bmId, folder: card.dataset.folderId, targetBmId, insertBefore, clientY: e.clientY });
        reorderBookmarkInCard(bmId, card.dataset.folderId, targetBmId, insertBefore);
        return;
      }
      // otherwise move the bookmark into the other card's folder
      moveBookmark(bmId, card.dataset.folderId, bmUrl, card);
    });
  }

  // Reorder a bookmark within its folder.
  // 直接构造目标完整顺序 clean（含文件夹项），再逆序 move 到各自目标 index，
  // 规避单次 move 的 index 语义歧义。
  async function reorderBookmarkInCard(bmId, folderId, targetBmId, insertBefore) {
    const children = await GG.api.bookmarks.getChildren(folderId).catch(() => null);
    if (!children) return;
    const order = children.map((c) => c.id);           // 当前完整顺序（含文件夹项）
    if (!order.includes(bmId)) return;
    // 移除自身
    const arr = order.filter((id) => id !== bmId);
    // 计算 bmId 的目标插入位置
    let targetIndex;
    if (targetBmId) {
      let t = arr.indexOf(targetBmId);
      if (t === -1) t = arr.length;
      targetIndex = insertBefore ? t : t + 1;
    } else {
      targetIndex = arr.length; // 拖到末尾
    }
    arr.splice(targetIndex, 0, bmId);
    const clean = arr;                                 // 目标完整顺序
    console.log('[gg-drag] reorder', { bmId, folderId, targetBmId, insertBefore, order, clean });
    // 逆序 move：从最后一个到第一个，固定各自目标 index，保证最终顺序为 clean
    let changed = false;
    for (let i = clean.length - 1; i >= 0; i--) {
      if (clean[i] !== order[i]) {
        changed = true;
        await GG.api.bookmarks.move(clean[i], { parentId: folderId, index: i }).catch(() => {});
      }
    }
    if (changed) renderCards();
  }

  async function moveBookmark(bmId, targetFolderId, bmUrl, card) {
    const cur = await GG.api.bookmarks.get(bmId).catch(() => null);
    if (!cur || !cur[0]) return;
    const node = cur[0];
    const targetFolder = targetFolderId === 'undefined' ? null : targetFolderId;
    // if already in target, do nothing
    if (node.parentId === targetFolder) return;
    const prevParent = node.parentId;
    GG.api.bookmarks.move(bmId, { parentId: targetFolder }).then(() => {
      pushUndo({ type: 'moveBookmark', bookmarkId: bmId, toParent: targetFolder, fromParent: prevParent, url: node.url });
      GG.toast.show('书签已移动', 'success');
      renderCards();
    }, () => GG.toast.show('移动失败', 'error'));
  }

  // ---------- Folder picker ----------
  function openPicker(card, app, col) {
    currentPick = { card, app, mode: 'card', col: (typeof col === 'number' ? col : null) };
    buildTree();
    $('#pickerTitle').textContent = app ? '重新选择文件夹' : '选择一个书签文件夹';
    $('#folderPickerWrap').classList.remove('hidden');
  }
  const pickerWrap = () => $('#folderPickerWrap');
  let currentPick = null;
  let selectedFolderId = null;
  let pickerTreeEl = null;

  async function buildTree() {
    const root = await GG.api.bookmarks.getTree();
    pickerTreeEl = $('#pickerTree');
    pickerTreeEl.innerHTML = '';
    selectedFolderId = currentPick.app ? currentPick.app.folderId : null;
    root[0].children.forEach((node) => { if (node.type === 'folder') pickerTreeEl.appendChild(buildNode(node, 0)); });
  }

  function buildNode(node, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    const children = (node.children || []).filter((c) => c.type === 'folder');
    const count = (node.children || []).filter((c) => c.type === 'bookmark').length;
    const row = document.createElement('div');
    row.className = 'tree-row' + (selectedFolderId === node.id ? ' selected' : '');
    row.dataset.id = node.id;
    row.style.paddingLeft = (10 + depth * 4) + 'px';

    // only show a toggle arrow when the folder actually contains subfolders
    // 默认展开到二级：depth 0 的顶层文件夹默认展开（显示二级文件夹）
    const isExpanded = depth === 0;
    if (children.length) {
      const toggle = document.createElement('span');
      toggle.className = 'tw-toggle' + (isExpanded ? '' : ' collapsed');
      toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`;
      toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleOpen(wrap, toggle); });
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tw-toggle tw-toggle-empty';
      row.appendChild(spacer);
    }

    const icon = document.createElement('span');
    icon.classList.add('tw-icon');
    icon.innerHTML = GG.icon('folder');

    const radio = document.createElement('span');
    radio.classList.add('tw-radio');

    const title = document.createElement('span');
    title.className = 'tw-title';
    title.textContent = node.title || '（未命名）';

    const cnt = document.createElement('span');
    cnt.className = 'tw-count';
    cnt.textContent = count;

    row.append(radio, icon, title, cnt);
    row.addEventListener('click', () => {
      selectedFolderId = node.id;
      pickerTreeEl.querySelectorAll('.tree-row').forEach((r) => r.classList.remove('selected'));
      row.classList.add('selected');
    });

    wrap.appendChild(row);
    if (children.length) {
      const sub = document.createElement('div');
      sub.className = 'tree-children' + (isExpanded ? '' : ' collapsed');
      children.forEach((c) => sub.appendChild(buildNode(c, depth + 1)));
      wrap.appendChild(sub);
    }
    return wrap;
  }

  function toggleOpen(wrap, toggle) {
    const sub = wrap.querySelector(':scope > .tree-children');
    if (sub) { sub.classList.toggle('collapsed'); toggle.classList.toggle('collapsed'); }
  }

  function closePicker() {
    pickerWrap().classList.add('hidden');
    currentPick = null;
  }

  // Right-click on empty grid space -> "new card" menu placed in that column.
  let gridCtxEl = null;
  function createBlankCard(col) {
    const newApp = {
      id: 'app_' + Date.now(),
      title: '新卡片',
      categoryId: state.activeCategory,
      folderId: null,
      recursive: false
    };
    if (typeof col === 'number') newApp.col = col;
    else {
      const cols = computedColumnCount();
      const counts = Array.from({ length: cols }, () => 0);
      state.apps.forEach((a) => {
        const c = (typeof a.col === 'number') ? a.col : -1;
        if (c >= 0 && c < cols) counts[c]++;
      });
      let minIdx = 0;
      for (let i = 1; i < cols; i++) if (counts[i] < counts[minIdx]) minIdx = i;
      newApp.col = minIdx;
    }
    pushUndo({ type: 'removeCard', app: newApp, existed: false });
    state.apps.push(newApp);
    appendOrder(newApp.id);
    persist().then(renderCards);
  }
  function columnFromEvent(e) {
    const col = e.target.closest('.grid-col');
    if (col) return Number(col.dataset.col);
    // fallback: pick the column whose horizontal band contains the cursor
    const cols = Array.from(grid.querySelectorAll('.grid-col'));
    if (!cols.length) return 0; // empty grid: default to first column
    const x = e.clientX;
    let best = 0, bestDist = Infinity;
    cols.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }
  function openGridMenu(e) {
    closeGridMenu();
    if (e.target.closest('.card')) return; // don't trigger over a card
    const col = columnFromEvent(e);
    const colEl = grid.querySelector(`.grid-col[data-col="${col}"]`);
    if (colEl) colEl.classList.add('col-target');
    const menu = document.createElement('div');
    menu.className = 'menu glass grid-ctx';
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.innerHTML = GG.icon('plus') + '<span>新建卡片</span>';
    b.addEventListener('click', () => { closeGridMenu(); createBlankCard(col); });
    menu.appendChild(b);
    document.body.appendChild(menu);
    gridCtxEl = menu;
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }
  function closeGridMenu() {
    if (gridCtxEl) { gridCtxEl.remove(); gridCtxEl = null; }
    grid.querySelectorAll('.grid-col.col-target').forEach((c) => c.classList.remove('col-target'));
  }

  function confirmPick() {
    if (!selectedFolderId || !currentPick) { GG.toast.show('请选择一个文件夹', 'error'); return; }
    const { card, app, mode } = currentPick;
    if (mode === 'card' && app) {
      // re-folder existing app
      GG.api.bookmarks.get(selectedFolderId).then((arr) => {
        if (arr && arr[0]) app.title = arr[0].title;
        app.folderId = selectedFolderId;
        persist().then(renderCards);
      });
    } else {
      // new card
      const pickedCol = (currentPick && typeof currentPick.col === 'number') ? currentPick.col : null;
      GG.api.bookmarks.get(selectedFolderId).then((arr) => {
        const folder = arr && arr[0];
        const title = folder ? folder.title : '新卡片';
        const newApp = {
          id: 'app_' + Date.now(),
          title,
          categoryId: state.activeCategory,
          folderId: selectedFolderId,
          recursive: $('#pickerRecursive').checked
        };
        // place the new card in the column that was right-clicked (if any)
        if (pickedCol != null) newApp.col = pickedCol;
        pushUndo({ type: 'removeCard', app: newApp, existed: false });
        state.apps.push(newApp);
        appendOrder(newApp.id);
        persist().then(renderCards);
      });
    }
    closePicker();
  }

  // ---------- Undo ----------
  function pushUndo(entry, prune = true) {
    state.history.push({ snapshot: JSON.stringify({ apps: state.apps, categories: state.categories, cardOrder }), entry });
    if (state.history.length > 30) state.history.shift();
    render(state.history.length);
  }

  async function undo() {
    const last = state.history.pop();
    if (!last) return;
    const snap = JSON.parse(last.snapshot);
    state.apps = snap.apps;
    state.categories = snap.categories;
    cardOrder = snap.cardOrder;
    persist().then(renderAll);
    GG.toast.show('已撤回', 'success');
    render(state.history.length);
  }

  // ---------- Buttons ----------
  function wireButtons() {
    // 主题模式切换
    document.querySelectorAll('.theme-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        state.settings.theme = b.dataset.theme;
        GG.saveSettings(state.settings);
        document.documentElement.dataset.theme = state.settings.theme;
      });
    });
    wireViewMenu();
    syncViewBtn();
    $('#btnSettings').innerHTML = GG.icon('settings');
    $('#btnSettings').addEventListener('click', () => {
      const panel = document.getElementById('ntSettings');
      if (panel) panel.classList.toggle('open');
    });
    const ntSettingsClose = document.getElementById('ntSettingsClose');
    if (ntSettingsClose) ntSettingsClose.addEventListener('click', () => {
      const panel = document.getElementById('ntSettings');
      if (panel) panel.classList.remove('open');
    });
    const btnHelp = $('#btnHelp');
    if (btnHelp) {
      btnHelp.innerHTML = GG.icon('help');
      btnHelp.addEventListener('click', () => GG.api.tabs.create({ url: GG.api.runtime.getURL('pages/help/help.html') }));
    }
    const btnOrg = $('#btnOrganize');
    btnOrg.innerHTML = GG.icon('bookmark');
    btnOrg.addEventListener('click', () => GG.api.tabs.create({ url: GG.api.runtime.getURL('pages/organizer/organizer.html') }));
    const btnAdd = $('#btnAddCard');
    btnAdd.innerHTML = GG.icon('addCard');
    btnAdd.dataset.tip = '卡片添加：新增一个书签卡片';
    btnAdd.addEventListener('click', () => createBlankCard());
    $('#pickerClose').addEventListener('click', closePicker);
    $('#pickerConfirm').addEventListener('click', confirmPick);
    // search
    $('#seGo').addEventListener('click', doSearch);
    $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    $('#seIcon').addEventListener('click', () => {
      const menu = $('#seMenu');
      menu.classList.toggle('open');
    });
    buildSeMenu();
    // accent color fast pick on header
  }

  function buildSeMenu() {
    const menu = $('#seMenu');
    menu.innerHTML = '';
    Object.entries(GG.SEARCH_ENGINES).forEach(([key, se]) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (key === state.settings.searchEngine ? ' selected' : '');
      b.innerHTML = `<span class="se-mini" style="background-image:url('../../icons/se/${key}.svg')"></span><span></span>`;
      b.querySelector('span:last-child').textContent = se.name;
      b.addEventListener('click', () => {
        state.settings.searchEngine = key;
        GG.saveSettings(state.settings);
        renderSearchEngine();
        menu.classList.remove('open');
      });
      menu.appendChild(b);
    });
  }

  function render(countHas) {
    const btn = $('#btnUndo');
    if (btn) btn.disabled = state.history.length === 0;
  }
  // ---------- Master render ----------
  function renderAll() {
    renderCats();
    renderPinbar();
    renderCards();
    render(state.history.length);
    // keep active category button visible
    const cat = document.querySelector(`.cat[data-id="${state.activeCategory}"]`);
    if (cat) cat.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    persist();
  }

  // 重新从存储加载数据并渲染，但不写回（用于外部导入/清除后的同步）
  async function reloadAndRender() {
    await loadPersistent();
    renderCats();
    renderPinbar();
    renderCards();
    render(state.history.length);
    const cat = document.querySelector(`.cat[data-id="${state.activeCategory}"]`);
    if (cat) cat.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Init ----------
  async function init() {
    await loadPersistent();
    // 页脚显示扩展版本号（从 manifest 读取，保持同步）
    try {
      const v = chrome.runtime.getManifest().version;
      const el = document.getElementById('footerVersion');
      if (el) el.textContent = 'v' + v;
    } catch (e) { /* 忽略 */ }
    // recompute order for robustness
    applyBg();
    renderSearchEngine();
    wireButtons();
    wireImportFolder();
    wirePinbar();
    if (GG.Sync && GG.Sync.scheduleAlarm) GG.Sync.scheduleAlarm();
    enableGridDrag();
    enableColumnDrop();
    // close menus on outside click / scroll / escape
    document.addEventListener('click', (e) => {
      const menu = $('#seMenu');
      if (!e.target.closest('#seIcon') && !e.target.closest('#seMenu')) menu.classList.remove('open');
      if (!e.target.closest('.cat-ctx')) closeCatMenu();
      if (!e.target.closest('.tile-ctx')) closeTileMenu();
      if (!e.target.closest('.pin-ctx')) closePinMenu();
    });
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.cat')) closeCatMenu();
      if (!e.target.closest('.tile')) closeTileMenu();
      if (!e.target.closest('.pin-item')) closePinMenu();
      e.preventDefault();
    });
    grid.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.card')) return; // let card handle its own (none) / default
      e.preventDefault();
      openGridMenu(e);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.grid-ctx')) closeGridMenu(); });
    document.addEventListener('scroll', closeCatMenu, true);
    document.addEventListener('scroll', closeTileMenu, true);
    document.addEventListener('scroll', closePinMenu, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCatMenu(); closeGridMenu(); closeTileMenu(); closePinMenu(); } });
    renderAll();

    // listen for settings / data changes from settings page (import / clear)
    GG.api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const cardsChanged = ['apps', 'categories', 'orderByCat', 'activeCat'].some((k) => k in changes);
      if (changes.settings) {
        const prevWidth = colWidth;
        const prevFavicon = state.settings && state.settings.faviconSource;
        state.settings = Object.assign({}, GG.DEFAULTS, changes.settings.newValue || {});
        window.__ggSettings = state.settings;
        colWidth = state.settings.cardWidth || 320;
        applyBg();
        renderSearchEngine();
        syncViewBtn();
        syncViewMenu();
        if (prevWidth !== colWidth) renderCards();  // rebalance columns
        else if (prevFavicon !== state.settings.faviconSource) renderCards(); // 图标来源变化需重绘
        else renderCards(); // refresh compact state from global setting
        maybeSync('settingsChange');
      }
      if (cardsChanged) {
        // 拖拽高度等局部操作触发的保存，不重渲染整树，避免重置卡片状态
        if (!suppressCardRender) reloadAndRender();
      }
    });
    // 后台定时同步的结果通知（仅影响提示，不影响同步本身）
    GG.api.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'gg-sync-log') return;
      if (GG.toast) {
        if (msg.ok) GG.toast.show(msg.msg || '定时同步成功', 'success');
        else GG.toast.show(msg.msg || '定时同步失败', 'error');
      }
    });
    // folder renamed elsewhere -> sync card title; 书签重命名 -> 同步卡片内书签项标题
    GG.api.bookmarks.onChanged.addListener((id, changeInfo) => {
      if (changeInfo.title === undefined) return;
      // 1) 若是文件夹（某卡片绑定的 folderId）被重命名，同步卡片标题
      const app = state.apps.find((a) => a.folderId === id);
      if (app) {
        app.title = changeInfo.title;
        persist();
        const card = document.querySelector(`.card[data-folder-id="${CSS.escape(id)}"]`);
        if (card) {
          const t = card.querySelector('.card-title');
          if (t && !t.querySelector('input')) t.textContent = changeInfo.title;
        }
        return;
      }
      // 2) 若是书签项被重命名，同步卡片内对应的书签项标题
      const tile = document.querySelector(`.tile[data-bookmark-id="${CSS.escape(id)}"]`);
      if (tile) {
        const titleEl = tile.querySelector('.tile-title');
        if (titleEl) titleEl.textContent = changeInfo.title;
        tile.dataset.title = changeInfo.title;
      }
    });
    // 书签被创建/删除/移动时：刷新受影响文件夹绑定的卡片（不触发书签上传，上传由后台处理）
    GG.api.bookmarks.onCreated.addListener((id, node) => { if (node && node.parentId) refreshCardsForFolder(node.parentId); });
    GG.api.bookmarks.onRemoved.addListener((id, info) => { if (info && info.parentId) refreshCardsForFolder(info.parentId); });
    GG.api.bookmarks.onMoved.addListener((id, info) => {
      if (info && info.parentId) refreshCardsForFolder(info.parentId);
      if (info && info.oldParentId && info.oldParentId !== info.parentId) refreshCardsForFolder(info.oldParentId);
    });

    // reload everything when config imported/cleared from settings page
    GG.api.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'gg-config-imported') {
        reloadAndRender();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
