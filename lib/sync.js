/* GG Bookmark - 同步引擎（WebDAV）
 * 上传/下载的配置文件格式与导入导出完全一致。
 * 该模块在 background 与页面中均加载，因此可在无界面时通过 alarm 触发同步。
 *
 * 同步策略：
 *  - direction: both（双向，默认）| up（仅上传）| down（仅下载）
 *  - 双向同步时先探测远端 HEAD（Last-Modified / Content-Length），结合本地记录的
 *    lastRemoteModified / lastLocalChangeAt / lastSyncAt 判定本地较新 / 远端较新 / 冲突。
 *  - 发生冲突或大幅覆盖（>20% 书签变更）时，自动同步一律跳过并在状态栏提示用户；
 *    手动同步可通过 resolve（'local'|'remote'）指定解决方向。
 */
(function () {
  'use strict';
  const _root = (typeof window !== 'undefined' ? window : self);
  _root.GG = _root.GG || {};
  const GG = _root.GG;

  const SYNC_ALARM = 'gg-sync-interval';
  const PATH_SEP = '|||';
  const SYNC_STATE_KEY = 'syncState';
  const VERSION_KEEP = 10;          // 版本化备份保留份数
  const CONFLICT_THRESHOLD = 0.2;   // 覆盖变更超过 20% 书签时需要用户确认
  // 恢复书签期间（applyConfig 重建书签树）为 true：此时大量 bookmarks.onCreated 会触发
  // handleBookmarkChange，其非原子的「读整个 settings -> 改 lastLocalChangeAt -> 写回」会
  // 与 applyConfig 正在写入的外观设置发生竞争，可能把刚下载的外观设置覆盖成旧值，
  // 导致首次同步后外观/壁纸等没有恢复。恢复期间置位以跳过这些写回。
  //
  // 注意：applyConfig 可能在页面上下文执行，而 handleBookmarkChange 只在后台 service worker
  // 执行，二者是不同脚本实例，模块变量无法跨上下文共享。因此用 storage.local 标志位。
  const RESTORING_KEY = 'gg-restoring-bookmarks';
  async function setRestoring(v) {
    try { await GG.api.storage.set({ [RESTORING_KEY]: v ? 1 : 0 }); } catch (e) { /* ignore */ }
  }
  async function isRestoring() {
    try {
      const d = await GG.api.storage.get(RESTORING_KEY);
      return !!(d && d[RESTORING_KEY]);
    } catch (e) { return false; }
  }

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
  // 快照整个浏览器的书签树（menu/toolbar/unfiled 三个容器及其全部子孙），用于完整备份与还原
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
  // 解析真实的“书签栏”根文件夹 id。
  // 注意：'toolbar_____' 是 Firefox 的固定 id，Chrome 中根容器 id 是数字（书签栏通常为 "1"）。
  // 因此不能硬编码，需从书签树中按标题匹配，找不到时回退到第一个文件夹容器。
  async function resolveToolbarId() {
    try {
      const roots = await GG.api.bookmarks.getTree();
      const containers = (roots[0] && roots[0].children) || [];
      const byTitle = containers.find((c) => c.type === 'folder' && /书签栏|Bookmarks bar|Bookmarks Toolbar/i.test(c.title || ''));
      if (byTitle) return byTitle.id;
      const first = containers.find((c) => c.type === 'folder');
      if (first) return first.id;
    } catch (e) { /* ignore */ }
    return '1'; // Chrome 书签栏根 id 兜底
  }
  async function recreateBookmarks(trees, targetParentId) {
    const idToPath = new Map();
    const oldPathToId = new Map();
    (trees || []).forEach((sub) => indexBookmarkPaths(sub.node, [], oldPathToId, idToPath));
    const root = targetParentId || await resolveToolbarId();
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

  // ---------- 书签统计 / 指纹 ----------
  // 统计配置中书签与文件夹数量（书签数 / 文件夹数）
  function countBookmarksInConfig(cfg) {
    let bookmarkCount = 0;
    let folderCount = 0;
    function walk(node) {
      ((node && node.children) || []).forEach((c) => {
        const isFolder = c.type ? c.type === 'folder' : !c.url;
        if (isFolder) { folderCount++; walk(c); }
        else if (c.url) { bookmarkCount++; }
      });
    }
    ((cfg && cfg.bookmarks) || []).forEach((sub) => {
      if (sub && sub.node) {
        folderCount++; // 容器本身也算文件夹
        walk(sub.node);
      }
    });
    return { bookmarkCount, folderCount };
  }
  // 基于全部书签 url+title 的确定性指纹，用于判断本地内容是否发生过变化
  function fingerprintConfig(cfg) {
    const items = [];
    function walk(node, prefix) {
      ((node && node.children) || []).forEach((c) => {
        const isFolder = c.type ? c.type === 'folder' : !c.url;
        if (isFolder) walk(c, prefix + '/' + (c.title || ''));
        else if (c.url) items.push(prefix + '\n' + (c.title || '') + '\n' + c.url);
      });
    }
    ((cfg && cfg.bookmarks) || []).forEach((sub) => { if (sub && sub.node) walk(sub.node, ''); });
    items.sort();
    const str = items.join('\x01');
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = (((h1 << 5) + h1) ^ c) >>> 0;
      h2 = (((h2 << 5) + h2) ^ c) >>> 0;
    }
    return items.length.toString(36) + '-' + h1.toString(36) + h2.toString(36);
  }

  // ---------- 配置构建 / 应用（与导入导出格式一致） ----------
  // includeBookmarks: false 时不包含书签内容（仅同步设置与卡片配置）
  async function buildConfig(opts) {
    const includeBookmarks = !opts || opts.includeBookmarks !== false;
    const stored = await GG.api.storage.get(['apps', 'categories', 'orderByCat', 'activeCat', 'settings', 'pinned']);
    const cfg = { version: GG.VERSION, settings: Object.assign({}, (stored && stored.settings) || {}) };
    // 同步引擎自身的状态字段不写入配置文件
    delete cfg.settings.lastSyncAt;
    delete cfg.settings.lastLocalChangeAt;
    delete cfg.settings.lastRemoteModified;
    delete cfg.settings.lastRemoteETag;
    delete cfg.settings.configVersion;
    delete cfg.settings.lastSyncedFingerprint;
    // 自定义壁纸图片数据不写入同步配置：data URL（旧版）或 blob: 引用（IndexedDB，跨设备不可解析）
    const bg = (cfg.settings.backgroundImage || '').trim();
    if (bg.startsWith('data:') || bg.startsWith('blob:')) {
      delete cfg.settings.backgroundImage;
    }
    cfg.apps = stored.apps || [];
    cfg.categories = stored.categories || [];
    cfg.orderByCat = stored.orderByCat || {};
    cfg.activeCat = stored.activeCat || null;
    cfg.pinned = stored.pinned || [];
    cfg.bookmarks = null;
    if (includeBookmarks) {
      try {
        const snaps = await snapshotBookmarks();
        cfg.bookmarks = snaps.map((s) => ({ node: s.node, containerId: s.containerId, path: s.path }));
      } catch (e) {
        cfg.bookmarks = null;
      }
    }
    // 配置元数据：书签统计 / 内容指纹 / 版本号 / 导出时间
    const stats = countBookmarksInConfig(cfg);
    cfg.bookmarkCount = stats.bookmarkCount;
    cfg.folderCount = stats.folderCount;
    cfg.bookmarkFingerprint = includeBookmarks ? fingerprintConfig(cfg) : '';
    cfg.configVersion = (includeBookmarks && cfg.bookmarks) ? Date.now() : 0;
    cfg.exportedAt = Date.now();
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
    // 同步设置（服务器 / 账号 / 密码 / 方向策略等）属于本机连接配置，不随远端配置覆盖；
    // 否则下载一次配置就会丢失本机的 WebDAV 连接信息，导致后续无法同步。
    const savedSync = (current && current.settings) ? current.settings.sync : null;
    if (savedSync && savedSync.server) {
      importedSettings.sync = savedSync;
    }

    let apps = imported.apps || [];
    if (imported.bookmarks) {
      // 目标文件夹 id 可能来自远端配置（旧电脑上的 id），在本机未必存在；
      // 若不存在则回退到真实的书签栏根 id，避免 getChildren/create 抛
      // "Can't find bookmark for id" / "Bookmark id is invalid"。
      let target = importedSettings.bookmarkImportFolder || '';
      if (target) {
        try {
          await GG.api.bookmarks.getChildren(target);
        } catch (e) {
          target = '';
        }
      }
      if (!target) target = await resolveToolbarId();
      // 重建书签会触发大量 onCreated，后台 handleBookmarkChange 若在此时写回 settings，
      // 可能与下方待写入的外观设置竞争而覆盖掉它。恢复期间置位以跳过该写回。
      await setRestoring(true);
      let remapped;
      try {
        const { newPathToId, idToPath } = await recreateBookmarks(imported.bookmarks, target);
        remapped = remapFolderIds(apps, idToPath, newPathToId);
      } finally {
        await setRestoring(false);
      }
      apps = remapped;
    }
    await GG.api.storage.set({
      settings: importedSettings,
      apps: apps,
      categories: imported.categories || [],
      orderByCat: imported.orderByCat || {},
      activeCat: imported.activeCat || null,
      pinned: Array.isArray(imported.pinned) ? imported.pinned : []
    });
    return importedSettings;
  }

  // 兼容旧的 mode 字段（manual/interval/settingsChange/bookmarkChange/startup），
  // 统一转换为 triggers 数组；同时保留手动按钮始终可用。
  function normalizeTriggers(sync) {
    const s = Object.assign({}, GG.DEFAULTS.sync, sync || {});
    let triggers = Array.isArray(s.triggers) ? s.triggers.slice() : [];
    if (triggers.length === 0 && s.mode) {
      if (s.mode === 'manual') triggers = [];
      else triggers = [s.mode];
    }
    triggers = triggers.filter((t) => ['interval', 'settingsChange', 'bookmarkChange', 'startup'].includes(t));
    s.triggers = triggers;
    if (!['both', 'up', 'down'].includes(s.direction)) s.direction = 'both';
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
      const parts = stored.split(':');
      const ivB64 = parts[1];
      const dataB64 = parts[2];
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
    const base = (cfg.server || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置同步服务器地址');
    if (!/^https?:\/\//i.test(base)) {
      throw new Error('服务器地址需以 http:// 或 https:// 开头');
    }
    return base + '/' + (cfg.filename || 'ggbookmark-config.json').replace(/^\/+/, '');
  }

  async function buildHeaders(cfg, extra) {
    const headers = Object.assign({}, extra || {});
    const plainPwd = await decryptPassword(cfg.password);
    const auth = authHeader({ username: cfg.username, password: plainPwd });
    if (auth) headers['Authorization'] = auth;
    return headers;
  }

  // ---------- 远端探测（HEAD / PROPFIND）----------
  // 返回 { lastModified(ms)|null, contentLength|Number|null, etag } ；文件不存在返回 null
  async function probeRemote(cfg) {
    const url = resolveUrl(cfg);
    const headers = await buildHeaders(cfg);
    try {
      const res = await fetch(url, { method: 'HEAD', headers });
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) {
        throw new Error('鉴权失败（' + res.status + '），请检查用户名/密码');
      }
      if (res.ok) {
        const lm = res.headers.get('Last-Modified');
        const cl = res.headers.get('Content-Length');
        return {
          lastModified: lm ? (new Date(lm).getTime() || null) : null,
          contentLength: cl ? Number(cl) : null,
          etag: res.headers.get('ETag') || null
        };
      }
    } catch (e) {
      if (e && /鉴权/.test(e.message || '')) throw e;
      // HEAD 不支持时降级到 PROPFIND
    }
    // PROPFIND Depth:0 兜底（部分 WebDAV 服务器禁用了 HEAD）
    try {
      const res = await fetch(url, { method: 'PROPFIND', headers: await buildHeaders(cfg, { Depth: '0' }) });
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) {
        throw new Error('鉴权失败（' + res.status + '），请检查用户名/密码');
      }
      if (!res.ok && res.status !== 207) return null;
      const text = await res.text();
      const lmMatch = text.match(/<[^>]*getlastmodified[^>]*>([^<]+)</i);
      const clMatch = text.match(/<[^>]*getcontentlength[^>]*>([^<]+)</i);
      const lm = lmMatch ? new Date(lmMatch[1]).getTime() : null;
      return {
        lastModified: lm || null,
        contentLength: clMatch ? Number(clMatch[1]) : null,
        etag: null
      };
    } catch (e) {
      if (e && /鉴权/.test(e.message || '')) throw e;
      return null; // 探测失败按“远端不存在”处理，保证首次上传可用
    }
  }

  async function fetchRemoteText(cfg) {
    const url = resolveUrl(cfg);
    const headers = await buildHeaders(cfg);
    const res = await fetch(url, { method: 'GET', headers });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      throw new Error('鉴权失败（' + res.status + '），请检查用户名/密码');
    }
    if (!res.ok) throw new Error('下载失败：' + res.status + ' ' + res.statusText);
    const lm = res.headers.get('Last-Modified');
    const text = await res.text();
    return { text, lastModified: lm ? (new Date(lm).getTime() || null) : null };
  }

  async function putRemote(url, body, cfg) {
    const headers = await buildHeaders(cfg, { 'Content-Type': 'application/json' });
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) throw new Error('上传失败：' + res.status + ' ' + res.statusText);
    return res;
  }

  // ---------- 版本化备份 ----------
  // 版本文件名：在基准文件名后追加时间戳，如 ggbookmark-config.20260809-153000.json
  function stampOf(date) {
    const d = date || new Date();
    const p = (n, w) => String(n).padStart(w || 2, '0');
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function splitFilename(filename) {
    const f = (filename || 'ggbookmark-config.json').replace(/^\/+/, '');
    const dot = f.lastIndexOf('.');
    if (dot > 0) return { base: f.slice(0, dot), ext: f.slice(dot) };
    return { base: f, ext: '' };
  }
  function versionFilename(cfg, date) {
    const parts = splitFilename(cfg.filename);
    return parts.base + '.' + stampOf(date) + parts.ext;
  }
  function isVersionFilename(cfg, name) {
    const parts = splitFilename(cfg.filename);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^' + esc(parts.base) + '\\.(\\d{8}-\\d{6})' + esc(parts.ext) + '$');
    const m = re.exec(name || '');
    if (!m) return null;
    const s = m[1];
    const time = new Date(
      Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)),
      Number(s.slice(9, 11)), Number(s.slice(11, 13)), Number(s.slice(13, 15))
    ).getTime();
    return { stamp: s, time: time || 0 };
  }
  // 用 PROPFIND 列出服务器目录下全部版本备份（按时间倒序）
  async function listVersions(cfg) {
    cfg = cfg || await getSyncCfg();
    const base = (cfg.server || '').trim().replace(/\/+$/, '');
    if (!base) return [];
    const headers = await buildHeaders(cfg, { Depth: '1' });
    let res;
    try {
      res = await fetch(base + '/', { method: 'PROPFIND', headers });
    } catch (e) {
      throw new Error('无法列出服务器目录：' + (e && e.message));
    }
    if (res.status === 401 || res.status === 403) throw new Error('鉴权失败（' + res.status + '）');
    if (!res.ok && res.status !== 207) throw new Error('列目录失败：' + res.status + ' ' + res.statusText);
    const text = await res.text();
    const versions = [];
    // 逐个 <D:response> 解析 href / getlastmodified / getcontentlength
    const blocks = text.split(/<\/?[^>]*response[^>]*>/i).filter((b) => /href/i.test(b));
    for (const b of blocks) {
      const hrefM = b.match(/<[^>]*href[^>]*>([^<]+)</i);
      if (!hrefM) continue;
      let href = '';
      try { href = decodeURIComponent(hrefM[1]); } catch (e) { href = hrefM[1]; }
      const name = href.replace(/\/+$/, '').split('/').pop();
      const v = isVersionFilename(cfg, name);
      if (!v) continue;
      const lmM = b.match(/<[^>]*getlastmodified[^>]*>([^<]+)</i);
      const clM = b.match(/<[^>]*getcontentlength[^>]*>([^<]+)</i);
      versions.push({
        name,
        time: v.time,
        stamp: v.stamp,
        lastModified: lmM ? (new Date(lmM[1]).getTime() || null) : null,
        size: clM ? Number(clM[1]) : null,
        bookmarkCount: null,
        folderCount: null
      });
    }
    versions.sort((a, b) => b.time - a.time);
    return versions;
  }
  // 上传版本快照并清理旧版本（保留最近 VERSION_KEEP 份）
  async function uploadVersionSnapshot(cfg, body) {
    const name = versionFilename(cfg, new Date());
    const base = (cfg.server || '').trim().replace(/\/+$/, '');
    const url = base + '/' + name;
    await putRemote(url, body, cfg);
    try {
      const versions = await listVersions(cfg);
      const extras = versions.slice(VERSION_KEEP);
      for (const v of extras) {
        try {
          await fetch(base + '/' + encodeURIComponent(v.name).replace(/%2F/g, '/'), {
            method: 'DELETE',
            headers: await buildHeaders(cfg)
          });
        } catch (e) { /* 单个删除失败忽略 */ }
      }
      return { name, pruned: extras.length };
    } catch (e) {
      return { name, pruned: 0 }; // 清理失败不影响主流程
    }
  }
  // 下载指定版本文件的内容（不应用）；cfg 可省略（自动读取当前同步配置）
  async function downloadVersion(cfg, name) {
    cfg = cfg || await getSyncCfg();
    const base = (cfg.server || '').trim().replace(/\/+$/, '');
    const url = base + '/' + encodeURIComponent(name).replace(/%2F/g, '/');
    const headers = await buildHeaders(cfg);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error('下载失败：' + res.status + ' ' + res.statusText);
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('配置文件无效');
    return parsed;
  }

  // ---------- 同步状态（用于设置页显示与冲突判定） ----------
  async function getSyncState() {
    try {
      const d = await GG.api.storage.get(SYNC_STATE_KEY);
      return (d && d[SYNC_STATE_KEY]) || {};
    } catch (e) {
      return {};
    }
  }
  async function setSyncState(patch) {
    try {
      const cur = await getSyncState();
      const next = Object.assign({}, cur, patch || {});
      await GG.api.storage.set({ [SYNC_STATE_KEY]: next });
      return next;
    } catch (e) {
      return {};
    }
  }

  // 读取 settings 中的同步元数据字段（lastSyncAt / lastRemoteModified / configVersion / lastLocalChangeAt）
  async function getLocalMeta() {
    const d = await GG.api.storage.get('settings');
    const s = (d && d.settings) || {};
    return {
      lastSyncAt: s.lastSyncAt || 0,
      lastLocalChangeAt: s.lastLocalChangeAt || 0,
      lastRemoteModified: s.lastRemoteModified || 0,
      configVersion: s.configVersion || 0,
      lastSyncedFingerprint: s.lastSyncedFingerprint || '',
      settings: s
    };
  }
  async function patchSettingsMeta(patch) {
    const d = await GG.api.storage.get('settings');
    const s = Object.assign({}, (d && d.settings) || {});
    Object.assign(s, patch);
    await GG.api.storage.set({ settings: s });
  }

  // 本地内容是否与上次同步时不同（用于判断“本地是否改过”）。
  // 需同时考虑：书签指纹变化（书签增删改）与设置保存（lastLocalChangeAt 更新）。
  // 任一新于上次同步即视为本地较新。
  async function localHasChanged(meta) {
    if (!meta || !meta.lastSyncAt) return true; // 从未同步过，视为有内容可上传
    // 设置保存会更新 lastLocalChangeAt：若它新于上次同步，说明设置被改过
    if ((meta.lastLocalChangeAt || 0) > (meta.lastSyncAt || 0)) return true;
    const cfg = await getSyncCfg();
    if (cfg.syncBookmarks === false) {
      return false; // 不同步书签且设置未变
    }
    // 书签指纹变化（书签增删改）也算本地变化
    try {
      const localCfg = await buildConfig({ includeBookmarks: true });
      if (meta.lastSyncedFingerprint) {
        return localCfg.bookmarkFingerprint !== meta.lastSyncedFingerprint;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  // ---------- 远端配置差异分析（冲突 / 大幅变更提示） ----------
  function collectUrlSet(cfg) {
    const set = new Set();
    function walk(node) {
      ((node && node.children) || []).forEach((c) => {
        const isFolder = c.type ? c.type === 'folder' : !c.url;
        if (isFolder) walk(c);
        else if (c.url) set.add(c.url);
      });
    }
    ((cfg && cfg.bookmarks) || []).forEach((s) => { if (s && s.node) walk(s.node); });
    return set;
  }
  // 计算远端配置覆盖本地时书签的变化幅度（新增+删除占本地比例）
  async function diffRemote(remoteCfg) {
    const localCfg = await buildConfig({ includeBookmarks: true });
    const localSet = collectUrlSet(localCfg);
    const remoteSet = collectUrlSet(remoteCfg);
    let added = 0, removed = 0;
    remoteSet.forEach((u) => { if (!localSet.has(u)) added++; });
    localSet.forEach((u) => { if (!remoteSet.has(u)) removed++; });
    const total = localSet.size;
    const ratio = total > 0 ? (added + removed) / total : (remoteSet.size > 0 ? 1 : 0);
    return {
      added, removed,
      localCount: localSet.size,
      remoteCount: remoteSet.size,
      ratio,
      big: ratio > CONFLICT_THRESHOLD
    };
  }

  // ---------- 状态判定：本地较新 / 远端较新 / 已同步 / 冲突 / 无远端 ----------
  // 返回值: { status, remoteMeta, localMeta }
  // status: 'no-remote' | 'in-sync' | 'local-newer' | 'remote-newer' | 'conflict'
  async function assessState(cfg) {
    cfg = cfg || await getSyncCfg();
    const meta = await getLocalMeta();
    const remote = await probeRemote(cfg);
    if (!remote) {
      return { status: 'no-remote', remoteMeta: null, localMeta: meta };
    }
    const remoteTs = remote.lastModified || 0;
    const syncedTs = meta.lastRemoteModified || 0;
    // 允许 2s 时钟误差
    const SKEW = 2000;
    const remoteChanged = !syncedTs || !remoteTs || (remoteTs - syncedTs > SKEW);
    // 从未同步过（本机首次接入，无本地同步点）且远端已有配置：
    // 本地没有可依据的基线，直接视为远端较新，应下载远端配置，
    // 而不是把“从未同步”误判为本地有改动而进入冲突。
    if (!meta.lastSyncAt && remote) {
      return { status: 'remote-newer', remoteMeta: remote, localMeta: meta };
    }
    const localChanged = await localHasChanged(meta);

    if (!remoteChanged && !localChanged) {
      return { status: 'in-sync', remoteMeta: remote, localMeta: meta };
    }
    if (remoteChanged && localChanged) {
      return { status: 'conflict', remoteMeta: remote, localMeta: meta };
    }
    if (remoteChanged) {
      return { status: 'remote-newer', remoteMeta: remote, localMeta: meta };
    }
    return { status: 'local-newer', remoteMeta: remote, localMeta: meta };
  }

  // ---------- 上传 / 下载（含元数据维护与版本化备份） ----------
  async function doUpload(cfg) {
    cfg = cfg || await getSyncCfg();
    if (!cfg.server) throw new Error('未配置同步');
    const includeBookmarks = cfg.syncBookmarks !== false;
    const data = await buildConfig({ includeBookmarks });
    const body = JSON.stringify(data, null, 2);
    await putRemote(resolveUrl(cfg), body, cfg);
    // 版本化备份：保留最近 N 份带时间戳的快照
    let versionInfo = null;
    if (cfg.versionedBackup) {
      try { versionInfo = await uploadVersionSnapshot(cfg, body); } catch (e) { /* 版本备份失败不阻塞主上传 */ }
    }
    // 上传成功后记录远端时间戳与本地同步点
    let remoteMeta = null;
    try { remoteMeta = await probeRemote(cfg); } catch (e) { /* ignore */ }
    const now = Date.now();
    await patchSettingsMeta({
      lastSyncAt: now,
      lastSyncedFingerprint: data.bookmarkFingerprint || '',
      lastRemoteModified: remoteMeta && remoteMeta.lastModified ? remoteMeta.lastModified : now,
      configVersion: data.configVersion || 0,
      // 上传成功后重置本地变更点，与 lastSyncAt 对齐——本地改动已全部同步。
      // 这同时避免同毫秒时间戳导致 lastLocalChangeAt == lastSyncAt 误判为 in-sync。
      lastLocalChangeAt: now
    });
    await setSyncState({
      lastSuccessAt: now,
      lastDirection: 'upload',
      lastError: '',
      conflict: null
    });
    return { versionInfo, bookmarkCount: data.bookmarkCount };
  }

  async function doDownload(cfg) {
    cfg = cfg || await getSyncCfg();
    if (!cfg.server) throw new Error('未配置同步');
    const res = await fetchRemoteText(cfg);
    if (!res) throw new Error('远端没有配置文件（404）');
    let imported;
    try {
      imported = JSON.parse(res.text);
    } catch (e) {
      throw new Error('远端配置文件不是有效的 JSON');
    }
    if (!imported || typeof imported !== 'object') throw new Error('配置文件无效');
    // 先保留本地同步元数据（applyConfig 会整体覆盖 settings），应用后再修补回来
    const applied = await applyConfig(imported);
    const now = Date.now();
    // 下载应用后：lastLocalChangeAt 重置为 lastSyncAt，表示本地内容与远端已一致，
    // 避免刚下载完又因「本地较新」而立刻回传，形成连锁同步。
    await patchSettingsMeta({
      lastSyncAt: now,
      lastSyncedFingerprint: imported.bookmarkFingerprint || '',
      lastRemoteModified: res.lastModified || now,
      configVersion: imported.configVersion || 0,
      lastLocalChangeAt: now
    });
    await setSyncState({
      lastSuccessAt: now,
      lastDirection: 'download',
      lastError: '',
      conflict: null
    });
    return applied;
  }

  // 兼容旧接口：纯上传 / 纯下载（手动按钮使用）
  async function upload() { return doUpload(); }
  async function download() { return doDownload(); }

  // 冲突信息构建（供手动/自动同步共用）
  async function buildConflictInfo(remoteMeta) {
    const cfg = await getSyncCfg();
    const remoteRes = await fetchRemoteText(cfg);
    let remoteCfg = null;
    if (remoteRes) {
      try { remoteCfg = JSON.parse(remoteRes.text); } catch (e) { remoteCfg = null; }
    }
    let diff = null;
    if (remoteCfg && remoteCfg.bookmarks) {
      try { diff = await diffRemote(remoteCfg); } catch (e) { diff = null; }
    }
    let localCfg = null;
    try { localCfg = await buildConfig({ includeBookmarks: true }); } catch (e) { /* ignore */ }
    return {
      remoteLastModified: (remoteMeta && remoteMeta.lastModified) || (remoteRes && remoteRes.lastModified) || 0,
      remoteContentLength: remoteMeta && remoteMeta.contentLength,
      remoteBookmarkCount: remoteCfg ? (remoteCfg.bookmarkCount != null ? remoteCfg.bookmarkCount : countBookmarksInConfig(remoteCfg).bookmarkCount) : null,
      remoteFolderCount: remoteCfg ? (remoteCfg.folderCount != null ? remoteCfg.folderCount : countBookmarksInConfig(remoteCfg).folderCount) : null,
      remoteConfigVersion: remoteCfg ? (remoteCfg.configVersion || 0) : 0,
      remoteExportedAt: remoteCfg ? (remoteCfg.exportedAt || 0) : 0,
      localBookmarkCount: localCfg ? localCfg.bookmarkCount : null,
      localFolderCount: localCfg ? localCfg.folderCount : null,
      diff
    };
  }

  // ---------- 智能同步（自动触发与手动“立即同步”的统一入口） ----------
  // opts.source: 触发源（日志用）  opts.resolve: 'local' | 'remote'（手动解决冲突/大幅变更）
  // 返回 { action, ... }；action: uploaded | downloaded | in-sync | conflict | big-change
  async function smartSync(opts) {
    opts = opts || {};
    const cfg = await getSyncCfg();
    if (!cfg.server) throw new Error('未配置同步服务器地址');
    const direction = cfg.direction || 'both';

    if (direction === 'up') {
      const r = await doUpload(cfg);
      return Object.assign({ action: 'uploaded' }, r);
    }
    if (direction === 'down') {
      const applied = await doDownload(cfg);
      return { action: 'downloaded', applied };
    }

    // 双向：先探测远端状态
    const state = await assessState(cfg);
    if (state.status === 'no-remote') {
      const r = await doUpload(cfg);
      return Object.assign({ action: 'uploaded', firstTime: true }, r);
    }
    if (state.status === 'in-sync') {
      const now = Date.now();
      await setSyncState({ lastCheckAt: now, lastError: '', conflict: null });
      return { action: 'in-sync' };
    }
    if (state.status === 'local-newer') {
      const r = await doUpload(cfg);
      return Object.assign({ action: 'uploaded' }, r);
    }
    if (state.status === 'remote-newer') {
      // 首次同步（本机从未同步过）：本地没有可恢复的数据，直接下载远端配置，
      // 跳过“大幅覆盖”确认——此时本地通常为空，变化必然 >20%，不应阻断下载，
      // 否则外观/设置等无法在首次同步时恢复。
      const neverSynced = !state.localMeta.lastSyncAt;
      if (neverSynced) {
        const applied = await doDownload(cfg);
        return { action: 'downloaded', applied, firstDownload: true };
      }
      // 远端较新：检查是否大幅覆盖（>20% 书签变化）
      let info = null;
      try { info = await buildConflictInfo(state.remoteMeta); } catch (e) { /* ignore */ }
      // 本地几乎没有任何书签（新电脑 / 尚未导入真实数据）时，同样不因“大幅覆盖”而阻断下载，
      // 否则首次接入时外观/壁纸/设置等会因 >20% 变化被跳过，无法一并恢复。
      const localIsBare = info && info.diff && (info.diff.localCount || 0) <= 1;
      if (info && info.diff && info.diff.big && opts.resolve !== 'remote' && !localIsBare) {
        const conflict = {
          type: 'big-change',
          time: Date.now(),
          remoteLastModified: info.remoteLastModified,
          remoteBookmarkCount: info.remoteBookmarkCount,
          localBookmarkCount: info.localBookmarkCount,
          diff: {
            added: info.diff.added, removed: info.diff.removed,
            ratio: info.diff.ratio, localCount: info.diff.localCount, remoteCount: info.diff.remoteCount
          }
        };
        await setSyncState({ lastCheckAt: Date.now(), conflict });
        return { action: 'big-change', info: conflict };
      }
      const applied = await doDownload(cfg);
      return { action: 'downloaded', applied };
    }
    // conflict：本地与远端都改过
    if (opts.resolve === 'local') {
      const r = await doUpload(cfg);
      return Object.assign({ action: 'uploaded', resolved: true }, r);
    }
    if (opts.resolve === 'remote') {
      const applied = await doDownload(cfg);
      return { action: 'downloaded', applied, resolved: true };
    }
    let info = null;
    try { info = await buildConflictInfo(state.remoteMeta); } catch (e) { /* ignore */ }
    const conflict = {
      type: 'conflict',
      time: Date.now(),
      remoteLastModified: (info && info.remoteLastModified) || (state.remoteMeta && state.remoteMeta.lastModified) || 0,
      remoteBookmarkCount: info && info.remoteBookmarkCount,
      localBookmarkCount: info && info.localBookmarkCount,
      diff: info && info.diff ? {
        added: info.diff.added, removed: info.diff.removed,
        ratio: info.diff.ratio, localCount: info.diff.localCount, remoteCount: info.diff.remoteCount
      } : null
    };
    await setSyncState({ lastCheckAt: Date.now(), conflict });
    return { action: 'conflict', info: conflict };
  }

  // 手动解决冲突 / 确认大幅变更后继续：resolve = 'local'（上传本地）| 'remote'（下载远端）
  async function resolveConflict(resolve) {
    const r = await smartSync({ resolve });
    return r;
  }

  // 设置页「检查同步状态」：返回当前本地/远端关系与远端信息
  async function checkStatus() {
    const cfg = await getSyncCfg();
    if (!cfg.server) return { status: 'no-server' };
    const state = await assessState(cfg);
    const out = {
      status: state.status,
      remoteMeta: state.remoteMeta,
      localMeta: {
        lastSyncAt: state.localMeta.lastSyncAt,
        lastLocalChangeAt: state.localMeta.lastLocalChangeAt,
        lastRemoteModified: state.localMeta.lastRemoteModified,
        configVersion: state.localMeta.configVersion
      }
    };
    if (state.status === 'conflict' || state.status === 'remote-newer') {
      try { out.info = await buildConflictInfo(state.remoteMeta); } catch (e) { /* ignore */ }
    }
    return out;
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

  // 自动同步（后台统一入口）：执行智能同步并记录日志，必要时通过消息提示用户
  async function autoSync(source) {
    const cfg = await getSyncCfg();
    const base = { source: source || '自动同步', target: 'webdav', filename: cfg.filename || 'ggbookmark-config.json' };
    try {
      const r = await smartSync({ source });
      if (r.action === 'uploaded') {
        const m = (source || '自动同步') + '：已上传到服务器';
        await log(Object.assign({}, base, { type: 'upload', ok: true, msg: m }));
        GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: true, msg: m }).catch(() => {});
      } else if (r.action === 'downloaded') {
        const m = (source || '自动同步') + '：远端较新，已下载并应用';
        await log(Object.assign({}, base, { type: 'download', ok: true, msg: m }));
        GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: true, msg: m }).catch(() => {});
        GG.api.runtime.sendMessage({ type: 'gg-config-imported' }).catch(() => {});
      } else if (r.action === 'in-sync') {
        await log(Object.assign({}, base, { type: 'other', ok: true, msg: (source || '自动同步') + '：本地与远端已是最新' }));
      } else if (r.action === 'conflict' || r.action === 'big-change') {
        const m = (source || '自动同步') + '：检测到' + (r.action === 'conflict' ? '本地与远端均有修改（冲突）' : '远端变更较大（超过 20%）') + '，请到设置页选择处理方式';
        await log(Object.assign({}, base, { type: 'other', ok: false, msg: m }));
        GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: m }).catch(() => {});
      }
      return r;
    } catch (e) {
      const m = (source || '自动同步') + '失败：' + (e && e.message);
      await log(Object.assign({}, base, { type: 'upload', ok: false, msg: m }));
      await setSyncState({ lastError: m, lastCheckAt: Date.now() }).catch(() => {});
      GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: m }).catch(() => {});
      throw e;
    }
  }

  async function handleAlarm(alarm) {
    if (!alarm || alarm.name !== SYNC_ALARM) return;
    const cfg = await getSyncCfg();
    const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
    if (!cfg.enabled || !triggers.includes('interval')) {
      const m = '定时同步被跳过：未启用或定时触发未勾选';
      await log({ type: 'other', source: '定时同步', target: 'webdav', filename: cfg.filename || 'ggbookmark-config.json', ok: false, msg: m });
      GG.api.runtime.sendMessage({ type: 'gg-sync-log', ok: false, msg: m }).catch(() => {});
      return;
    }
    await autoSync('定时同步').catch(() => {});
  }

  // ---------- 书签变更触发同步（后台） ----------
  // 在 service worker 中监听书签增删改，触发「书签被修改时」同步，
  // 这样无需打开 newtab 页也能生效。用防抖合并批量操作。
  let bookmarkSyncTimer = null;
  async function handleBookmarkChange() {
    try {
      // 恢复书签期间由 applyConfig 触发的批量 onCreated，不应被当作“用户改了书签”。
      // 此时跳过 lastLocalChangeAt 写回与触发同步，避免与正在写入的外观设置竞争覆盖。
      if (await isRestoring()) return;
      // 记录本地变更时间点，供冲突判定使用；确保严格大于上次同步点，避免同毫秒误判
      const meta = await getLocalMeta();
      await patchSettingsMeta({ lastLocalChangeAt: Math.max(Date.now(), (meta.lastSyncAt || 0) + 1) });
      const cfg = await getSyncCfg();
      const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
      if (!cfg.enabled || !triggers.includes('bookmarkChange')) return;
      if (bookmarkSyncTimer) clearTimeout(bookmarkSyncTimer);
      bookmarkSyncTimer = setTimeout(async () => {
        bookmarkSyncTimer = null;
        await autoSync('书签变更').catch(() => {});
      }, 30000); // 书签变更后延迟 再同步，避免频繁操作刷屏
    } catch (e) { /* 忽略配置读取错误 */ }
  }

  // ---------- 浏览器启动触发同步（后台） ----------
  async function handleStartup() {
    try {
      const cfg = await getSyncCfg();
      const triggers = Array.isArray(cfg.triggers) ? cfg.triggers : [];
      if (!cfg.enabled || !triggers.includes('startup')) return;
      await autoSync('浏览器启动').catch(() => {});
    } catch (e) { /* 忽略配置读取错误 */ }
  }

  // 仅在后台 service worker 上下文注册定时 alarm 监听，避免页面与后台双份触发
  // 造成重复同步。页面上下文（typeof window !== 'undefined'）不注册。
  const isBackground = (typeof window === 'undefined');
  if (isBackground && GG.api.alarms && GG.api.alarms.onAlarm) {
    GG.api.alarms.onAlarm.addListener(handleAlarm);
    // 后台启动/安装时重新登记定时同步，避免依赖标签页打开才调度
    if (GG.api.runtime.onStartup) {
      GG.api.runtime.onStartup.addListener(() => { scheduleAlarm().catch(() => {}); handleStartup().catch(() => {}); });
    }
    if (GG.api.runtime.onInstalled) {
      GG.api.runtime.onInstalled.addListener(() => { scheduleAlarm().catch(() => {}); });
    }
    // 后台监听书签变更，触发「书签被修改时」同步（不依赖页面打开）
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
  // opts: { type: 'upload'|'download'|'test'|'other', source: 触发源, target: 'webdav'|'本地',
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
    smartSync,
    resolveConflict,
    checkStatus,
    probeRemote,
    assessState,
    getSyncState,
    setSyncState,
    listVersions,
    downloadVersion,
    countBookmarksInConfig,
    fingerprintConfig,
    testConnection,
    scheduleAlarm,
    getSyncCfg,
    normalizeTriggers,
    log,
    getLogs,
    clearLogs,
    encryptPassword,
    decryptPassword,
    SYNC_ALARM,
    SYNC_STATE_KEY,
    CONFLICT_THRESHOLD
  };
})();
