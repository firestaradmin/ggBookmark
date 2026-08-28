/* GG Bookmark - organizer page logic
 * Split-view bookmark manager: a folder tree on the left and one or more
 * folder "panels" on the right. Panels can be opened side by side so the user
 * can drag bookmarks/folders directly between folders to organize them.
 */

(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);

  const DEFAULT_ROOT = 'root________';
  let orgSettings = {};
  let orgColumns = 1;   // 面板书签列数

  let tree = [];
  let folderCount = {};
  let history = [];
  const collapse = new Set();
  let moveMenuCleanup = null;

  let panels = [];
  let activePanelId = null;
  let panelSeq = 0;

  const sel = { dragIds: [], dragFromFolder: null };

  // 视图切换：false = 整理视图，true = 书签查重视图
  let dupViewOn = false;
  let dupGroups = [];       // [{ url, items: [{id,title,url,path,keep}] }]
  let activeDupGroup = null;

  function activePanel() {
    return panels.find((p) => p.id === activePanelId) || panels[0];
  }

  function walkFolders(nodes, cb) {
    (nodes || []).forEach((n) => {
      if (n.type === 'folder') { cb(n); walkFolders(n.children, cb); }
    });
  }

  async function loadTree() {
    const roots = await GG.api.bookmarks.getTree();
    tree = roots[0].children || [];
    rebuildFolderCount();
    // collapse folders at depth >= 2 (keep only the first two levels expanded)
    const fold = (nodes, depth) => {
      (nodes || []).forEach((n) => {
        if (n.type === 'folder') {
          if (depth >= 2) collapse.add(n.id);
          fold(n.children, depth + 1);
        }
      });
    };
    fold(tree, 0);
    renderFolderTree();
  }

  function rebuildFolderCount() {
    folderCount = {};
    const walk = (nodes) => {
      (nodes || []).forEach((n) => {
        if (n.type === 'folder') { folderCount[n.id] = (n.children || []).length; walk(n.children); }
      });
    };
    walk(tree);
  }

  async function refresh() {
    const roots = await GG.api.bookmarks.getTree();
    tree = roots[0].children || [];
    rebuildFolderCount();
    renderFolderTree();
    await Promise.all(panels.map((p) => renderPanel(p)));
  }

  function folderTitle(id) {
    if (id === DEFAULT_ROOT) return '书签栏';
    let found = null;
    walkFolders(tree, (f) => { if (f.id === id) found = f; });
    return found ? (found.title || '（未命名）') : '书签';
  }

  // === FOLDER TREE ===
  function renderFolderTree() {
    const root = $('#folderTree');
    root.innerHTML = '';
    tree.forEach((node) => { if (node.type === 'folder') root.appendChild(buildTreeNode(node, 0)); });
  }

  function collapseAll() {
    walkFolders(tree, (f) => collapse.add(f.id));
    renderFolderTree();
  }

  function buildTreeNode(node, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    wrap.dataset.id = node.id;
    const childFolders = (node.children || []).filter((c) => c.type === 'folder');
    const bmCount = (node.children || []).filter((c) => c.type === 'bookmark').length;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (8 + depth * 4) + 'px';

    const toggle = document.createElement('span');
    if (childFolders.length) {
      toggle.className = 'tw-toggle' + (collapse.has(node.id) ? ' collapsed' : '');
      toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapse.has(node.id)) collapse.delete(node.id); else collapse.add(node.id);
        toggle.classList.toggle('collapsed', collapse.has(node.id));
        const sub = wrap.querySelector(':scope > .tree-children');
        if (sub) sub.classList.toggle('collapsed', collapse.has(node.id));
      });
    } else {
      toggle.className = 'tw-toggle-empty';
    }

    const icon = document.createElement('span');
    icon.className = 'tr-icon folder';
    icon.innerHTML = GG.icon('folder');

    const name = document.createElement('span');
    name.className = 'tr-name';
    name.textContent = node.title || '（未命名）';

    const cnt = document.createElement('span');
    cnt.className = 'tr-count';
    cnt.textContent = bmCount;

    const more = document.createElement('span');
    more.className = 'tr-more btn icon-btn';
    more.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    more.style.width = '24px'; more.style.height = '24px';
    more.addEventListener('click', (e) => { e.stopPropagation(); openFolderMenu(more, node); });

    row.append(toggle, icon, name, cnt, more);
    row.addEventListener('click', (e) => {
      if (e.target.closest('.tr-more') || e.target.closest('.tw-toggle')) return;
      if (!activePanel()) addPanel(node.id); else setPanelFolder(activePanelId, node.id);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      openCtxMenu(e.clientX, e.clientY, [
        { label: '在面板中打开', ic: 'folder', fn: () => { if (activePanel()) setPanelFolder(activePanelId, node.id); else addPanel(node.id); } },
        { label: '新建并列面板', ic: 'panelSide', fn: () => addPanel(node.id) },
        { label: '在此新建文件夹', ic: 'folder', fn: () => newFolder(node.id) },
        { label: '重命名', ic: 'settings', fn: () => promptRename(node) },
        { label: '删除文件夹', ic: 'trash', fn: () => deleteItem(node), danger: true }
      ]);
    });
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.add('drag-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-target'));
    row.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.remove('drag-target'); moveSelectedTo(node.id); });

    wrap.appendChild(row);
    if (childFolders.length) {
      const sub = document.createElement('div');
      sub.className = 'tree-children' + (collapse.has(node.id) ? ' collapsed' : '');
      childFolders.forEach((c) => sub.appendChild(buildTreeNode(c, depth + 1)));
      wrap.appendChild(sub);
    }
    return wrap;
  }

  // === PANELS ===
  function addPanel(folderId) {
    const p = {
      id: 'panel_' + (++panelSeq),
      folderId: folderId || DEFAULT_ROOT,
      selection: new Set(),
      lastClicked: null,
      el: null, head: null, grid: null, crumbs: null
    };
    panels.push(p);
    activePanelId = p.id;
    renderTabs();
    renderPanels();
    return p;
  }

  function closePanel(id) {
    const idx = panels.findIndex((p) => p.id === id);
    if (idx === -1) return;
    panels.splice(idx, 1);
    if (activePanelId === id) activePanelId = panels.length ? panels[0].id : null;
    renderTabs();
    renderPanels();
    updateToolbar();
  }

  function setPanelFolder(id, folderId) {
    const p = panels.find((x) => x.id === id);
    if (!p) return;
    p.folderId = folderId;
    p.selection.clear();
    p.lastClicked = null;
    renderTabs();
    renderPanel(p);
    updateToolbar();
  }

  function renderTabs() {
    const tabs = $('#panelTabs');
    tabs.innerHTML = '';
    panels.forEach((p) => {
      const tab = document.createElement('div');
      tab.className = 'panel-tab' + (p.id === activePanelId ? ' active' : '');
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return;
        activePanelId = p.id;
        renderTabs(); markActivePanel(); updateToolbar();
      });
      const ic = document.createElement('span');
      ic.className = 'tab-icon'; ic.innerHTML = GG.icon('folder');
      const nm = document.createElement('span');
      nm.className = 'tab-name'; nm.textContent = folderTitle(p.folderId);
      const close = document.createElement('span');
      close.className = 'tab-close'; close.textContent = '×'; close.title = '关闭面板';
      close.addEventListener('click', (e) => { e.stopPropagation(); closePanel(p.id); });
      tab.append(ic, nm, close);
      tabs.appendChild(tab);
    });
    const add = document.createElement('button');
    add.className = 'panel-tab-add'; add.innerHTML = GG.icon('panelSide'); add.dataset.tip = '新建并列面板';
    add.addEventListener('click', () => addPanel(activePanel() ? activePanel().folderId : DEFAULT_ROOT));
    tabs.appendChild(add);
  }

  function markActivePanel() {
    panels.forEach((p) => { if (p.el) p.el.classList.toggle('active', p.id === activePanelId); });
  }

  function renderPanels() {
    const container = $('#panels');
    container.innerHTML = '';
    panels.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'panel' + (p.id === activePanelId ? ' active' : '');
      el.dataset.panelId = p.id;

      const head = document.createElement('div');
      head.className = 'panel-head';
      const hIcon = document.createElement('span');
      hIcon.className = 'ph-icon'; hIcon.innerHTML = GG.icon('folder');
      const hTitle = document.createElement('span');
      hTitle.className = 'ph-title'; hTitle.textContent = folderTitle(p.folderId);
      const actions = document.createElement('div');
      actions.className = 'ph-actions';
      const btnSwitch = document.createElement('button');
      btnSwitch.className = 'ph-btn'; btnSwitch.title = '切换此面板文件夹（点选左侧树）';
      btnSwitch.innerHTML = GG.icon('circle');
      btnSwitch.addEventListener('click', () => { activePanelId = p.id; renderTabs(); markActivePanel(); updateToolbar(); });
      const btnClose = document.createElement('button');
      btnClose.className = 'ph-btn'; btnClose.title = '关闭面板';
      btnClose.innerHTML = GG.icon('close_x');
      btnClose.addEventListener('click', () => closePanel(p.id));
      actions.append(btnSwitch, btnClose);
      head.append(hIcon, hTitle, actions);

      const grid = document.createElement('div');
      grid.className = 'bookmark-grid';
      grid.dataset.panelId = p.id;

      // 路径链路
      const crumbs = document.createElement('div');
      crumbs.className = 'panel-crumbs';

      el.append(head, crumbs, grid);
      container.appendChild(el);
      p.el = el; p.head = head; p.grid = grid; p.crumbs = crumbs;
      wireGridDrop(p);
    });
    markActivePanel();
    panels.forEach((p) => renderPanel(p));
  }

  async function renderPanel(p) {
    if (!p.el) renderPanels();
    const grid = p.grid;
    const children = await getChildren(p.folderId);
    if (p.head) { const t = p.head.querySelector('.ph-title'); if (t) t.textContent = folderTitle(p.folderId); }
    renderCrumbs(p);
    grid.innerHTML = '';
    // 应用列数
    grid.dataset.cols = orgColumns;
    if (!children.length) {
      const e = document.createElement('div');
      e.className = 'panel-empty-hint';
      e.textContent = '空文件夹 · 从其他面板拖入书签';
      grid.appendChild(e);
      return;
    }
    children.forEach((node) => grid.appendChild(buildItem(node, p, children)));
  }

  // 递归查找 folderId 的祖先路径，返回 [{id,title}, ...]（顶层容器在前，当前文件夹在后）
  function buildPath(nodes, folderId) {
    for (const n of nodes) {
      if (n.id === folderId) return [{ id: n.id, title: n.title || '（未命名）' }];
      if (n.children) {
        const sub = buildPath(n.children, folderId);
        if (sub) return [{ id: n.id, title: n.title || '（未命名）' }].concat(sub);
      }
    }
    return null;
  }
  // 渲染面板顶部路径链路
  function renderCrumbs(p) {
    if (!p.crumbs) return;
    const crumbsEl = p.crumbs;
    crumbsEl.innerHTML = '';
    let path = null;
    if (p.folderId === DEFAULT_ROOT) {
      path = [{ id: DEFAULT_ROOT, title: '书签栏' }];
    } else {
      path = buildPath(tree, p.folderId);
    }
    if (!path) {
      // 顶层容器本身（tree 的直接子项）
      const top = tree.find((t) => t.id === p.folderId);
      path = top ? [{ id: top.id, title: top.title || '（未命名）' }] : [{ id: p.folderId, title: '书签' }];
    }
    path.forEach((seg, i) => {
      const isLast = i === path.length - 1;
      const item = document.createElement('span');
      item.className = 'crumb' + (isLast ? ' current' : '');
      item.textContent = seg.title;
      if (!isLast) {
        item.addEventListener('click', () => { activePanelId = p.id; setPanelFolder(p.id, seg.id); });
      }
      crumbsEl.appendChild(item);
      if (!isLast) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '›';
        crumbsEl.appendChild(sep);
      }
    });
  }

  async function getChildren(folderId) {
    try {
      if (folderId === DEFAULT_ROOT) { const roots = await GG.api.bookmarks.getTree(); return roots[0].children || []; }
      return await GG.api.bookmarks.getChildren(folderId);
    } catch (e) { return []; }
  }

  function hostOf(url) { try { return new URL(url).host; } catch (e) { return url; } }

  function buildItem(node, p, siblings) {
    const tpl = $('#bookmarkItemTpl');
    const item = tpl.content.cloneNode(true).querySelector('.item');
    item.dataset.id = node.id;
    item.dataset.type = node.type;
    item.dataset.panelId = p.id;

    if (node.type === 'folder') {
      item.querySelector('.item-type').textContent = '文件夹';
      item.querySelector('.item-title').textContent = node.title || '（未命名）';
      const cnt = folderCount[node.id] !== undefined ? folderCount[node.id] : (node.children || []).length;
      item.querySelector('.item-url').textContent = `${cnt} 项`;
      item.querySelector('.item-icon').innerHTML = GG.icon('folder');
    } else {
      item.querySelector('.item-type').textContent = '书签';
      item.querySelector('.item-title').textContent = node.title || hostOf(node.url);
      item.querySelector('.item-url').textContent = hostOf(node.url);
      GG.renderFavicon(item.querySelector('.item-icon'), node.url, node.title, (orgSettings && orgSettings.faviconSource) || GG.DEFAULTS.faviconSource);
    }
    if (p.selection.has(node.id)) item.classList.add('selected');

    item.addEventListener('click', (e) => {
      activePanelId = p.id; markActivePanel();
      const onCheck = e.target.closest('.item-check');
      if (onCheck) {
        // 点击复选框：切换选中（不清除其它选中项，便于多选）
        toggleSelect(p, node.id, item);
        p.lastClicked = node.id;
        updateToolbar();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(p, node.id, item);
      } else if (e.shiftKey && p.lastClicked) {
        const ids = siblings.map((c) => c.id);
        const a = ids.indexOf(p.lastClicked), b = ids.indexOf(node.id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) p.selection.add(ids[i]);
          renderPanel(p);
        }
      } else {
        p.selection.clear(); p.selection.add(node.id); renderPanel(p);
      }
      p.lastClicked = node.id;
      updateToolbar();
    });
    item.addEventListener('dblclick', () => {
      if (node.type === 'bookmark') GG.api.tabs.create({ url: node.url });
      else setPanelFolder(p.id, node.id);
    });
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      activePanelId = p.id; markActivePanel();
      if (!p.selection.has(node.id)) { p.selection.clear(); p.selection.add(node.id); renderPanel(p); updateToolbar(); }
      if (node.type === 'bookmark') {
        openCtxMenu(e.clientX, e.clientY, [
          { label: '打开链接', ic: 'external', fn: () => GG.api.tabs.create({ url: node.url }) },
          { label: '编辑书签', ic: 'settings', fn: () => editBookmark(node) },
          { label: '删除书签', ic: 'trash', fn: () => deleteSelected(), danger: true }
        ]);
      } else {
        openCtxMenu(e.clientX, e.clientY, [
          { label: '在此面板打开', ic: 'folder', fn: () => setPanelFolder(p.id, node.id) },
          { label: '重命名', ic: 'settings', fn: () => promptRename(node) },
          { label: '删除文件夹', ic: 'trash', fn: () => deleteSelected(), danger: true }
        ]);
      }
    });

    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (e) => {
      // 未选中则仅把当前项加入选择，避免重渲染破坏拖拽
      if (!p.selection.has(node.id)) {
        p.selection.clear();
        p.selection.add(node.id);
        item.classList.add('selected');
        updateToolbar();
      }
      sel.dragIds = Array.from(p.selection);
      sel.dragFromFolder = p.folderId;
      e.dataTransfer.setData('text/plain', node.type === 'bookmark' ? node.url : '');
      e.dataTransfer.setData('application/x-gg-from', p.folderId);
      e.dataTransfer.effectAllowed = 'copyMove';
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      sel.dragIds = []; sel.dragFromFolder = null;
      document.querySelectorAll('.panel.drag-target').forEach((el) => el.classList.remove('drag-target'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.remove('drop-before', 'drop-after', 'drop-into');
      if (!sel.dragIds.length || sel.dragIds.includes(node.id)) return;
      const r = item.getBoundingClientRect();
      const frac = (e.clientY - r.top) / Math.max(1, r.height);
      // 中部区域：文件夹项 -> 移入；上下边缘区域 -> 排序
      const middle = frac >= 0.35 && frac <= 0.65;
      if (node.type === 'folder' && middle) {
        item.classList.add('drop-into');
      } else {
        const before = frac < 0.5;
        item.classList.toggle('drop-before', before);
        item.classList.toggle('drop-after', !before);
      }
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after', 'drop-into'));
    item.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      item.classList.remove('drop-before', 'drop-after', 'drop-into');
      if (!sel.dragIds.length) return;
      const r = item.getBoundingClientRect();
      const frac = (e.clientY - r.top) / Math.max(1, r.height);
      const middle = frac >= 0.35 && frac <= 0.65;
      if (node.type === 'folder' && middle) {
        // 拖到文件夹中部：移动进入该文件夹
        moveIdsTo(sel.dragIds, node.id);
      } else if (sel.dragFromFolder === p.folderId) {
        // 同文件夹：在目标项前后排序（含文件夹项边缘 = 间隔排序）
        reorderWithin(p, item, e.clientY);
      } else if (sel.dragFromFolder) {
        // 跨文件夹：移动到当前面板文件夹，并插入到目标项对应位置（前/后）
        const before = frac < 0.5;
        moveIdsTo(sel.dragIds, p.folderId, node.id, before);
      }
    });
    return item;
  }

  function toggleSelect(p, id, item) {
    if (p.selection.has(id)) p.selection.delete(id); else p.selection.add(id);
    item.classList.toggle('selected', p.selection.has(id));
    updateToolbar();
  }

  function wireGridDrop(p) {
    const grid = p.grid;
    grid.addEventListener('dragover', (e) => { e.preventDefault(); grid.closest('.panel').classList.add('drag-target'); });
    grid.addEventListener('dragleave', (e) => { if (!grid.contains(e.relatedTarget)) grid.closest('.panel').classList.remove('drag-target'); });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      grid.closest('.panel').classList.remove('drag-target');
      if (sel.dragFromFolder && sel.dragFromFolder !== p.folderId && sel.dragIds.length) moveIdsTo(sel.dragIds, p.folderId);
      else if (sel.dragFromFolder === p.folderId && sel.dragIds.length) moveIdsToEndOfFolder(p);
    });
    // right-click on empty panel space -> panel context menu
    grid.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.item')) return; // items have their own menu
      e.preventDefault();
      activePanelId = p.id; markActivePanel(); renderTabs(); updateToolbar();
      const folderNode = findFolderNode(p.folderId);
      const items = [
        { label: '在此新建文件夹', ic: 'folder', fn: () => newFolder(p.folderId) },
        { label: '刷新', ic: 'settings', fn: () => renderPanel(p) }
      ];
      if (folderNode) {
        items.push({ label: '重命名当前文件夹', ic: 'settings', fn: () => promptRename(folderNode) });
        items.push({ label: '删除当前文件夹', ic: 'trash', fn: () => deleteItem(folderNode), danger: true });
      }
      if (p.selection.size) items.push({ label: '清空选择', ic: 'backspace', fn: () => { p.selection.clear(); renderPanel(p); updateToolbar(); } });
      items.push({ label: '关闭此面板', ic: 'external', fn: () => closePanel(p.id) });
      openCtxMenu(e.clientX, e.clientY, items);
    });
  }

  function findFolderNode(id) {
    if (id === DEFAULT_ROOT) return null;
    let found = null;
    walkFolders(tree, (f) => { if (f.id === id) found = f; });
    return found;
  }

  // === REORDER / MOVE / DELETE ===
  async function reorderWithin(p, refItem, clientY) {
    const folderId = p.folderId;
    if (!refItem) return;
    const rect = refItem.getBoundingClientRect();
    const insertBefore = clientY < rect.top + rect.height / 2;
    const ids = Array.from(sel.dragIds);
    if (!ids.length) return;
    const children = await GG.api.bookmarks.getChildren(folderId);
    const order = children.map((c) => c.id);
    const prevOrder = order.slice();
    const rest = order.filter((id) => !ids.includes(id));
    let targetIndex = rest.indexOf(refItem.dataset.id);
    if (targetIndex === -1) return;
    if (!insertBefore) targetIndex += 1;
    const beforeId = rest[targetIndex] !== undefined ? rest[targetIndex] : undefined;
    const finalOrder = [];
    for (const id of rest) {
      if (beforeId !== undefined && id === beforeId) { finalOrder.push(...ids); finalOrder.push(id); }
      else finalOrder.push(id);
    }
    if (beforeId === undefined) finalOrder.push(...ids);
    const seen = new Set();
    const clean = finalOrder.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
    if (JSON.stringify(clean) === JSON.stringify(prevOrder)) return;
    for (let i = 0; i < clean.length; i++) await GG.api.bookmarks.move(clean[i], { parentId: folderId, index: i }).catch(() => {});
    pushHistory({ type: 'reorder', folderId, prev: prevOrder, target: clean });
    GG.toast.show('已重新排序', 'success');
    renderPanel(p);
  }

  async function moveIdsToEndOfFolder(p) {
    const folderId = p.folderId;
    const ids = Array.from(sel.dragIds);
    if (!ids.length) return;
    const children = await GG.api.bookmarks.getChildren(folderId);
    const order = children.map((c) => c.id);
    const rest = order.filter((id) => !ids.includes(id));
    const finalOrder = rest.concat(ids);
    const seen = new Set();
    const clean = finalOrder.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
    let changed = false;
    for (let i = 0; i < clean.length; i++) { if (order[i] !== clean[i]) changed = true; await GG.api.bookmarks.move(clean[i], { parentId: folderId, index: i }).catch(() => {}); }
    if (changed) { pushHistory({ type: 'reorder', folderId, prev: order, target: clean }); GG.toast.show('已移动到底部', 'success'); }
    renderPanel(p);
  }

  // 移动到目标文件夹。targetId + insertBefore 可选：指定插入到某书签/文件夹前/后。
  async function moveIdsTo(ids, targetFolder, targetId, insertBefore) {
    if (!ids.length) return;
    const prev = {};
    for (const id of ids) { const arr = await GG.api.bookmarks.get(id).catch(() => []); if (arr[0]) prev[id] = arr[0].parentId; }
    // 计算目标 index（在目标文件夹内）
    let targetIndex;
    if (targetId && targetFolder) {
      const kids = await GG.api.bookmarks.getChildren(targetFolder).catch(() => []);
      const rest = kids.filter((k) => !ids.includes(k.id));
      let t = rest.findIndex((k) => k.id === targetId);
      if (t === -1) t = rest.length;
      targetIndex = insertBefore ? t : t + 1;
    }
    let moved = 0;
    for (const id of ids) {
      const dest = { parentId: targetFolder };
      if (targetIndex !== undefined) {
        dest.index = targetIndex;
        targetIndex++; // 后续项依次往后
      }
      try { await GG.api.bookmarks.move(id, dest); moved++; } catch (e) {}
    }
    if (moved) { pushHistory({ type: 'move', prev, target: targetFolder, ids }); GG.toast.show(`已移动 ${moved} 项`, 'success'); refresh(); }
  }
  function moveSelectedTo(folderId) {
    const p = activePanel();
    if (p && p.selection.size) moveIdsTo(Array.from(p.selection), folderId);
  }

  async function deleteSelected() {
    const p = activePanel();
    if (!p) return;
    const ids = Array.from(p.selection);
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 项？此操作会删除书签。`)) return;
    const captured = {};
    for (const id of ids) captured[id] = await captureNode(id);
    let del = 0;
    await Promise.all(ids.map((id) => GG.api.bookmarks.removeTree(id).then(() => { del++; }, () => {})));
    if (del) { pushHistory({ type: 'delete', captured }); GG.toast.show(`已删除 ${del} 项`, 'success'); p.selection.clear(); refresh(); }
  }

  // 递归捕获一个节点的完整信息（含所有层级子项），用于撤销恢复
  async function captureNode(id) {
    const arr = await GG.api.bookmarks.get(id).catch(() => []);
    if (!arr[0]) return null;
    const node = arr[0];
    let children = null;
    if (node.type === 'folder') {
      const kids = await GG.api.bookmarks.getChildren(id);
      children = [];
      for (const k of kids) children.push(await captureNode(k.id));
    }
    return { parentId: node.parentId, title: node.title, url: node.url, type: node.type, index: node.index, children };
  }
  // 递归恢复一个被删除的节点（含所有层级子项）
  async function restoreNode(data) {
    if (!data) return;
    if (data.type === 'bookmark') {
      await GG.api.bookmarks.create({ parentId: data.parentId, title: data.title, url: data.url }).catch(() => {});
      return;
    }
    const created = await GG.api.bookmarks.create({ parentId: data.parentId, title: data.title }).catch(() => {});
    if (created) {
      for (const child of (data.children || [])) {
        if (child.type === 'bookmark') {
          await GG.api.bookmarks.create({ parentId: created.id, title: child.title, url: child.url }).catch(() => {});
        } else {
          await restoreNode(Object.assign({}, child, { parentId: created.id }));
        }
      }
    }
  }

  // 新建文件夹（浮动窗口：名称 + 树形位置选择）
  async function newFolder(parentId) {
    if (!GG.folderCreator) { GG.toast.show('编辑器不可用', 'error'); return; }
    const tree = await GG.api.bookmarks.getTree();
    GG.folderCreator.open({
      tree,
      defaultId: parentId || DEFAULT_ROOT,
      onSave: async (data) => {
        try {
          const node = await GG.api.bookmarks.create({ parentId: data.parentId, title: data.name });
          collapse.delete(node.id);
          refresh();
          GG.toast.show('文件夹已创建', 'success');
        } catch (e) {
          GG.toast.show('创建失败：' + (e && e.message), 'error');
        }
      }
    });
  }

  function openFolderMenu(anchor, node) {
    const menu = $('#moveMenu');
    menu.innerHTML = '';
    menu.classList.add('open');
    const items = [
      { label: '在面板中打开', ic: 'folder', fn: () => { if (activePanel()) setPanelFolder(activePanelId, node.id); else addPanel(node.id); } },
      { label: '新建并列面板', ic: 'panelSide', fn: () => addPanel(node.id) },
      { label: '在此新建文件夹', ic: 'folder', fn: () => newFolder(node.id) },
      { label: '重命名', ic: 'settings', fn: () => renameFolder(node) },
      { label: '删除文件夹', ic: 'trash', fn: () => deleteFolder(node), danger: true }
    ];
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.innerHTML = GG.icon(it.ic) + '<span></span>';
      b.querySelector('span').textContent = it.label;
      b.addEventListener('click', () => { menu.classList.remove('open'); it.fn(); });
      menu.appendChild(b);
    });
    const rect = anchor.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 6) + 'px';
    closeMenuOnOutside(menu);
  }
  function renameFolder(node) { promptRename(node); }

  function openCtxMenu(x, y, items) {
    const menu = $('#ctxMenu');
    menu.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.innerHTML = GG.icon(it.ic) + '<span></span>';
      b.querySelector('span').textContent = it.label;
      b.addEventListener('click', () => { menu.classList.remove('open'); it.fn(); });
      menu.appendChild(b);
    });
    menu.classList.add('open');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
    closeCtxMenuOnOutside(menu);
  }

  let ctxMenuCleanup = null;
  function closeCtxMenuOnOutside(menu) {
    if (ctxMenuCleanup) document.removeEventListener('click', ctxMenuCleanup);
    ctxMenuCleanup = (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); };
    setTimeout(() => document.addEventListener('click', ctxMenuCleanup), 0);
  }

  // 重命名文件夹（浮动窗口，仅编辑名称）
  function promptRename(node) {
    if (!GG.bookmarkEditor) return;
    GG.bookmarkEditor.open({
      titleOnly: true,
      title: node.title,
      onSave: async (data) => {
        const t = (data && data.title || '').trim();
        if (!t || t === node.title) return;
        try { await GG.api.bookmarks.update(node.id, { title: t }); pushHistory({ type: 'rename', id: node.id, was: node.title }); GG.toast.show('已重命名', 'success'); refresh(); }
        catch (e) { GG.toast.show('重命名失败', 'error'); }
      }
    });
  }

  // 编辑书签（名称/链接），复用浮动窗口
  function editBookmark(node) {
    if (!GG.bookmarkEditor) return;
    GG.bookmarkEditor.open({
      title: node.title,
      url: node.url,
      onSave: async (data) => {
        const changes = {};
        if (data.title && data.title !== node.title) changes.title = data.title;
        if (data.url && data.url !== node.url) changes.url = data.url;
        if (!Object.keys(changes).length) return;
        try {
          await GG.api.bookmarks.update(node.id, changes);
          pushHistory({ type: 'rename', id: node.id, was: node.title });
          GG.toast.show('已更新书签', 'success');
          refresh();
        } catch (e) {
          GG.toast.show('更新书签失败', 'error');
        }
      }
    });
  }

  async function deleteItem(node) {
    if (node.type === 'folder') {
      if (!confirm(`确定删除文件夹“${node.title}”及其所有内容？`)) return;
      const captured = await captureNode(node.id);
      await GG.api.bookmarks.removeTree(node.id).catch(() => {});
      pushHistory({ type: 'deleteFolder', captured: captured });
      GG.toast.show('已删除文件夹', 'success');
    } else {
      if (!confirm(`确定删除书签“${node.title || node.url}”？`)) return;
      const captured = await captureNode(node.id);
      await GG.api.bookmarks.remove(node.id).catch(() => {});
      pushHistory({ type: 'delete', captured: { [node.id]: captured } });
      GG.toast.show('已删除', 'success');
    }
    refresh();
  }

  async function deleteFolder(node) {
    if (!confirm(`确定删除文件夹“${node.title}”及其所有内容？`)) return;
    const captured = await captureNode(node.id);
    await GG.api.bookmarks.removeTree(node.id).catch(() => {});
    pushHistory({ type: 'deleteFolder', captured: captured });
    GG.toast.show('已删除文件夹', 'success');
    refresh();
  }

  function closeMenuOnOutside(menu) {
    if (moveMenuCleanup) document.removeEventListener('click', moveMenuCleanup);
    moveMenuCleanup = (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); };
    setTimeout(() => document.addEventListener('click', moveMenuCleanup), 0);
  }

  // === UNDO ===
  function pushHistory(entry) {
    history.push(entry);
    if (history.length > 30) history.shift();
    updateToolbar();
  }
  async function undo() {
    const entry = history.pop();
    if (!entry) return;
    if (entry.type === 'delete') { for (const id of Object.keys(entry.captured)) await restoreNode(entry.captured[id]); GG.toast.show('已撤销删除', 'success'); refresh(); }
    else if (entry.type === 'move') { for (const id of Object.keys(entry.prev)) await GG.api.bookmarks.move(id, { parentId: entry.prev[id] }).catch(() => {}); GG.toast.show('已撤销移动', 'success'); refresh(); }
    else if (entry.type === 'reorder') { await applyOrderSilent(entry.folderId, entry.prev); GG.toast.show('已撤销排序', 'success'); refresh(); }
    else if (entry.type === 'rename') { await GG.api.bookmarks.update(entry.id, { title: entry.was }).catch(() => {}); renderFolderTree(); refresh(); }
    else if (entry.type === 'deleteFolder') { await restoreNode(entry.captured); GG.toast.show('已撤销删除文件夹', 'success'); refresh(); }
    updateToolbar();
  }
  async function applyOrderSilent(folderId, order) {
    await Promise.all(order.map((id, i) => GG.api.bookmarks.move(id, { parentId: folderId, index: i })));
  }

  // === 书签查重视图 ===
  // 递归收集全部书签节点并记录其所在路径（用于显示位置）
  function collectBookmarks(nodes, path, out) {
    (nodes || []).forEach((n) => {
      if (n.type === 'bookmark' && n.url) {
        out.push({ id: n.id, title: n.title || hostOf(n.url), url: n.url, path: path.concat(n.title || '（未命名）') });
      } else if (n.type === 'folder') {
        collectBookmarks(n.children, path.concat(n.title || '（未命名）'), out);
      }
    });
  }
  // 扫描全部书签并按 url 分组，只保留出现次数 > 1 的分组。
  // 每组默认标记第一项为保留（keep=true），其余为待删除。
  function buildDupData() {
    const prevActiveUrl = activeDupGroup ? activeDupGroup.url : null;
    const all = [];
    collectBookmarks(tree, [], all);
    const byUrl = new Map();
    for (const b of all) {
      if (!byUrl.has(b.url)) byUrl.set(b.url, []);
      byUrl.get(b.url).push(b);
    }
    dupGroups = [];
    for (const [url, items] of byUrl) {
      if (items.length > 1) {
        dupGroups.push({ url, items: items.map((b, i) => Object.assign({}, b, { keep: i === 0 })) });
      }
    }
    dupGroups.sort((a, b) => b.items.length - a.items.length);
    // 尽量保持之前选中的分组（按 url 匹配），否则回退到第一个分组
    activeDupGroup = (prevActiveUrl && dupGroups.find((g) => g.url === prevActiveUrl)) || dupGroups[0] || null;
  }
  // 渲染查重结果侧栏（分组列表 + 统计）
  function renderDupGroups() {
    const groups = $('#dupGroups');
    groups.innerHTML = '';
    buildDupData();
    const totalDup = dupGroups.reduce((s, g) => s + (g.items.length - 1), 0);
    const totalBookmarks = (function count(nodes){ let c=0; (nodes||[]).forEach(n=>{ if(n.type==='bookmark')c++; else if(n.type==='folder') c+=count(n.children); }); return c; })(tree);
    $('#dupSummary').innerHTML =
      `<div class="stat"><b>${dupGroups.length}</b><span>组重复</span></div>` +
      `<div class="stat"><b>${totalDup}</b><span>多余项</span></div>` +
      `<div class="stat"><b>${totalBookmarks}</b><span>总书签</span></div>`;
    if (!dupGroups.length) return;
    dupGroups.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'group-item' + (g === activeDupGroup ? ' active' : '');
      const host = hostOf(g.url);
      item.innerHTML = `<span class="gi-title">${host}</span><span class="gi-count">${g.items.length}</span>`;
      item.title = g.url;
      item.addEventListener('click', () => { activeDupGroup = g; renderDupGroups(); renderDupList(); });
      groups.appendChild(item);
    });
  }
  // 渲染当前分组内书签，供用户选择保留/删除
  function renderDupList() {
    const list = $('#dupList');
    list.innerHTML = '';
    if (!dupGroups.length) {
      list.innerHTML = `<div class="dup-empty"><div class="dup-empty-icon">${GG.icon('target')}</div>未发现重复书签</div>`;
      const bar = document.getElementById('dupActions');
      if (bar) bar.remove();
      return;
    }
    const g = activeDupGroup;
    if (!g) return;
    const block = document.createElement('div');
    block.className = 'dup-group-block';
    const title = document.createElement('div');
    title.className = 'dup-group-title';
    title.innerHTML = `<span class="dgt-url">${g.url}</span><span class="dgt-count">${g.items.length} 个</span>`;
    block.appendChild(title);
    g.items.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'dup-item' + (b.keep ? ' dup-keep' : '');
      row.dataset.keep = b.keep ? '1' : '0';
      const icon = document.createElement('span');
      icon.className = 'item-icon';
      GG.renderFavicon(icon, b.url, b.title, (orgSettings && orgSettings.faviconSource) || GG.DEFAULTS.faviconSource);
      const info = document.createElement('div');
      info.className = 'di-info';
      const t = document.createElement('div');
      t.className = 'di-title'; t.textContent = b.title;
      const loc = document.createElement('div');
      loc.className = 'di-loc'; loc.textContent = b.path.join(' / ') || '（无路径）';
      info.append(t, loc);
      const actions = document.createElement('div');
      actions.className = 'di-actions';
      const btnKeep = document.createElement('button');
      btnKeep.className = 'di-btn' + (b.keep ? ' primary' : '');
      btnKeep.textContent = b.keep ? '保留' : '删除';
      btnKeep.addEventListener('click', (e) => { e.stopPropagation(); toggleDupKeep(g, b); });
      actions.appendChild(btnKeep);
      row.append(icon, info, actions);
      row.addEventListener('click', () => toggleDupKeep(g, b));
      block.appendChild(row);
    });
    list.appendChild(block);
    renderDupActions(g);
  }
  // 渲染右侧底部执行按钮区
  function renderDupActions(g) {
    let bar = document.getElementById('dupActions');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dupActions';
      bar.className = 'dup-actions';
      $('#dupView .dup-main').appendChild(bar);
    }
    const toDel = g.items.filter((x) => !x.keep).length;
    bar.innerHTML = `<span class="da-hint">本组将删除 ${toDel} 个重复书签</span>` +
      `<button class="btn danger da-exec" ${toDel ? '' : 'disabled'}>执行删除</button>`;
    const btn = bar.querySelector('.da-exec');
    btn.addEventListener('click', () => executeDupDelete(g));
  }
  // 切换某个书签的保留状态（保证至少保留一份）
  function toggleDupKeep(group, b) {
    const keptCount = group.items.filter((x) => x.keep).length;
    if (b.keep && keptCount <= 1) { GG.toast.show('至少保留一份书签', 'info'); return; }
    b.keep = !b.keep;
    renderDupList();
  }
  // 执行删除：删除当前组所有未保留的书签，仅本地更新（不重新读取书签树）
  async function executeDupDelete(group) {
    const toDel = group.items.filter((x) => !x.keep);
    if (!toDel.length) return;
    if (!confirm(`确定删除本组 ${toDel.length} 个重复书签？`)) return;
    let del = 0;
    await Promise.all(toDel.map((b) => GG.api.bookmarks.remove(b.id).then(() => { del++; }, () => {})));
    // 本地更新：从 tree 缓存移除已删除节点，保证 buildDupData 不再扫描到它们
    removeNodesFromTree(new Set(toDel.map((b) => b.id)));
    GG.toast.show(`已删除 ${del} 个重复书签`, 'success');
    // 仅本地刷新
    rebuildFolderCount();
    if (dupViewOn) { renderDupGroups(); renderDupList(); }
    renderFolderTree();
    await Promise.all(panels.map((p) => renderPanel(p)));
  }
  // 从本地 tree 缓存中移除指定 id 的节点（递归遍历）
  function removeNodesFromTree(ids) {
    const prune = (nodes) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (ids.has(n.id)) { nodes.splice(i, 1); continue; }
        if (n.children) prune(n.children);
      }
    };
    prune(tree);
  }
  function switchView() {
    dupViewOn = !dupViewOn;
    const layout = document.querySelector('.layout');
    const dupView = $('#dupView');
    if (!layout || !dupView) return;
    layout.hidden = dupViewOn;
    dupView.hidden = !dupViewOn;
    $('#btnDupCheck').classList.toggle('active', dupViewOn);
    if (dupViewOn) { renderDupGroups(); renderDupList(); }
    else { renderFolderTree(); renderPanels(); }
  }

  function updateToolbar() {
    const p = activePanel();
    const n = p ? p.selection.size : 0;
    $('#btnDelete').disabled = n === 0;
    $('#btnUndo').disabled = history.length === 0;
    $('#selectedInfo').textContent = n ? `已选 ${n} 项` : '未选中';
  }

  function wireButtons() {
    $('#btnDelete').innerHTML = GG.icon('trash');
    $('#btnUndo').innerHTML = GG.icon('undo');
    $('#btnHome').innerHTML = GG.icon('return');
    $('#btnDupCheck').innerHTML = GG.icon('copy');
    $('#btnDupCheck').addEventListener('click', switchView);
    $('#btnDupRefresh').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z"></path></svg>';
    $('#btnDupRefresh').addEventListener('click', () => { renderDupGroups(); renderDupList(); GG.toast.show('已重新扫描', 'success'); });
    $('#btnUndo').addEventListener('click', undo);
    $('#btnDelete').addEventListener('click', deleteSelected);
    $('#btnHome').addEventListener('click', () => GG.api.tabs.update({ url: GG.api.runtime.getURL('pages/newtab/newtab.html') }));
    $('#btnNewFolder').innerHTML = GG.icon('folder');
    $('#btnNewFolder').addEventListener('click', () => newFolder(activePanel() ? activePanel().folderId : DEFAULT_ROOT));
    $('#btnCollapseAll').innerHTML = GG.icon('foldUp');
    $('#btnCollapseAll').addEventListener('click', collapseAll);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && activePanel() && activePanel().selection.size) { e.preventDefault(); deleteSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    });
  }

  // 面板书签列数切换
  function applyColToggleUI() {
    document.querySelectorAll('.col-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.col) === orgColumns);
    });
  }
  function wireColToggle() {
    const wrap = document.getElementById('colToggle');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.col-btn');
      if (!btn) return;
      const col = Number(btn.dataset.col) || 1;
      if (col === orgColumns) return;
      orgColumns = col;
      GG.api.storage.set({ orgColumns: col });
      applyColToggleUI();
      renderPanels();
    });
  }

  async function init() {
    wireButtons();
    orgSettings = await GG.loadSettings();
    // 读取面板列数
    try {
      const d = await GG.api.storage.get('orgColumns');
      orgColumns = (d && d.orgColumns) || 1;
    } catch (e) { orgColumns = 1; }
    wireColToggle();
    applyColToggleUI();
    await loadTree();
    let first = null, second = null;
    walkFolders(tree, (fnode) => { if (!first) first = fnode.id; else if (!second) second = fnode.id; });
    if (first) addPanel(first);
    if (second) addPanel(second);
    if (!first && !second) addPanel(DEFAULT_ROOT);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
