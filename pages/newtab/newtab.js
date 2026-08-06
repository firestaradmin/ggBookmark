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
    trash: []
  };

  let cardOrder = [];     // persisted order of {appId} among current category
  let colWidth = 320;     // global card column width (px), set in settings

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const catsBar = $('#catsBar');

  // ---------- Persistence ----------
  async function loadPersistent() {
    const data = await browser.storage.local.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings']);
    state.settings = Object.assign({}, GG.DEFAULTS, data.settings || {});
    state.apps = data.apps || [];
    state.categories = data.categories || [];
    if (!state.categories.length) {
      state.categories = [{ id: 'cat0', name: '主要' }, { id: 'cat1', name: '工具' }, { id: 'cat2', name: '游戏' }];
    }
    state.activeCategory = data.activeCat || (state.categories[0] && state.categories[0].id) || null;
    const byCat = data.orderByCat || {};
    cardOrder = byCat[state.activeCategory] || [];
    colWidth = state.settings.cardWidth || 320;
  }

  async function persist() {
    const data = await browser.storage.local.get('orderByCat');
    const byCat = data.orderByCat || {};
    byCat[state.activeCategory] = cardOrder;
    await browser.storage.local.set({
      apps: state.apps,
      categories: state.categories,
      activeCat: state.activeCategory,
      orderByCat: byCat
    });
  }

  // ---------- Background image ----------
  function resolveBgImage(value) {
    if (value && value.startsWith('preset:')) {
      const name = value.slice('preset:'.length);
      return browser.runtime.getURL('pics/wallpapers/' + name);
    }
    return value;
  }
  function applyBg() {
    const bg = $('.gg-bg');
    const s = state.settings;
    const hasImage = s.backgroundStyle === 'image' && s.backgroundImage;
    bg.dataset.style = hasImage ? 'image' : (s.backgroundStyle === 'gradient' ? 'gradient' : 'default');
    bg.style.setProperty('--bg-image', `url("${resolveBgImage(s.backgroundImage)}")`);
    bg.style.setProperty('--bg-blur', `${s.backgroundBlur || 0}px`);
    bg.style.setProperty('--bg-dim', `${s.backgroundDim ?? 0.35}`);
    document.documentElement.style.setProperty('--accent-color', s.accentColor);
    document.documentElement.style.setProperty('--accent', s.accentColor);
    document.documentElement.style.setProperty('--accent-2', s.accentColor);
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
    browser.tabs.update({ url: se.url.replace('{q}', encodeURIComponent(q)) });
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
    add.title = '新建分类';
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
    browser.storage.local.get('orderByCat').then((d) => {
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
  async function buildTiles(card, folderId, recursive) {
    let list;
    try {
      list = await browser.bookmarks.getChildren(folderId);
    } catch (e) {
      list = [];
    }
    const items = list || [];
    let bookmarks = items.filter((b) => b.type === 'bookmark');
    if (recursive) {
      const folders = items.filter((b) => b.type === 'folder');
      for (const f of folders) {
        try {
          const sub = await browser.bookmarks.getChildren(f.id);
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
      // icon: use favicon
      const img = document.createElement('img');
      img.onerror = function () { img.remove(); const s = document.createElement('span'); s.className = 'letter'; s.textContent = (bm.title || '?').charAt(0); icon.appendChild(s); };
      img.src = GG.iconFor(bm.url).src;
      icon.appendChild(img);
      tile.querySelector('.tile-title').textContent = bm.title || (function () { try { return new URL(bm.url).host; } catch (e) { return bm.url; } })();
      tile.querySelector('.tile-desc').textContent = hostOf(bm.url);
      tile.dataset.url = bm.url;
      tile.dataset.bookmarkId = bm.id;
      tile.dataset.title = bm.title || bm.url;

      tile.addEventListener('click', (e) => {
        if (e.target.closest('.tile-more')) return;
        browser.tabs.create({ url: bm.url });
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
    add('打开', 'external', () => browser.tabs.create({ url: bm.url }));
    add('复制链接', 'external', () => navigator.clipboard.writeText(bm.url).then(() => GG.toast.show('已复制链接', 'success')));
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
    browser.bookmarks.remove(bm.id).then(() => {
      tile.remove();
      pushUndo({ type: 'restoreBookmark', bookmarkId: bm.id, parentId: (card.dataset.folderId) });
      GG.toast.show('已删除', 'success');
    }, () => GG.toast.show('删除失败', 'error'));
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
    titleEl.title = '双击重命名';
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
      ph.innerHTML = GG.icon('folderPlus') + '<span>设置文件夹</span>';
      ph.addEventListener('click', (e) => { e.stopPropagation(); openPicker(card, app); });
      body.appendChild(ph);
    } else {
      buildTiles(card, app.folderId, app.recursive);
      applyExclusions(card, app);
    }
    setupCardResize(card, app);
    const fitBtn = card.querySelector('.card-fit');
    const syncFitBtn = () => {
      const auto = app.fitMode === 'auto';
      fitBtn.innerHTML = GG.icon(auto ? 'heightAuto' : 'heightAutoOff');
      fitBtn.title = auto ? '适应高度：开（点击固定高度）' : '适应高度：关（点击自动适应）';
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
      compactBtn.title = title;
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
        browser.bookmarks.update(app.folderId, { title: newTitle }).catch(() => {});
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
    // vertical-only cursor is handled via CSS
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = app.fitMode === 'auto'
        ? Math.max(card.querySelector('.card-body').offsetHeight, card.querySelector('.card-body').scrollHeight)
        : (app.bodyH || 360);
      let moved = false;
      app.fitMode = 'fixed';

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
        if (moved) { persist(); recomputeCompact(card, app); }
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
    btn.title = '显示设置：紧凑模式与卡片高度';
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
      const tree = await browser.bookmarks.getTree();
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

    const saved = await browser.storage.local.get('settings');
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
    add('包含子文件夹', 'folderPlus', () => { app.recursive = !app.recursive; persist(); renderCards(); });
    add('重命名', 'settings', () => { const n = prompt('卡片名称：', app.title); if (n && n.trim() && n.trim() !== app.title) { const t = n.trim(); app.title = t; persist(); browser.bookmarks.update(app.folderId, { title: t }).catch(() => {}); renderAll(); } });
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

  function enableGridDrag() {
    grid.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.tile');
      if (tile && !e.target.closest('.tile-more')) { e.preventDefault(); return; }
      if (tile) {
        e.dataTransfer.setData('bookmark-id', tile.dataset.bookmarkId);
        e.dataTransfer.setData('from-folder', tile.closest('.card').dataset.folderId);
        e.dataTransfer.setData('text/plain', tile.dataset.url || '');
        e.dataTransfer.effectAllowed = 'copyMove';
        tile.classList.add('tile-dragging');
        dragTile = tile;
      }
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
      const over = e.target.closest('.tile');
      if (over && over !== dragTile) {
        const r = over.getBoundingClientRect();
        const before = (e.clientY - r.top) < r.height / 2;
        over.classList.add('tile-drop');
        over.dataset.dropPos = before ? 'before' : 'after';
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
        const over = e.target.closest('.tile');
        const tiles = Array.from(card.querySelectorAll('.tile'));
        let targetIndex = tiles.length;
        if (over && over !== dragTile) {
          const idx = tiles.indexOf(over);
          targetIndex = over.dataset.dropPos === 'before' ? idx : idx + 1;
        }
        reorderBookmarkInCard(bmId, card.dataset.folderId, targetIndex);
        return;
      }
      // otherwise move the bookmark into the other card's folder
      moveBookmark(bmId, card.dataset.folderId, bmUrl, card);
    });
  }

  // Reorder a bookmark within its folder by moving it to `targetIndex`.
  async function reorderBookmarkInCard(bmId, folderId, targetIndex) {
    const children = await browser.bookmarks.getChildren(folderId).catch(() => null);
    if (!children) return;
    const ids = children.filter((c) => c.type === 'bookmark').map((c) => c.id);
    const cur = ids.indexOf(bmId);
    if (cur === -1) return;
    if (cur < targetIndex) targetIndex--;
    if (cur === targetIndex) { renderCards(); return; }
    browser.bookmarks.move(bmId, { parentId: folderId, index: targetIndex }).then(() => {
      renderCards();
    }, () => GG.toast.show('排序失败', 'error'));
  }

  async function moveBookmark(bmId, targetFolderId, bmUrl, card) {
    const cur = await browser.bookmarks.get(bmId).catch(() => null);
    if (!cur || !cur[0]) return;
    const node = cur[0];
    const targetFolder = targetFolderId === 'undefined' ? null : targetFolderId;
    // if already in target, do nothing
    if (node.parentId === targetFolder) return;
    const prevParent = node.parentId;
    browser.bookmarks.move(bmId, { parentId: targetFolder }).then(() => {
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
    const root = await browser.bookmarks.getTree();
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
    if (children.length) {
      const toggle = document.createElement('span');
      toggle.className = 'tw-toggle collapsed';
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
      sub.className = 'tree-children collapsed';
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
      browser.bookmarks.get(selectedFolderId).then((arr) => {
        if (arr && arr[0]) app.title = arr[0].title;
        app.folderId = selectedFolderId;
        persist().then(renderCards);
      });
    } else {
      // new card
      const pickedCol = (currentPick && typeof currentPick.col === 'number') ? currentPick.col : null;
      browser.bookmarks.get(selectedFolderId).then((arr) => {
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
    $('#btnUndo').innerHTML = GG.icon('undo');
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
    const btnOrg = $('#btnOrganize');
    btnOrg.innerHTML = GG.icon('bookmark');
    btnOrg.addEventListener('click', () => browser.tabs.create({ url: browser.runtime.getURL('pages/organizer/organizer.html') }));
    const btnAdd = $('#btnAddCard');
    btnAdd.innerHTML = GG.icon('addCard');
    btnAdd.title = '卡片添加：新增一个书签卡片';
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
    $('#btnUndo').disabled = state.history.length === 0;
  }
  // ---------- Master render ----------
  function renderAll() {
    renderCats();
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
    renderCards();
    render(state.history.length);
    const cat = document.querySelector(`.cat[data-id="${state.activeCategory}"]`);
    if (cat) cat.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Init ----------
  async function init() {
    await loadPersistent();
    // recompute order for robustness
    applyBg();
    renderSearchEngine();
    wireButtons();
    wireImportFolder();
    enableGridDrag();
    enableColumnDrop();
    // close menus on outside click / scroll / escape
    document.addEventListener('click', (e) => {
      const menu = $('#seMenu');
      if (!e.target.closest('#seIcon') && !e.target.closest('#seMenu')) menu.classList.remove('open');
      if (!e.target.closest('.cat-ctx')) closeCatMenu();
      if (!e.target.closest('.tile-ctx')) closeTileMenu();
    });
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.cat')) closeCatMenu();
      if (!e.target.closest('.tile')) closeTileMenu();
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCatMenu(); closeGridMenu(); closeTileMenu(); } });
    renderAll();

    // listen for settings / data changes from settings page (import / clear)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const cardsChanged = ['apps', 'categories', 'orderByCat', 'activeCat'].some((k) => k in changes);
      if (changes.settings) {
        const prevWidth = colWidth;
        state.settings = Object.assign({}, GG.DEFAULTS, changes.settings.newValue || {});
        colWidth = state.settings.cardWidth || 320;
        applyBg();
        renderSearchEngine();
        syncViewBtn();
        syncViewMenu();
        if (prevWidth !== colWidth) renderCards();  // rebalance columns
        else renderCards(); // refresh compact state from global setting
      }
      if (cardsChanged) {
        reloadAndRender();
      }
    });
    // folder renamed elsewhere -> sync card title
    browser.bookmarks.onChanged.addListener((id, changeInfo) => {
      if (changeInfo.title === undefined) return;
      const app = state.apps.find((a) => a.folderId === id);
      if (!app) return;
      app.title = changeInfo.title;
      persist();
      const card = document.querySelector(`.card[data-folder-id="${CSS.escape(id)}"]`);
      if (card) {
        const t = card.querySelector('.card-title');
        if (t && !t.querySelector('input')) t.textContent = changeInfo.title;
      }
    });
    // open menu close

    // reload everything when config imported/cleared from settings page
    browser.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'gg-config-imported') {
        reloadAndRender();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
