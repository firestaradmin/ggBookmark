/* GG Bookmark - 同步引擎（WebDAV）
 * 上传/下载的配置文件格式与导入导出完全一致。
 * 该模块在 background 与页面中均加载，因此可在无界面时通过 alarm 触发同步。
 */
(function () {
  'use strict';
  window.GG = window.GG || {};

  const SYNC_ALARM = 'gg-sync-interval';
  const PATH_SEP = '|||';

  // ---------- 书签快照 / 还原（与 settings.js 一致，独立实现以便后台运行） ----------
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
  async function snapshotBookmarks() {
    const roots = await browser.bookmarks.getTree();
    const containers = (roots[0] && roots[0].children) || [];
    const subs = [];
    for (const c of containers) {
      if (c.type !== 'folder') continue;
      subs.push({ node: c, containerId: c.id, path: [] });
    }
    return subs;
  }
  async function recreateBookmarks(trees, targetParentId) {
    const idToPath = new Map();
    const oldPathToId = new Map();
    (trees || []).forEach((sub) => indexBookmarkPaths(sub.node, [], oldPathToId, idToPath));
    const root = targetParentId || 'toolbar_____';
    const newPathToId = new Map();
    const childrenCache = new Map();
    async function getChildren(parentId) {
      if (!childrenCache.has(parentId)) {
        childrenCache.set(parentId, await browser.bookmarks.getChildren(parentId));
      }
      return childrenCache.get(parentId);
    }
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
          if (!f) f = await browser.bookmarks.create({ title: n.title, parentId, type: 'folder' });
          const p = parentPath.concat(n.title);
          newPathToId.set(p.join(PATH_SEP), f.id);
          if (n.children) await recreate(n.children, f.id, p);
        } else if (n.type === 'bookmark' && n.url) {
          if (!(await findExisting(parentId, n))) {
            await browser.bookmarks.create({ title: n.title || n.url, url: n.url, parentId });
          }
        }
      }
    }
    for (const sub of (trees || [])) {
      const node = sub.node;
      if (!node) continue;
      await recreate(node.children || [], root, []);
    }
    return { newPathToId, idToPath };
  }
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

  // ---------- 配置构建 / 应用（与导入导出格式一致） ----------
  async function buildConfig() {
    const stored = await browser.storage.local.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings']);
    const cfg = { version: GG.VERSION, settings: Object.assign({}, stored.settings || {}) };
    if (cfg.settings.backgroundImage && cfg.settings.backgroundImage.startsWith('data:')) {
      delete cfg.settings.backgroundImage;
    }
    cfg.apps = stored.apps || [];
    cfg.categories = stored.categories || [];
    cfg.orderByCat = stored.orderByCat || {};
    cfg.activeCat = stored.activeCat || null;
    try {
      const snaps = await snapshotBookmarks();
      cfg.bookmarks = snaps.map((s) => ({ node: s.node, containerId: s.containerId, path: s.path }));
    } catch (e) {
      cfg.bookmarks = null;
    }
    return cfg;
  }

  // 将下载到的配置应用到本地（与导入逻辑一致，但不再二次询问导入文件夹）
  async function applyConfig(imported) {
    const current = await browser.storage.local.get('settings');
    const currentBg = (current.settings || {}).backgroundImage || '';
    const importedSettings = Object.assign({}, GG.DEFAULTS, imported.settings || {});
    if (!importedSettings.backgroundImage) importedSettings.backgroundImage = currentBg;
    // 保留本地“书签导入文件夹”与主题，不被远程覆盖
    const savedImportFolder = (current.settings || {}).bookmarkImportFolder || '';
    if (!imported.settings || !imported.settings.bookmarkImportFolder) {
      importedSettings.bookmarkImportFolder = savedImportFolder;
    }
    const savedTheme = (current.settings || {}).theme || '';
    if (!imported.settings || !imported.settings.theme) {
      importedSettings.theme = savedTheme;
    }

    let apps = imported.apps || [];
    if (imported.bookmarks) {
      const target = importedSettings.bookmarkImportFolder || 'toolbar_____';
      const { newPathToId, idToPath } = await recreateBookmarks(imported.bookmarks, target);
      apps = remapFolderIds(apps, idToPath, newPathToId);
    }
    await browser.storage.local.set({
      settings: importedSettings,
      apps: apps,
      categories: imported.categories || [],
      orderByCat: imported.orderByCat || {},
      activeCat: imported.activeCat || null
    });
    return importedSettings;
  }

  // ---------- WebDAV 通信 ----------
  function getSyncCfg() {
    return browser.storage.local.get('settings').then((d) => {
      const s = Object.assign({}, GG.DEFAULTS, d.settings || {});
      return s.sync || GG.DEFAULTS.sync;
    });
  }
  function authHeader(cfg) {
    if (cfg.username) {
      const raw = cfg.username + ':' + (cfg.password || '');
      const b64 = (typeof btoa !== 'undefined'
        ? btoa(raw)
        : Buffer.from(raw).toString('base64'));
      return 'Basic ' + b64;
    }
    return '';
  }
  function resolveUrl(cfg) {
    let base = (cfg.server || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置同步服务器地址');
    if (!/^https?:\/\//i.test(base)) {
      throw new Error('服务器地址需以 http:// 或 https:// 开头');
    }
    return base + '/' + (cfg.filename || 'ggbookmark-config.json').replace(/^\/+/, '');
  }

  async function upload() {
    const cfg = await getSyncCfg();
    if (!cfg.enabled && !cfg.server) throw new Error('未配置同步');
    const url = resolveUrl(cfg);
    const data = await buildConfig();
    const body = JSON.stringify(data, null, 2);
    const headers = { 'Content-Type': 'application/json' };
    const auth = authHeader(cfg);
    if (auth) headers['Authorization'] = auth;
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) throw new Error('上传失败：' + res.status + ' ' + res.statusText);
    return true;
  }

  async function download() {
    const cfg = await getSyncCfg();
    if (!cfg.enabled && !cfg.server) throw new Error('未配置同步');
    const url = resolveUrl(cfg);
    const headers = {};
    const auth = authHeader(cfg);
    if (auth) headers['Authorization'] = auth;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error('下载失败：' + res.status + ' ' + res.statusText);
    const text = await res.text();
    const imported = JSON.parse(text);
    if (!imported || typeof imported !== 'object') throw new Error('配置文件无效');
    const applied = await applyConfig(imported);
    return applied;
  }

  // ---------- 定时任务 ----------
  async function scheduleAlarm() {
    await browser.alarms.clear(SYNC_ALARM);
    const cfg = await getSyncCfg();
    if (cfg.enabled && cfg.mode === 'interval' && Number(cfg.intervalMinutes) > 0) {
      await browser.alarms.create(SYNC_ALARM, { periodInMinutes: Number(cfg.intervalMinutes) });
    }
  }

  async function handleAlarm(name) {
    if (name !== SYNC_ALARM) return;
    const cfg = await getSyncCfg();
    if (!cfg.enabled || cfg.mode !== 'interval') return;
    try {
      await upload();
      browser.runtime.sendMessage({ type: 'gg-sync-log', ok: true, msg: '定时同步成功' }).catch(() => {});
    } catch (e) {
      browser.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: '定时同步失败：' + (e && e.message) }).catch(() => {});
    }
  }

  if (typeof browser !== 'undefined' && browser.alarms) {
    browser.alarms.onAlarm.addListener(handleAlarm);
  }

  // 测试连接：使用传入的同步配置（可由界面实时读取，无需先保存）
  async function testConnection(cfg) {
    const sync = Object.assign({}, GG.DEFAULTS.sync, cfg || {});
    const url = resolveUrl(sync);
    const headers = {};
    const auth = authHeader(sync);
    if (auth) headers['Authorization'] = auth;
    // 依次尝试 GET -> HEAD -> PROPFIND，只要有一次成功（含 404）即视为可达
    const attempts = [
      { method: 'GET' },
      { method: 'HEAD' },
      { method: 'PROPFIND', h: { Depth: '0' } }
    ];
    let lastErr = null;
    for (const a of attempts) {
      try {
        const res = await fetch(url, {
          method: a.method,
          headers: Object.assign({}, headers, a.h || {})
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error('鉴权失败（' + res.status + '），请检查用户名/密码');
        }
        if (res.status >= 200 && res.status < 500) return res.status;
        lastErr = new Error('服务器返回：' + res.status + ' ' + res.statusText);
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      if (/NetworkError|Failed to fetch|TypeError/i.test(lastErr.message || '')) {
        throw new Error('无法连接（' + url + '）。请确认地址可访问、协议为 http(s)，且扩展已获网络权限。');
      }
      throw lastErr;
    }
    throw new Error('连接失败');
  }

  GG.Sync = {
    buildConfig,
    applyConfig,
    upload,
    download,
    testConnection,
    scheduleAlarm,
    getSyncCfg,
    SYNC_ALARM
  };
})();
