(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  let folders = [], recents = [], matches = [], selectedId = null, tree = [];
  let byId = new Map(), children = new Map(), expanded = new Set();
  let busy = false, ready = false, saved = false, existing = [], bookmarkId = '';
  const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/></svg>';

  function message(text, kind = '') {
    $('#status').textContent = text;
    $('#status').className = 'status ' + kind;
  }

  function currentBookmark() {
    return existing.find((node) => node.parentId === selectedId) || existing.find((node) => node.id === bookmarkId) || existing[0];
  }

  function syncControls() {
    const creating = !$('#newFolderPanel').classList.contains('hidden');
    const locked = busy || saved;
    $('#saveBookmark').disabled = locked || !ready || !selectedId || !matches.length || creating;
    $('#toggleNewFolder').disabled = locked || !ready || !selectedId;
    const bookmark = currentBookmark();
    $('#saveBookmark').textContent = saved ? '已保存 ✓' : busy ? '处理中…'
      : bookmark ? (bookmark.parentId === selectedId ? '保存修改 ↵' : '移动书签 ↵') : '保存书签 ↵';
    $('#panelTitle').textContent = existing.length ? '编辑已收藏的网页' : '收藏当前网页';
    $('#bookmarkForm').querySelectorAll('input, select').forEach((input) => { input.disabled = locked; });
    $('#createFolder').disabled = locked;
    $('#locateExisting').disabled = locked;
    document.querySelectorAll('#folderList button, #recentFolders button').forEach((button) => { button.disabled = locked; });
    $('#folderList').setAttribute('aria-disabled', String(locked));
  }

  function revealFolder(id) {
    let folder = byId.get(id);
    while (folder && byId.has(folder.parentId)) {
      expanded.add(folder.parentId);
      folder = byId.get(folder.parentId);
    }
  }

  function selectFolder(id, scroll = false, focusTree = false) {
    selectedId = id;
    const folder = byId.get(id);
    $('#selectedFolder').textContent = folder ? '保存位置：' + folder.path.join(' / ') : '请选择保存文件夹';
    $('#selectedFolder').title = folder?.path.join(' / ') || '';
    let active = null;
    $('#folderList').querySelectorAll('[role="treeitem"]').forEach((row) => {
      const selected = row.dataset.folderId === id;
      row.setAttribute('aria-selected', String(selected));
      row.tabIndex = selected ? 0 : -1;
      if (selected) active = row;
    });
    if (active) {
      $('#folderSearch').setAttribute('aria-activedescendant', active.id);
      if (scroll) active.scrollIntoView({ block: 'nearest' });
      if (focusTree) active.focus();
    } else $('#folderSearch').removeAttribute('aria-activedescendant');
    syncControls();
  }

  function toggleFolder(id, focusTree = false) {
    if (busy || saved) return;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    renderFolders();
    if (focusTree) selectFolder(id, false, true);
  }

  function renderFolders({ searchChanged = false, scroll = false } = {}) {
    const query = $('#folderSearch').value.trim();
    const list = $('#folderList');
    const scrollTop = list.scrollTop;
    let total = 0;
    if (query) {
      const found = GG.QuickBookmark.orderedFolders(folders, recents, query);
      total = found.length;
      matches = found.slice(0, 300);
      if (searchChanged && matches.length) selectedId = matches[0].id;
    } else {
      const visible = new Set();
      matches = folders.filter((folder) => {
        if (!byId.has(folder.parentId) || (visible.has(folder.parentId) && expanded.has(folder.parentId))) {
          visible.add(folder.id); return true;
        }
        return false;
      });
    }
    list.innerHTML = '';
    matches.forEach((folder, index) => {
      const row = document.createElement('div');
      row.className = 'folder-row' + (query ? ' search-result' : '');
      row.id = 'folder-row-' + index;
      row.dataset.folderId = folder.id;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-label', folder.path.join(' / ') + '，' + folder.bookmarkCount + ' 个书签');
      row.setAttribute('aria-level', String(query ? 1 : folder.path.length));
      row.style.setProperty('--depth', String(query ? 0 : folder.path.length - 1));
      const hasChildren = !!children.get(folder.id)?.length;
      if (!query && hasChildren) row.setAttribute('aria-expanded', String(expanded.has(folder.id)));
      const toggle = document.createElement(hasChildren && !query ? 'button' : 'span');
      toggle.className = 'folder-toggle';
      if (hasChildren && !query) {
        toggle.type = 'button';
        toggle.tabIndex = -1;
        toggle.textContent = expanded.has(folder.id) ? '⌄' : '›';
        toggle.setAttribute('aria-label', (expanded.has(folder.id) ? '收起' : '展开') + folder.title);
        toggle.addEventListener('click', (event) => { event.stopPropagation(); toggleFolder(folder.id); $('#folderSearch').focus(); });
      }
      const icon = document.createElement('span');
      icon.className = 'folder-mark';
      icon.innerHTML = folderIcon;
      const info = document.createElement('span');
      info.className = 'folder-info';
      const title = document.createElement('strong');
      title.textContent = folder.title || '未命名文件夹';
      info.appendChild(title);
      if (query) {
        const path = document.createElement('small');
        path.textContent = folder.path.join(' / ');
        info.appendChild(path);
      }
      const count = document.createElement('span');
      count.className = 'folder-count';
      count.textContent = folder.bookmarkCount;
      count.title = '含子文件夹的书签数量';
      row.append(toggle, icon, info, count);
      row.title = folder.path.join(' / ');
      row.addEventListener('click', () => { if (!busy && !saved) selectFolder(folder.id, false, true); });
      list.appendChild(row);
    });
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'folder-empty';
      empty.textContent = '没有匹配的文件夹，可清空搜索或新建文件夹。';
      list.appendChild(empty);
    }
    $('#folderHint').textContent = query
      ? (total > 300 ? '显示前 300 个结果，请增加关键词 · ' : '') + '↑↓ 选择搜索结果 · Enter 保存'
      : '←→ 展开 / 收起 · ↑↓ 选择 · Enter 保存';
    list.scrollTop = scrollTop;
    selectFolder(selectedId, scroll);
  }

  function renderRecents() {
    const box = $('#recentFolders');
    box.innerHTML = '';
    const recentFolders = recents.map((id) => byId.get(id)).filter(Boolean).slice(0, 4);
    box.classList.toggle('hidden', !recentFolders.length);
    const label = document.createElement('span');
    label.textContent = '最近';
    box.appendChild(label);
    recentFolders.forEach((folder) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-chip';
      button.textContent = folder.title;
      button.title = folder.path.join(' / ');
      button.addEventListener('click', () => {
        $('#folderSearch').value = '';
        revealFolder(folder.id);
        selectedId = folder.id;
        renderFolders({ scroll: true });
      });
      box.appendChild(button);
    });
  }

  function locateExisting() {
    const bookmark = existing.find((node) => node.id === bookmarkId) || existing[0];
    if (!bookmark) return;
    $('#folderSearch').value = '';
    selectedId = byId.has(bookmark.parentId) ? bookmark.parentId : null;
    revealFolder(selectedId);
    renderFolders({ scroll: true });
    if (!selectedId) $('#selectedFolder').textContent = '原位置为只读文件夹：' + bookmark.folderPath.join(' / ');
  }

  function showExisting({ locate = false, useTitle = false } = {}) {
    existing = GG.QuickBookmark.existingBookmarks(tree, $('#bookmarkUrl').value);
    bookmarkId = existing.find((node) => node.id === bookmarkId)?.id || existing[0]?.id || '';
    $('#existingHint').classList.toggle('hidden', !existing.length);
    $('#locateExisting').classList.toggle('hidden', !existing.length);
    const original = existing.find((node) => node.id === bookmarkId);
    $('#existingHint').textContent = original
      ? '已收藏于 ' + original.folderPath.join(' / ') + '。改选文件夹后将移动原书签。' + (existing.length > 1 ? ' 检测到历史重复项，本次不会新增副本。' : '') : '';
    if (original && useTitle) $('#bookmarkTitle').value = original.title || original.url;
    if (original && locate) locateExisting();
    syncControls();
  }

  async function loadFolders() {
    tree = await GG.api.bookmarks.getTree();
    folders = GG.QuickBookmark.folders(tree);
    byId = new Map(folders.map((folder) => [folder.id, folder]));
    children = new Map();
    folders.forEach((folder) => {
      if (!children.has(folder.parentId)) children.set(folder.parentId, []);
      children.get(folder.parentId).push(folder);
    });
  }

  async function save(event) {
    event.preventDefault();
    if (busy || !ready || saved) return;
    if (!$('#newFolderPanel').classList.contains('hidden')) { message('请先创建文件夹，或收起新建表单。', 'error'); return; }
    if (!selectedId || !matches.length) { message('请先选择保存文件夹，或新建一个文件夹。', 'error'); return; }
    busy = true; syncControls(); message('');
    try {
      const result = await GG.QuickBookmark.save({ title: $('#bookmarkTitle').value, url: $('#bookmarkUrl').value, folderId: selectedId, cardId: $('#targetCard').value, bookmarkId });
      saved = true;
      if (result.warnings.length) message(result.warnings.join(' '), 'warning');
      else message((result.moved ? '已移动原书签' : result.reused ? '已更新收藏' : '已保存书签') + ' · ' + result.folder.path.join(' / ') + ($('#targetCard').value ? '，已加入自选卡片' : ''), 'success');
    } catch (error) { message(error.message || '保存失败，请重试。', 'error'); }
    finally { busy = false; syncControls(); }
  }

  async function createFolder() {
    if (busy || saved || !selectedId) return;
    busy = true; let created = false; syncControls();
    try {
      const folder = await GG.QuickBookmark.createFolder(selectedId, $('#newFolderName').value);
      selectedId = folder.id;
      await loadFolders();
      $('#folderSearch').value = '';
      $('#newFolderName').value = '';
      $('#newFolderPanel').classList.add('hidden');
      $('#toggleNewFolder').setAttribute('aria-expanded', 'false');
      revealFolder(folder.id);
      renderFolders({ scroll: true });
      message('已选中“' + folder.title + '”', 'success'); created = true;
    } catch (error) { message(error.message || '新建失败，请重试。', 'error'); }
    finally { busy = false; syncControls(); if (created) $('#folderSearch').focus(); }
  }

  function navigateFolders(event) {
    if (busy || saved || event.isComposing || event.keyCode === 229) return;
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.target === $('#folderSearch') && $('#folderSearch').value && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (!matches.length) return;
    const index = matches.findIndex((folder) => folder.id === selectedId);
    const focusTree = event.currentTarget === $('#folderList');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      selectFolder(matches[next].id, true, focusTree);
    } else if (!$('#folderSearch').value.trim()) {
      if (event.key === 'ArrowRight') {
        if (!children.get(selectedId)?.length) return;
        if (!expanded.has(selectedId)) toggleFolder(selectedId, focusTree);
        else selectFolder(children.get(selectedId)[0].id, true, focusTree);
      } else if (expanded.has(selectedId) && children.get(selectedId)?.length) toggleFolder(selectedId, focusTree);
      else if (byId.has(byId.get(selectedId)?.parentId)) selectFolder(byId.get(selectedId).parentId, true, focusTree);
    }
  }

  async function init() {
    $('#bookmarkForm').addEventListener('submit', save);
    $('#bookmarkUrl').addEventListener('input', () => showExisting({ locate: true }));
    $('#locateExisting').addEventListener('click', locateExisting);
    $('#folderSearch').addEventListener('input', () => renderFolders({ searchChanged: true, scroll: true }));
    $('#folderSearch').addEventListener('keydown', navigateFolders);
    $('#folderList').addEventListener('keydown', (event) => {
      if (event.target.closest('.folder-toggle')) return;
      navigateFolders(event);
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('#bookmarkForm').requestSubmit(); }
      if (event.key === ' ') event.preventDefault();
    });
    $('#bookmarkForm').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
    $('#toggleNewFolder').addEventListener('click', () => {
      const open = $('#newFolderPanel').classList.toggle('hidden') === false;
      $('#toggleNewFolder').setAttribute('aria-expanded', String(open));
      if (open) { if (!$('#newFolderName').value.trim()) $('#newFolderName').value = $('#folderSearch').value.trim(); $('#newFolderName').focus(); }
      syncControls();
    });
    $('#createFolder').addEventListener('click', createFolder);
    $('#newFolderName').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); createFolder(); } });
    $('#openHome').addEventListener('click', () => GG.api.tabs.create({ url: GG.api.runtime.getURL('pages/newtab/newtab.html') }));
    try {
      const [stored, tabs] = await Promise.all([GG.api.storage.get(['settings', 'apps', 'categories', GG.QuickBookmark.RECENTS_KEY]), GG.api.tabs.query({ active: true, currentWindow: true }), loadFolders()]);
      const settings = stored.settings || {};
      document.documentElement.dataset.theme = settings.theme || 'dark';
      if (/^#[\da-f]{6}$/i.test(settings.accentColor || '')) document.documentElement.style.setProperty('--accent', settings.accentColor);
      recents = Array.isArray(stored[GG.QuickBookmark.RECENTS_KEY]) ? stored[GG.QuickBookmark.RECENTS_KEY] : [];
      const current = tabs[0];
      if (current) {
        $('#bookmarkTitle').value = current.title || '';
        try { $('#bookmarkUrl').value = GG.QuickBookmark.validateUrl(current.url || ''); }
        catch (error) { message('当前页面无法自动收藏，请填写要保存的网址。'); }
      } else message('未能读取当前网页，请填写名称和网址。');
      selectedId = recents.find((id) => byId.has(id)) || folders.find((folder) => folder.folderType === 'bookmarks-bar' || folder.id === '1')?.id || folders[0]?.id || null;
      expanded = new Set(folders.filter((folder) => !byId.has(folder.parentId)).map((folder) => folder.id));
      revealFolder(selectedId);
      const cards = (stored.apps || []).filter(GG.CardBookmarks.isSelection);
      cards.forEach((app) => {
        const category = (stored.categories || []).find((item) => item.id === app.categoryId);
        const option = document.createElement('option'); option.value = app.id;
        option.textContent = (category ? category.name + ' / ' : '') + (app.title || '未命名卡片');
        $('#targetCard').appendChild(option);
      });
      $('#cardChoice').classList.toggle('hidden', !cards.length);
      ready = true; renderRecents(); renderFolders({ scroll: true }); showExisting({ locate: true, useTitle: true });
      if (!folders.length) message('没有可写入的书签文件夹。', 'error');
      $('#folderSearch').focus();
    } catch (error) { message('读取失败：' + error.message + '。请关闭面板后重试。', 'error'); }
    syncControls();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
