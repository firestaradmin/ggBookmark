/* GG Bookmark - organizer page logic
 * Rich bookmark manager: folder tree + contents grid,
 * multi-select, drag to reorder/move, delete, create, rename.
 */

(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const grid = $('#bookmarkGrid');

  const sel = {
    folders: new Set(),      // selected folder ids
    items: new Set(),        // selected bookmark ids in current folder
    reorder: false,          // dragging to reorder within same folder
    lastClicked: null,
    dragIds: [],
    dragFromFolder: null
  };

  let tree = [];             // full bookmark tree (root children)
  let currentFolderId = 'root________';
  let history = [];
  const collapse = new Set();
  let moveMenuCleanup = null;

  // ---------- Helpers ----------
  function walkFolders(nodes, cb) {
    (nodes || []).forEach((n) => {
      if (n.type === 'folder') {
        cb(n);
        walkFolders(n.children, cb);
      }
    });
  }

  // ---------- Initial load ----------
  async function loadTree() {
    const roots = await browser.bookmarks.getTree();
    tree = roots[0].children || [];
    renderFolderTree();
    renderContent();
  }

  // ---------- Folder tree rendering ----------
  function renderFolderTree() {
    const root = $('#folderTree');
    root.innerHTML = '';
    // 'Bookmarks menu' style quick roots are handled; render all top folders
    tree.forEach((node) => {
      if (node.type === 'folder') root.appendChild(buildTreeNode(node, 0));
    });
  }

  function buildTreeNode(node, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    wrap.dataset.id = node.id;
    const childFolders = (node.children || []).filter((c) => c.type === 'folder');
    const bmCount = (node.children || []).filter((c) => c.type === 'bookmark').length;

    const row = document.createElement('div');
    row.className = 'tree-row' + (sel.folders.has(node.id) ? ' selected' : '');
    row.style.paddingLeft = (8 + depth * 4) + 'px';

    const toggle = document.createElement('span');
    toggle.className = 'tw-toggle' + (collapse.has(node.id) ? ' collapsed' : '');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapse.has(node.id)) collapse.delete(node.id);
      else collapse.add(node.id);
      const sub = wrap.querySelector(':scope > .tree-children');
      activateCollapse(sub, node.id);
    });

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
    more.innerHTML = GG.icon('settings');
    more.style.width = '24px'; more.style.height = '24px';
    more.addEventListener('click', (e) => { e.stopPropagation(); openFolderMenu(more, node); });

    row.append(toggle, icon, name, cnt, more);
    row.addEventListener('click', (e) => {
      if (e.target.closest('.tr-more') || e.target.closest('.tw-toggle')) return;
      selectFolder(node.id);
    });
    // allow dropping bookmark onto a folder
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    row.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); moveSelectedTo(node.id); });

    wrap.appendChild(row);

    if (childFolders.length) {
      const sub = document.createElement('div');
      sub.className = 'tree-children' + (collapse.has(node.id) ? ' collapsed' : '');
      childFolders.forEach((c) => sub.appendChild(buildTreeNode(c, depth + 1)));
      wrap.appendChild(sub);
    }
    return wrap;
  }

  function activateCollapse(sub, id) {
    if (sub) sub.classList.toggle('collapsed', collapse.has(id));
  }

  function selectFolder(id) {
    sel.folders.clear();
    sel.folders.add(id);
    currentFolderId = id;
    sel.items.clear();
    renderFolderTree();
    renderContent();
  }

  // ---------- Content rendering ----------
  async function renderContent() {
    let children;
    try {
      if (currentFolderId === 'root________') {
        const roots = await browser.bookmarks.getTree();
        children = roots[0].children || [];
      } else {
        children = await browser.bookmarks.getChildren(currentFolderId);
      }
    } catch (e) { children = []; }

    // folder title
    const titleWrap = $('#currentFolderTitle');
    const span = titleWrap.querySelector('span');
    let folderTitle = '书签';
    if (currentFolderId !== 'root________') {
      try {
        const arr = await browser.bookmarks.get(currentFolderId);
        if (arr && arr[0]) folderTitle = arr[0].title;
      } catch (e) {}
    }
    span.textContent = folderTitle;

    grid.innerHTML = '';
    if (!children.length) { grid.innerHTML = '<div class="empty">这个文件夹是空的</div>'; return; }

    const tpl = $('#bookmarkItemTpl');
    children.forEach((node) => {
      const item = tpl.content.cloneNode(true).querySelector('.item');
      item.dataset.id = node.id;
      item.dataset.type = node.type;

      if (node.type === 'folder') {
        item.querySelector('.item-type').textContent = '文件夹';
        item.querySelector('.item-title').textContent = node.title || '（未命名）';
        item.querySelector('.item-url').textContent = `${(node.children||[]).length} 项`;
        const icon = item.querySelector('.item-icon');
        icon.innerHTML = GG.icon('folder');
      } else {
        item.querySelector('.item-type').textContent = '书签';
        item.querySelector('.item-title').textContent = node.title || (function () { try { return new URL(node.url).host; } catch (e) { return node.url; } })();
        item.querySelector('.item-url').textContent = (function () { try { return new URL(node.url).host; } catch (e) { return node.url; } })();
        const icon = item.querySelector('.item-icon');
        const img = document.createElement('img');
        img.onerror = function () { const s = document.createElement('span'); s.className = 'letter'; s.textContent = (node.title || '?').charAt(0); icon.innerHTML = ''; icon.appendChild(s); };
        img.src = GG.iconFor(node.url).src;
        icon.appendChild(img);
      }

      if (sel.items.has(node.id)) item.classList.add('selected');

      item.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(node.id, item);
        } else if (e.shiftKey && sel.lastClicked) {
          const ids = children.map((c) => c.id);
          const a = ids.indexOf(sel.lastClicked); const b = ids.indexOf(node.id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) sel.items.add(ids[i]);
            renderContent();
          }
        } else {
          if (sel.items.has(node.id)) {
            // clicking an already selected item clears others but keeps it
            sel.items.clear();
            sel.items.add(node.id);
          } else {
            sel.items.clear();
            sel.items.add(node.id);
          }
          renderContent();
        }
        sel.lastClicked = node.id;
        updateToolbar();
      });
      // double-click opens bookmark or folder
      item.addEventListener('dblclick', () => {
        if (node.type === 'bookmark') browser.tabs.create({ url: node.url });
        else selectFolder(node.id);
      });

      // dragging: reorder/move bookmarks
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (e) => {
        // update selection WITHOUT rebuilding the grid (rebuilding would
        // destroy the dragged node and cancel the drag).
        if (!sel.items.has(node.id)) {
          sel.items.clear();
          sel.items.add(node.id);
          grid.querySelectorAll('.item.selected').forEach((el) => el.classList.remove('selected'));
          item.classList.add('selected');
          updateToolbar();
        }
        sel.dragIds = Array.from(sel.items);
        sel.dragFromFolder = currentFolderId;
        const url = node.type === 'bookmark' ? node.url : '';
        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.effectAllowed = 'copyMove';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        sel.dragIds = [];
        sel.dragFromFolder = null;
        grid.classList.remove('drop-active');
      });

      // reordering within grid
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (sel.dragFromFolder === currentFolderId && sel.dragIds.length && !sel.dragIds.includes(node.id)) {
          const r = item.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          item.classList.toggle('drop-before', before);
          item.classList.toggle('drop-after', !before);
        }
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drop-before', 'drop-after');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drop-before', 'drop-after');
        if (sel.dragFromFolder === currentFolderId && sel.dragIds.length) {
          reorderWithin(item, e.clientY);
        }
      });

      grid.appendChild(item);
    });

    // grid-level drop to move into this folder
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      grid.classList.add('drop-active');
    });
    grid.addEventListener('dragleave', (e) => {
      if (!grid.contains(e.relatedTarget)) grid.classList.remove('drop-active');
    });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      grid.classList.remove('drop-active');
      if (sel.dragFromFolder && sel.dragFromFolder !== currentFolderId && sel.dragIds.length) {
        moveIdsTo(sel.dragIds, currentFolderId);
      }
    });

    updateToolbar();
  }

  function toggleSelect(id, item) {
    if (sel.items.has(id)) sel.items.delete(id);
    else sel.items.add(id);
    item.classList.toggle('selected', sel.items.has(id));
    updateToolbar();
  }

  // ---------- Reorder within folder ----------
  async function reorderWithin(refItem, clientY) {
    if (!refItem || refItem.dataset.type === 'folder') return;
    const rect = refItem.getBoundingClientRect();
    const insertBefore = clientY < rect.top + rect.height / 2;

    const ids = Array.from(sel.dragIds);
    if (!ids.length) return;

    const children = await browser.bookmarks.getChildren(currentFolderId);
    const order = children.map((c) => c.id);
    const prevOrder = order.slice();

    const rest = order.filter((id) => !ids.includes(id));
    let targetIndex = rest.indexOf(refItem.dataset.id);
    if (targetIndex === -1) return;
    if (!insertBefore) targetIndex += 1;
    const beforeId = rest[targetIndex] !== undefined ? rest[targetIndex] : undefined;
    const finalOrder = [];
    for (const id of rest) {
      if (beforeId !== undefined && id === beforeId) {
        finalOrder.push(...ids);
        finalOrder.push(id);
      } else {
        finalOrder.push(id);
      }
    }
    if (beforeId === undefined) finalOrder.push(...ids);
    const seen = new Set();
    const clean = finalOrder.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

    if (JSON.stringify(clean) === JSON.stringify(prevOrder)) return;

    // Apply left-to-right: place each item at its final index. Earlier slots
    // are filled first, so later moves never disturb already-placed items.
    for (let i = 0; i < clean.length; i++) {
      await browser.bookmarks.move(clean[i], { parentId: currentFolderId, index: i }).catch(() => {});
    }
    pushHistory({ type: 'reorder', folderId: currentFolderId, prev: prevOrder, target: clean });
    GG.toast.show('已重新排序', 'success');
    renderContent();
  }

  // ---------- Moving selected across folders ----------
  async function moveIdsTo(ids, targetFolder) {
    if (!ids.length) return;
    const prev = {}; // id -> prevParent
    for (const id of ids) {
      const arr = await browser.bookmarks.get(id).catch(() => []).then((a) => a);
      if (arr[0]) prev[id] = arr[0].parentId;
    }
    let moved = 0;
    for (const id of ids) {
      try { await browser.bookmarks.move(id, { parentId: targetFolder }); moved++; } catch (e) {}
    }
    if (moved) {
      pushHistory({ type: 'move', prev, target: targetFolder, ids });
      GG.toast.show(`已移动 ${moved} 项`, 'success');
      renderFolderTree();
      renderContent();
    }
  }
  function moveSelectedTo(folderId) {
    if (sel.items.size) {
      const ids = Array.from(sel.items);
      moveIdsTo(ids, folderId);
    }
  }

  // ---------- Delete ----------
  async function deleteSelected() {
    const ids = Array.from(sel.items);
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 项？此操作会删除书签。`)) return;
    // capture full data for undo (recursively)
    const captured = {};
    for (const id of ids) {
      captured[id] = await captureNode(id);
    }
    let del = 0;
    await Promise.all(ids.map((id) => browser.bookmarks.removeTree(id).then(() => { del++; }, () => {})));
    if (del) {
      pushHistory({ type: 'delete', captured });
      GG.toast.show(`已删除 ${del} 项`, 'success');
      sel.items.clear();
      renderFolderTree();
      renderContent();
    }
  }

  // Deep-capture a bookmark node (recursively) for possible restore
  async function captureNode(id) {
    const arr = await browser.bookmarks.get(id).catch(() => []);
    if (!arr[0]) return null;
    const node = arr[0];
    return {
      parentId: node.parentId,
      title: node.title,
      url: node.url,
      type: node.type,
      index: node.index,
      children: node.type === 'folder' ? (await browser.bookmarks.getChildren(id)) : null
    };
  }
  async function restoreNode(data) {
    if (!data) return;
    if (data.type === 'bookmark') {
      await browser.bookmarks.create({ parentId: data.parentId, title: data.title, url: data.url }).catch(() => {});
    } else {
      const created = await browser.bookmarks.create({ parentId: data.parentId, title: data.title }).catch(() => {});
      if (created) {
        // recreate children (this is a shallow version; deeper nesting not perfectly restored)
        for (let i = 0; i < (data.children || []).length; i++) {
          const child = data.children[i];
          if (child.type === 'bookmark') {
            await browser.bookmarks.create({ parentId: created.id, title: child.title, url: child.url }).catch(() => {});
          } else {
            const f = await browser.bookmarks.create({ parentId: created.id, title: child.title }).catch(() => {});
            if (f && child.children) for (const gc of child.children) {
              if (gc.type === 'bookmark') await browser.bookmarks.create({ parentId: f.id, title: gc.title, url: gc.url }).catch(() => {});
            }
          }
        }
      }
    }
  }

  // ---------- New folder ----------
  async function newFolder(parentId = currentFolderId) {
    const name = prompt('文件夹名称：', '新文件夹');
    if (!name || !name.trim()) return;
    const node = await browser.bookmarks.create({ parentId, title: name.trim() });
    collapse.delete(node.id);
    renderFolderTree();
    renderContent();
  }

  // ---------- Rename ----------
  function openRename(node) {
    const nameEl = document.querySelector(`.tree-node[data-id="${node.id}"] .tr-name`);
    if (!nameEl) return;
    nameEl.innerHTML = '';
    const input = document.createElement('input');
    input.value = node.title || '';
    nameEl.appendChild(input);
    input.focus(); input.select();
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') { await commitRename(node, input.value); }
      if (e.key === 'Escape') { nameEl.textContent = node.title; }
    });
    input.addEventListener('blur', () => commitRename(node, input.value));
  }
  async function commitRename(node, title) {
    const t = (title || '').trim();
    if (!t) { renderFolderTree(); return; }
    const oldTitle = node.title;
    if (t !== oldTitle) {
      try {
        await browser.bookmarks.update(node.id, { title: t });
        pushHistory({ type: 'rename', id: node.id, was: oldTitle });
        GG.toast.show('已重命名', 'success');
        renderFolderTree();
      } catch (e) { renderFolderTree(); }
    }
  }

  // ---------- Folder menu ----------
  function openFolderMenu(anchor, node) {
    const menu = $('#moveMenu');
    menu.innerHTML = '';
    menu.classList.add('open');
    const items = [
      { label: '打开此文件夹', ic: 'folder', fn: () => selectFolder(node.id) },
      { label: '在此新建文件夹', ic: 'folderPlus', fn: () => newFolder(node.id) },
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
  function renameFolder(node) { openRename(node); }
  async function deleteFolder(node) {
    if (!confirm(`确定删除文件夹“${node.title}”及其所有内容？`)) return;
    await browser.bookmarks.removeTree(node.id).catch(() => {});
    pushHistory({ type: 'deleteFolder', id: node.id, title: node.title, parentId: node.parentId });
    GG.toast.show('已删除文件夹', 'success');
    renderFolderTree();
    renderContent();
  }

  function closeMenuOnOutside(menu) {
    if (moveMenuCleanup) document.removeEventListener('click', moveMenuCleanup);
    moveMenuCleanup = (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); };
    setTimeout(() => document.addEventListener('click', moveMenuCleanup), 0);
  }

  // ---------- Undo ----------
  function pushHistory(entry) {
    history.push(entry);
    if (history.length > 30) history.shift();
    updateToolbar();
  }

  async function undo() {
    const entry = history.pop();
    if (!entry) return;
    if (entry.type === 'delete') {
      for (const id of Object.keys(entry.captured)) {
        await restoreNode(entry.captured[id]);
      }
      GG.toast.show('已撤销删除', 'success');
      renderFolderTree();
      renderContent();
    } else if (entry.type === 'move') {
      for (const id of entry.prev) {
        await browser.bookmarks.move(id, { parentId: entry.prev[id] }).catch(() => {});
      }
      GG.toast.show('已撤销移动', 'success');
      renderFolderTree();
      renderContent();
    } else if (entry.type === 'reorder') {
      await applyOrderSilent(entry.folderId, entry.prev);
      GG.toast.show('已撤销排序', 'success');
      renderContent();
    } else if (entry.type === 'rename') {
      await browser.bookmarks.update(entry.id, { title: entry.was }).catch(() => {});
      renderFolderTree();
    } else if (entry.type === 'deleteFolder') {
      if (entry.parentId) {
        await browser.bookmarks.create({ parentId: entry.parentId, title: entry.title }).catch(() => {});
      }
      renderFolderTree();
    }
    updateToolbar();
  }
  async function applyOrderSilent(folderId, order) {
    await Promise.all(order.map((id, i) => browser.bookmarks.move(id, { parentId: folderId, index: i })));
  }

  // ---------- Wildcards ----------
  function updateToolbar() {
    $('#btnDelete').disabled = sel.items.size === 0;
    $('#btnUndo').disabled = history.length === 0;
    $('#selectedInfo').textContent = sel.items.size ? `已选 ${sel.items.size} 项` : '未选中';
  }

  function wireButtons() {
    $('#btnDelete').innerHTML = GG.icon('trash');
    $('#btnUndo').innerHTML = GG.icon('undo');
    $('#btnHome').innerHTML = GG.icon('grid');
    $('#btnUndo').addEventListener('click', undo);
    $('#btnDelete').addEventListener('click', deleteSelected);
    $('#btnHome').addEventListener('click', () => browser.tabs.update({ url: './../newtab/newtab.html' }));
    $('#btnNewFolder').innerHTML = GG.icon('folderPlus');
    $('#btnNewFolder').addEventListener('click', () => newFolder(currentFolderId));
    // global keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && sel.items.size) { e.preventDefault(); deleteSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    });
  }

  // ---------- Init ----------
  async function init() {
    wireButtons();
    await loadTree();
    // default select first root folder found
    let first = null;
    walkFolders(tree, (fnode) => { if (!first) first = fnode.id; });
    if (first) {
      currentFolderId = first;
      sel.folders.add(first);
      renderFolderTree();
      renderContent();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
