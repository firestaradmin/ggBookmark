const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../lib/updates.js'), 'utf8');
const releaseUrl = 'https://github.com/firestaradmin/ggBookmark/releases/tag/v1.9.0';

function setup({ current = '1.8.0', latest = 'v1.9.0', cache, failure } = {}) {
  const stored = { releaseUpdate: cache };
  let requests = 0;
  const GG = {
    VERSION: current,
    api: { storage: {
      get: async () => structuredClone(stored),
      set: async (value) => Object.assign(stored, structuredClone(value))
    } }
  };
  vm.runInNewContext(source, {
    GG, URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => {
      requests++;
      if (failure) throw new Error('offline');
      return { ok: true, json: async () => ({ tag_name: latest, html_url: releaseUrl }) };
    }
  });
  return { updates: GG.Updates, requests: () => requests, stored };
}

test('detects a newer release and caches its update link', async () => {
  const app = setup();
  const result = await app.updates.check();
  assert.equal(result.isNewer, true);
  assert.equal(result.version, '1.9.0');
  assert.equal(result.url, releaseUrl);
  await app.updates.check();
  assert.equal(app.requests(), 1);
});

test('does not announce equal or older releases; compares numeric version parts', async () => {
  for (const [current, latest, newer] of [
    ['1.8.0', 'v1.8.0', false],
    ['1.8.0', 'v1.7.3', false],
    ['1.9.9', 'v1.10.0', true]
  ]) {
    assert.equal((await setup({ current, latest }).updates.check()).isNewer, newer);
  }
});

test('rechecks cached releases against the installed version after upgrading', async () => {
  const app = setup({ current: '1.9.0', cache: { version: '1.9.0', url: releaseUrl, checkedAt: Date.now() } });
  assert.equal((await app.updates.check()).isNewer, false);
  assert.equal(app.requests(), 0);
});

test('refreshes expired cache and allows manual checks to bypass fresh cache', async () => {
  const app = setup({ latest: 'v1.8.0', cache: { version: '1.9.0', url: releaseUrl, checkedAt: Date.now() - 7 * 60 * 60 * 1000 } });
  assert.equal((await app.updates.check()).isNewer, false);
  await app.updates.check({ force: true });
  assert.equal(app.requests(), 2);
});

test('failed checks preserve the last known release', async () => {
  const app = setup({ failure: true, cache: { version: '1.9.0', url: releaseUrl, checkedAt: Date.now() } });
  await assert.rejects(app.updates.check({ force: true }), /offline/);
  assert.equal((await app.updates.readCached()).isNewer, true);
  assert.equal(app.stored.releaseUpdate.version, '1.9.0');
});

test('concurrent page checks share one request', async () => {
  const app = setup();
  const results = await Promise.all([app.updates.check(), app.updates.check()]);
  assert.equal(app.requests(), 1);
  assert.equal(results[0].version, results[1].version);
});

test('rejects malformed release tags', async () => {
  const app = setup({ latest: 'not-a-version' });
  await assert.rejects(app.updates.check(), /发布版本号无效/);
  assert.equal(app.stored.releaseUpdate, undefined);
});
