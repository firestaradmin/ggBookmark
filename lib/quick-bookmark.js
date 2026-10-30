/* Native bookmark saving shared by the toolbar popup and its behavior tests. */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const GG = root.GG = root.GG || {};
  const RECENTS_KEY = 'quickBookmarkRecentFolders';

  function folders(tree) {
    const result = [];
    function count(node) { return (node.children || []).reduce((total, child) => total + (child.url ? 1 : count(child)), 0); }
    function walk(nodes, path, locked) {
      for (const node of nodes || []) {
        if (node.url) continue;
        const next = node.title ? path.concat(node.title) : path;
        const readOnly = locked || !!node.unmodifiable;
        // The invisible root cannot contain user bookmarks; managed trees are read-only.
        if (node.parentId != null && !readOnly) result.push({ ...node, path: next, bookmarkCount: count(node) });
        walk(node.children, next, readOnly);
      }
    }
    walk(tree, [], false);
    return result;
  }

  function sameUrl(a, b) {
    try { return new URL(a).href === new URL(b).href; } catch (error) { return a === b; }
  }

  function existingBookmarks(tree, url) {
    if (!url.trim()) return [];
    return GG.CardBookmarks.flatten(tree).filter((node) => sameUrl(node.url, url.trim()));
  }

  function orderedFolders(list, recentIds, query = '') {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const recents = new Map((Array.isArray(recentIds) ? recentIds : []).map((id, i) => [id, i]));
    return list.filter((folder) => terms.every((term) => folder.path.join(' / ').toLocaleLowerCase().includes(term)))
      .slice().sort((a, b) => (recents.get(a.id) ?? Infinity) - (recents.get(b.id) ?? Infinity));
  }

  function validateUrl(value) {
    const url = value.trim();
    let parsed;
    try { parsed = new URL(url); } catch (error) { throw new Error('请输入完整的网址，例如 https://example.com'); }
    if (!['http:', 'https:', 'ftp:', 'file:', 'chrome:', 'edge:'].includes(parsed.protocol)) {
      throw new Error('此类页面无法快捷收藏，请填写网页网址。');
    }
    return url;
  }

  async function createFolder(parentId, title) {
    title = title.trim();
    if (!title) throw new Error('请输入文件夹名称');
    const parent = folders(await GG.api.bookmarks.getTree()).find((item) => item.id === parentId);
    if (!parent) throw new Error('上级文件夹已不存在或不可写，请重新选择');
    const children = await GG.api.bookmarks.getChildren(parentId);
    return children.find((item) => !item.url && item.title === title && !item.unmodifiable)
      || GG.api.bookmarks.create({ parentId, title });
  }

  async function save({ title, url, folderId, cardId = '', bookmarkId = '' }) {
    url = validateUrl(url);
    title = title.trim() || url;
    const tree = await GG.api.bookmarks.getTree();
    const writable = folders(tree);
    const folder = writable.find((item) => item.id === folderId);
    if (!folder) throw new Error('保存文件夹已不存在或不可写，请重新选择');
    if (cardId) {
      const stored = await GG.api.storage.get('apps');
      if (!(stored.apps || []).some((app) => app.id === cardId && GG.CardBookmarks.isSelection(app))) {
        throw new Error('所选自选卡片已不存在或已更改，请重新选择');
      }
    }
    const existing = existingBookmarks(tree, url);
    // Reuse a copy already in the destination if legacy duplicates exist; never add another.
    let bookmark = existing.find((node) => node.parentId === folderId)
      || existing.find((node) => node.id === bookmarkId) || existing[0];
    const reused = !!bookmark;
    const warnings = [];
    let moved = false;
    if (bookmark) {
      if (bookmark.unmodifiable || !writable.some((item) => item.id === bookmark.parentId)) {
        throw new Error('该网页已在只读文件夹中收藏，无法修改或移动，也不会重复创建。');
      }
      if (bookmark.parentId !== folderId) {
        bookmark = await GG.api.bookmarks.move(bookmark.id, { parentId: folderId });
        moved = true;
      }
      if (bookmark.title !== title) {
        try { bookmark = await GG.api.bookmarks.update(bookmark.id, { title }); }
        catch (error) {
          if (!moved) throw error;
          warnings.push('书签已移动，但名称更新失败：' + error.message);
        }
      }
    } else bookmark = await GG.api.bookmarks.create({ parentId: folderId, title, url });

    // Native saving is already complete. Report subsequent failures without claiming it failed.
    if (cardId) {
      try {
        const stored = await GG.api.storage.get('apps');
        const app = (stored.apps || []).find((item) => item.id === cardId && GG.CardBookmarks.isSelection(item));
        if (!app) throw new Error('卡片已删除或更改');
        const node = { ...bookmark, folderPath: folder.path };
        const next = GG.CardBookmarks.place(app, node, null, false);
        // Saving an already-selected bookmark should retain the user's card order.
        if ((app.bookmarkRefs || []).some((ref) => ref.id === bookmark.id)) {
          next.bookmarkRefs = app.bookmarkRefs.map((ref) => ref.id === bookmark.id ? GG.CardBookmarks.reference(node) : ref);
        }
        await GG.api.storage.set({ apps: stored.apps.map((item) => item.id === cardId ? next : item) });
      } catch (error) { warnings.push('书签已保存，但未能加入自选卡片：' + error.message); }
    }
    try {
      const stored = await GG.api.storage.get(RECENTS_KEY);
      const recent = Array.isArray(stored[RECENTS_KEY]) ? stored[RECENTS_KEY] : [];
      await GG.api.storage.set({ [RECENTS_KEY]: [folderId, ...recent.filter((id) => id !== folderId)].slice(0, 6) });
    } catch (error) { warnings.push('书签已保存，但未能记住最近使用的文件夹。'); }
    return { bookmark, reused, moved, warnings, folder };
  }

  GG.QuickBookmark = { RECENTS_KEY, folders, orderedFolders, existingBookmarks, validateUrl, createFolder, save };
})();
