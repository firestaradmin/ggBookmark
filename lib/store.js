/* GG Bookmark - global default settings & shared helpers (Chrome) */

(function () {
  'use strict';
  const _root = (typeof window !== 'undefined' ? window : self);
  _root.GG = _root.GG || {};
  const GG = _root.GG;

  GG.VERSION = '1.0.0';

  GG.DEFAULTS = {
    backgroundImage: '',
    backgroundStyle: 'default', // default | custom-image | gradient
    backgroundBlur: 0,          // px applied to the bg image layer
    backgroundDim: 0.15,        // 0..1 dark overlay opacity on top of image
    cardCols: 3,                // 卡片固定列数（不随页面宽度变化）
    cardMinWidth: 320,          // 卡片最小宽度 (px)，页面放不下时出现横向滚动条
    glassBlur: 20,              // 磨砂玻璃模糊度 (px)，顶部工具栏/卡片/置顶行
    glassOpacity: 0.06,         // 磨砂玻璃背景透明度 (0~1)
    glassColor: '#ffffff',      // 磨砂玻璃背景主色（用户可选任意颜色）
    searchEngine: 'bing',
    showDescriptions: true,
    fontSize: 'medium',
    accentColor: '#4f7cff',
    compactAll: null,   // null = per-card auto, true/false = force all cards
    bookmarkImportFolder: '',   // default folder id to import bookmarks into; empty = prompt each time
    theme: 'dark',   // 'dark' | 'light'
    faviconSource: 'faviconsnap', // faviconsnap | google | duckduckgo | local  (local = 仅显示首字母，不请求网络)
    sync: {
      enabled: false,
      server: '',
      username: '',
      password: '',
      filename: 'ggbookmark-config.json',
      triggers: [],          // subset of: interval | settingsChange | bookmarkChange
      intervalMinutes: 30
    }
  };

  GG.SEARCH_ENGINES = {
    bing: { name: 'Bing',   url: 'https://www.bing.com/search?q={q}' },
    google: { name: 'Google', url: 'https://www.google.com/search?q={q}' },
    github: { name: 'GitHub', url: 'https://github.com/search?q={q}' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}' },
    sogou: { name: '搜狗',   url: 'https://www.sogou.com/web?query={q}' },
    baidu: { name: '百度',   url: 'https://www.baidu.com/s?wd={q}' },
  };

  /* Load settings, merged with defaults */
  GG.loadSettings = async function () {
    const stored = await GG.api.storage.get('settings');
    return Object.assign({}, GG.DEFAULTS, (stored && stored.settings) || {});
  };

  GG.saveSettings = async function (settings) {
    await GG.api.storage.set({ settings });
    return settings;
  };

  /* ---- Bookmark tree flattening helpers ---- */

  // Resolve a BookmarkTreeNode whether given as node or id
  GG.resolveNode = async function (nodeOrId) {
    if (typeof nodeOrId === 'string' || typeof nodeOrId === 'number') {
      const arr = await GG.api.bookmarks.get(String(nodeOrId));
      return arr && arr.length ? arr[0] : null;
    }
    return nodeOrId;
  };

  // Get immediate children (if any) of a folder
  GG.getChildren = async function (nodeOrId) {
    const node = await GG.resolveNode(nodeOrId);
    if (!node) return [];
    return GG.api.bookmarks.getChildren(node.id);
  };

  // Recursively collect all folder id -> {id,title} pairs under a node
  GG.flattenFolders = async function (nodeOrId) {
    const children = await GG.getChildren(nodeOrId);
    let folders = [];
    const walk = (list, parentId) => {
      list.forEach((item) => {
        if (item.type === 'folder') {
          folders.push({ id: item.id, title: item.title, parentId });
          walk(item.children || [], item.id);
        }
      });
    };
    walk(children || [], typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId);
    return folders;
  };

  // Find a bookmark (or folder) by its URL-ish key / exact title match
  GG.findBookmarkInFolder = async function (folderId, title, url) {
    const children = await GG.api.bookmarks.getChildren(folderId);
    const byUrl = (children || []).find((c) => c.url && c.url === url);
    if (byUrl) return byUrl;
    return (children || []).find((c) => c.title === title) || null;
  };

  /* ---- favicon 来源 ---- */
  // 可用来源：faviconsnap | google | duckduckgo | local(不请求网络，仅首字母)
  GG.FAVICON_SOURCES = {
    faviconsnap: 'FaviconSnap',
    google: 'Google',
    duckduckgo: 'DuckDuckGo',
    local: '本地首字母（不使用网络）'
  };
  function faviconHost(url) {
    try { return new URL(url).host; } catch (e) { return url || ''; }
  }
  function faviconFor(host, source) {
    if (source === 'faviconsnap') return 'https://faviconsnap.com/api/favicon?url=' + encodeURIComponent(host);
    if (source === 'google') return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    if (source === 'duckduckgo') return 'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico';
    return '';
  }
  GG.faviconUrl = function (url, source) {
    const host = faviconHost(url);
    source = source || (_root.__ggSettings && _root.__ggSettings.faviconSource) || GG.DEFAULTS.faviconSource;
    if (source === 'local' || !host) return '';
    return faviconFor(host, source);
  };
  GG.iconFor = function (url, source) {
    return { host: faviconHost(url), src: GG.faviconUrl(url, source) };
  };
})();
