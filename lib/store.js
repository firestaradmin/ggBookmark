/* GG Bookmark - global default settings & shared helpers */

window.GG = window.GG || {};

GG.VERSION = '1.0.0';

GG.DEFAULTS = {
  backgroundImage: '',
  backgroundStyle: 'default', // default | custom-image | gradient
  backgroundBlur: 0,          // px applied to the bg image layer
  backgroundDim: 0.35,        // 0..1 dark overlay opacity on top of image
  cardWidth: 320,             // global target column width for cards (px)
  searchEngine: 'bing',
  showDescriptions: true,
  fontSize: 'medium',
  accentColor: '#4f7cff',
  compactAll: null,   // null = per-card auto, true/false = force all cards
  bookmarkImportFolder: '',   // default folder id to import bookmarks into; empty = prompt each time
  theme: 'dark'   // 'dark' | 'light'
};

GG.SEARCH_ENGINES = {
  bing: { name: 'Bing',   url: 'https://www.bing.com/search?q={q}' },
  baidu: { name: '百度',   url: 'https://www.baidu.com/s?wd={q}' },
  google: { name: 'Google', url: 'https://www.google.com/search?q={q}' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}' },
  sogou: { name: '搜狗',   url: 'https://www.sogou.com/web?query={q}' },
  github: { name: 'GitHub', url: 'https://github.com/search?q={q}' }
};

/* Load settings, merged with defaults */
GG.loadSettings = async function () {
  const stored = await browser.storage.local.get('settings');
  return Object.assign({}, GG.DEFAULTS, stored.settings || {});
};

GG.saveSettings = async function (settings) {
  await browser.storage.local.set({ settings });
  return settings;
};

/* ---- Bookmark tree flattening helpers ---- */

// Resolve a BookmarkTreeNode whether given as node or id
GG.resolveNode = function (nodeOrId) {
  if (typeof nodeOrId === 'string' || typeof nodeOrId === 'number') {
    return browser.bookmarks.get(String(nodeOrId)).then(function (arr) {
      return arr && arr.length ? arr[0] : null;
    });
  }
  return Promise.resolve(nodeOrId);
};

// Get immediate children (if any) of a folder
GG.getChildren = function (nodeOrId) {
  return GG.resolveNode(nodeOrId).then(function (node) {
    if (!node) return [];
    return browser.bookmarks.getChildren(node.id);
  });
};

// Recursively collect all folder id -> {id,title} pairs under a node
GG.flattenFolders = function (nodeOrId) {
  return GG.getChildren(nodeOrId).then(function (children) {
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
  });
};

// Find a bookmark (or folder) by its URL-ish key / exact title match
GG.findBookmarkInFolder = function (folderId, title, url) {
  return browser.bookmarks.getChildren(folderId).then(function (children) {
    const byUrl = (children || []).find((c) => c.url && c.url === url);
    if (byUrl) return byUrl;
    return (children || []).find((c) => c.title === title) || null;
  });
};

/* ---- Visual favicon favicon service ---- */
GG.iconFor = function (url) {
  let host = '';
  try {
    host = new URL(url).host;
  } catch (e) {
    host = url;
  }
  return {
    host,
    src: 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64'
  };
};
