/* Shared GitHub release checks for the start page and manual update panel. */
(() => {
  'use strict';
  const CACHE_KEY = 'releaseUpdate';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const RELEASES_URL = 'https://github.com/firestaradmin/ggBookmark/releases';
  let pending = null;

  function normalizeVersion(value) {
    const match = typeof value === 'string' && value.match(/^v?(\d+(?:\.\d+){0,3})$/i);
    return match ? match[1] : '';
  }

  function compareVersions(a, b) {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (left[i] || 0) - (right[i] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  function releaseUrl(value) {
    try {
      const url = new URL(value);
      if (url.origin === 'https://github.com' && url.pathname.startsWith('/firestaradmin/ggBookmark/releases/')) return url.href;
    } catch (error) { /* Use the repository's release page for invalid URLs. */ }
    return RELEASES_URL;
  }

  function infoFromCache(cache) {
    if (!cache) return null;
    const version = normalizeVersion(cache.version);
    const current = normalizeVersion(GG.VERSION);
    if (!version || !current) return null;
    return {
      version,
      url: releaseUrl(cache.url),
      checkedAt: Number(cache.checkedAt) || 0,
      isNewer: compareVersions(version, current) > 0
    };
  }

  async function readCached() {
    const data = await GG.api.storage.get(CACHE_KEY);
    return infoFromCache(data[CACHE_KEY]);
  }

  function check({ force = false } = {}) {
    if (pending) return pending;
    pending = (async () => {
      const cached = await readCached();
      const age = cached ? Date.now() - cached.checkedAt : Infinity;
      if (!force && age >= 0 && age < CACHE_TTL) return cached;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('https://api.github.com/repos/firestaradmin/ggBookmark/releases/latest', { signal: controller.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const version = normalizeVersion(data.tag_name);
        if (!version) throw new Error('发布版本号无效');
        const cache = { version, url: releaseUrl(data.html_url), checkedAt: Date.now() };
        // 缓存失败不影响本次更新提示；检查失败则保留之前成功的缓存。
        try { await GG.api.storage.set({ [CACHE_KEY]: cache }); } catch (error) { /* Cache is optional. */ }
        return infoFromCache(cache);
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  GG.Updates = { cacheKey: CACHE_KEY, readCached, check };
})();
