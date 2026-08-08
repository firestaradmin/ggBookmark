/* GG Bookmark - 同步引擎（WebDAV）
 * 上传/下载的配置文件格式与导入导出完全一致。
 * 该模块在 background 与页面中均加载，因此可在无界面时通过 alarm 触发同步。
 */
(function () {
  'use strict';
  const _root = (typeof window !== 'undefined' ? window : self);
  _root.GG = _root.GG || {};
  const GG = _root.GG;

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
    const roots = await GG.api.bookmarks.getTree();
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
        childrenCache.set(parentId, await GG.api.bookmarks.getChildren(parentId));
      }
      return childrenCache.get(parentId);
    }
    async function findExisting(parentId, node) {
      const kids = await getChildren(parentId);
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
    const stored = await GG.api.storage.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings']);
    const cfg = { version: GG.VERSION, settings: Object.assign({}, (stored && stored.settings) || {}) };
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
    const current = await GG.api.storage.get('settings');
    const currentBg = (current && current.settings) ? current.settings.backgroundImage || '' : '';
    const importedSettings = Object.assign({}, GG.DEFAULTS, imported.settings || {});
    if (!importedSettings.backgroundImage) importedSettings.backgroundImage = currentBg;
    // 保留本地“书签导入文件夹”与主题，不被远程覆盖
    const savedImportFolder = (current && current.settings) ? current.settings.bookmarkImportFolder || '' : '';
    if (!imported.settings || !imported.settings.bookmarkImportFolder) {
      importedSettings.bookmarkImportFolder = savedImportFolder;
    }
    const savedTheme = (current && current.settings) ? current.settings.theme || '' : '';
    if (!imported.settings || !imported.settings.theme) {
      importedSettings.theme = savedTheme;
    }

    let apps = imported.apps || [];
    if (imported.bookmarks) {
      const target = importedSettings.bookmarkImportFolder || 'toolbar_____';
      const { newPathToId, idToPath } = await recreateBookmarks(imported.bookmarks, target);
      apps = remapFolderIds(apps, idToPath, newPathToId);
    }
    await GG.api.storage.set({
      settings: importedSettings,
      apps: apps,
      categories: imported.categories || [],
      orderByCat: imported.orderByCat || {},
      activeCat: imported.activeCat || null
    });
    return importedSettings;
  }

  // 兼容旧的 mode 字段（manual/interval/settingsChange/bookmarkChange），
  // 统一转换为 triggers 数组；同时保留手动按钮始终可用。
  function normalizeTriggers(sync) {
    const s = Object.assign({}, GG.DEFAULTS.sync, sync || {});
    let triggers = Array.isArray(s.triggers) ? s.triggers.slice() : [];
    if (triggers.length === 0 && s.mode) {
      if (s.mode === 'manual') triggers = [];
      else triggers = [s.mode];
    }
    triggers = triggers.filter((t) => ['interval', 'settingsChange', 'bookmarkChange'].includes(t));
    s.triggers = triggers;
    delete s.mode;
    return s;
  }

  // ---------- WebDAV 通信 ----------
  async function getSyncCfg() {
    const d = await GG.api.storage.get('settings');
    const s = Object.assign({}, GG.DEFAULTS, (d && d.settings) || {});
    return normalizeTriggers(s.sync || GG.DEFAULTS.sync);
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

  // ---------- 密码加密（AES-GCM） ----------
  // 用内置口令经 PBKDF2 派生 AES 密钥，加密后存入 storage，避免明文落盘。
  // 说明：密钥随扩展分发，防得住存储明文误读，但无法防御逆向攻击者；
  // 对个人书签扩展而言，这是「加密存储 + 便利」的最佳平衡。
  const ENC_PREFIX = 'enc:';
  const ENC_PASSPHRASE = 'ggbookmark-sync-v1';
  const ENC_SALT = 'ggbookmark-salt-v1';
  async function getCryptoKey() {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', enc.encode(ENC_PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(ENC_SALT), iterations: 100000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  async function encryptPassword(plain) {
    if (!plain) return '';
    try {
      const key = await getCryptoKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
      const b64 = (arr) => btoa(String.fromCharCode.apply(null, arr));
      return ENC_PREFIX + b64(iv) + ':' + b64(new Uint8Array(enc));
    } catch (e) {
      return plain; // 加密失败时回退为明文（不阻塞保存）
    }
  }
  async function decryptPassword(stored) {
    if (!stored) return '';
    if (!stored.startsWith(ENC_PREFIX)) return stored; // 兼容旧明文
    try {
      const [_, ivB64, dataB64] = stored.split(':');
      const key = await getCryptoKey();
      const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
      const data = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(dec);
    } catch (e) {
      return ''; // 解密失败（密钥变更等）返回空
    }
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
    const plainPwd = await decryptPassword(cfg.password);
    const auth = authHeader({ username: cfg.username, password: plainPwd });
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
    const plainPwd = await decryptPassword(cfg.password);
    const auth = authHeader({ username: cfg.username, password: plainPwd });
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
    await GG.api.alarms.clear(SYNC_ALARM);
    const cfg = await getSyncCfg();
    const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
    if (cfg.enabled && triggers.includes('interval') && Number(cfg.intervalMinutes) > 0) {
      await GG.api.alarms.create(SYNC_ALARM, { periodInMinutes: Number(cfg.intervalMinutes) });
    }
  }

  async function handleAlarm(alarm) {
    if (!alarm || alarm.name !== SYNC_ALARM) return;
    const cfg = await getSyncCfg();
    const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
    const base = { source: '定时同步', target: 'webdav', filename: cfg.filename || 'ggbookmark-config.json' };
    if (!cfg.enabled || !triggers.includes('interval')) {
      const m = '定时同步被跳过：未启用或定时触发未勾选';
      await log(Object.assign({}, base, { type: 'upload', ok: false, msg: m }));
      GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: m }).catch(() => {});
      return;
    }
    try {
      await upload();
      const m = '定时同步成功';
      await log(Object.assign({}, base, { type: 'upload', ok: true, msg: m }));
      GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: true, msg: m }).catch(() => {});
    } catch (e) {
      const m = '定时同步失败：' + (e && e.message);
      await log(Object.assign({}, base, { type: 'upload', ok: false, msg: m }));
      GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: m }).catch(() => {});
    }
  }

  // ---------- 书签变更触发同步（后台） ----------
  // 在 service worker 中监听书签增删改，触发「书签被修改时」上传，
  // 这样无需打开 newtab 页也能生效。用防抖合并批量操作。
  let bookmarkSyncTimer = null;
  async function handleBookmarkChange() {
    try {
      const cfg = await getSyncCfg();
      const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
      if (!cfg.enabled || !triggers.includes('bookmarkChange')) return;
      const filename = cfg.filename || 'ggbookmark-config.json';
      if (bookmarkSyncTimer) clearTimeout(bookmarkSyncTimer);
      bookmarkSyncTimer = setTimeout(async () => {
        bookmarkSyncTimer = null;
        const base = { source: '书签变更', target: 'webdav', filename };
        try {
          await upload();
          await log(Object.assign({}, base, { type: 'upload', ok: true, msg: '书签变更自动上传成功' }));
        } catch (e) {
          await log(Object.assign({}, base, { type: 'upload', ok: false, msg: '书签变更自动上传失败：' + (e && e.message) }));
        }
      }, 2000);
    } catch (e) { /* 忽略配置读取错误 */ }
  }

  // 仅在后台 service worker 上下文注册定时 alarm 监听，避免页面与后台双份触发
  // 造成重复上传。页面上下文（typeof window !== 'undefined'）不注册。
  const isBackground = (typeof window === 'undefined');
  if (isBackground && GG.api.alarms && GG.api.alarms.onAlarm) {
    GG.api.alarms.onAlarm.addListener(handleAlarm);
    // 后台启动/安装时重新登记定时同步，避免依赖标签页打开才调度
    if (GG.api.runtime.onStartup) {
      GG.api.runtime.onStartup.addListener(() => { scheduleAlarm().catch(() => {}); });
    }
    if (GG.api.runtime.onInstalled) {
      GG.api.runtime.onInstalled.addListener(() => { scheduleAlarm().catch(() => {}); });
    }
    // 后台监听书签变更，触发「书签被修改时」上传（不依赖页面打开）
    GG.api.bookmarks.onCreated.addListener(handleBookmarkChange);
    GG.api.bookmarks.onRemoved.addListener(handleBookmarkChange);
    GG.api.bookmarks.onMoved.addListener(handleBookmarkChange);
    GG.api.bookmarks.onChanged.addListener(handleBookmarkChange);
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

  // ---------- 同步日志 ----------
  const SYNC_LOG_KEY = 'syncLogs';
  const MAX_LOGS = 100;
  // 写入一条同步日志。
  // opts: { type: 'upload'|'download'|'test', source: 触发源, target: 'webdav'|'本地',
  //          filename: 文件名, ok: 是否成功, msg: 附加信息(如错误) }
  async function log(opts) {
    opts = opts || {};
    try {
      const data = await GG.api.storage.get(SYNC_LOG_KEY);
      const logs = Array.isArray(data && data[SYNC_LOG_KEY]) ? data[SYNC_LOG_KEY] : [];
      logs.push({
        time: Date.now(),
        type: opts.type || 'other',
        source: opts.source || '手动',
        target: opts.target || 'webdav',
        filename: opts.filename || '',
        ok: !!opts.ok,
        msg: opts.msg || ''
      });
      // 只保留最近 MAX_LOGS 条
      const trimmed = logs.slice(-MAX_LOGS);
      await GG.api.storage.set({ [SYNC_LOG_KEY]: trimmed });
      return trimmed;
    } catch (e) {
      return [];
    }
  }
  // 读取同步日志（最新的在前）
  async function getLogs() {
    try {
      const data = await GG.api.storage.get(SYNC_LOG_KEY);
      const logs = Array.isArray(data && data[SYNC_LOG_KEY]) ? data[SYNC_LOG_KEY] : [];
      return logs.slice().reverse();
    } catch (e) {
      return [];
    }
  }
  // 清空同步日志
  async function clearLogs() {
    try { await GG.api.storage.remove(SYNC_LOG_KEY); } catch (e) {}
  }

  GG.Sync = {
    buildConfig,
    applyConfig,
    upload,
    download,
    testConnection,
    scheduleAlarm,
    getSyncCfg,
    normalizeTriggers,
    log,
    getLogs,
    clearLogs,
    encryptPassword,
    decryptPassword,
    SYNC_ALARM
  };
})();
