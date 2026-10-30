const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../lib', file), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const bookmark = (id, title, url, parentId) => ({ id, title, url, parentId, type: 'bookmark' });
const folder = (id, title, children = [], parentId = '1') => ({ id, title, children, parentId, type: 'folder' });
const initialTree = () => [folder('0', '', [folder('1', '书签栏', [
  folder('10', '工作', [bookmark('100', '文档', 'https://docs.example/', '10')]),
  folder('20', '阅读', [bookmark('200', '文章', 'https://read.example/', '20')])
])])];

function setup(tree = initialTree()) {
  const stored = { settings: {} };
  const writes = [];
  let sequence = 1000;
  const all = () => { const out = []; const walk = (nodes) => nodes.forEach((node) => { out.push(node); if (node.children) walk(node.children); }); walk(tree); return out; };
  const GG = { VERSION: '1.8.0', DEFAULTS: { sync: {} }, api: {
    storage: {
      get: async () => copy(stored),
      set: async (value) => Object.assign(stored, copy(value))
    },
    bookmarks: {
      getTree: async () => copy(tree),
      getChildren: async (id) => { const node = all().find((item) => item.id === id); if (!node) throw new Error('missing'); return copy(node.children || []); },
      create: async (data) => {
        writes.push(copy(data));
        const parent = all().find((node) => node.id === data.parentId);
        const node = { ...data, id: 'local-' + (++sequence), type: data.url ? 'bookmark' : 'folder' };
        if (!data.url) node.children = [];
        parent.children.push(node);
        return copy(node);
      }
    }
  } };
  const context = vm.createContext({ window: { GG }, console });
  vm.runInContext(read('card-bookmarks.js'), context);
  vm.runInContext(read('sync.js'), context);
  return { GG, tree, stored, writes, cards: GG.CardBookmarks };
}

function selected(app) {
  const nodes = app.cards.flatten(app.tree);
  return { id: 'card', title: '我的收藏', sourceMode: 'selection', folderId: null,
    bookmarkRefs: [app.cards.reference(nodes[1]), app.cards.reference(nodes[0])] };
}

test('a collection displays native bookmarks across folders in its own order', () => {
  const app = setup();
  const before = copy(app.tree);
  assert.deepEqual(Array.from(app.cards.list(selected(app), app.tree), (node) => node.id), ['200', '100']);
  assert.deepEqual(app.tree, before);
});

test('reordering and adding references never move browser bookmarks or duplicate a card item', () => {
  const app = setup();
  const before = copy(app.tree);
  const nodes = app.cards.flatten(app.tree);
  const reordered = app.cards.place(selected(app), nodes[0], '200', true);
  assert.deepEqual(Array.from(reordered.bookmarkRefs, (ref) => ref.id), ['100', '200']);
  const twice = app.cards.place(reordered, nodes[0], null, false);
  assert.deepEqual(Array.from(twice.bookmarkRefs, (ref) => ref.id), ['200', '100']);
  assert.deepEqual(app.tree, before);
  assert.equal(app.writes.length, 0);
});

test('native edits and moves are reflected by ID; deleted bookmarks do not select another copy', () => {
  const app = setup();
  const card = selected(app);
  const original = app.tree[0].children[0].children[0].children[0];
  original.title = '已编辑';
  original.url = 'https://changed.example/';
  assert.equal(app.cards.list(card, app.tree)[1].title, '已编辑');
  assert.equal(app.cards.list(card, app.tree)[1].url, 'https://changed.example/');
  app.tree[0].children[0].children[0].children = [bookmark('other', '文档', 'https://docs.example/', '10')];
  assert.deepEqual(Array.from(app.cards.list(card, app.tree), (node) => node.id), ['200']);
});

test('configuration-only import ignores colliding foreign IDs and does not write bookmarks', async () => {
  const app = setup();
  const foreign = selected(app);
  foreign.bookmarkRefs[0].id = '100';
  foreign.bookmarkRefs[1].id = '200';
  const before = copy(app.tree);
  await app.GG.Sync.applyConfig({ apps: [foreign] });
  assert.deepEqual(app.stored.apps[0].bookmarkRefs.map((ref) => ref.id), ['200', '100']);
  assert.deepEqual(app.tree, before);
  assert.equal(app.writes.length, 0);
});

test('ambiguous or missing imported bookmarks remain unresolved instead of binding arbitrarily', () => {
  const app = setup();
  app.tree[0].children[0].children[1].children.push(bookmark('201', '文档', 'https://docs.example/', '20'));
  const card = { sourceMode: 'selection', bookmarkRefs: [{ id: '100', title: '文档', url: 'https://docs.example/', folderPath: ['远端文件夹'] }] };
  const mapped = app.cards.remapApps([card], app.tree)[0];
  assert.equal(mapped.bookmarkRefs[0].id, null);
  assert.equal(app.cards.list(mapped, app.tree).length, 0);
});

test('export snapshots current metadata and drops known deleted references', async () => {
  const app = setup();
  app.stored.apps = [copy(selected(app))];
  const node = app.tree[0].children[0].children[1].children[0];
  node.title = '新版文章';
  node.url = 'https://updated.example/';
  app.tree[0].children[0].children[0].children = [];
  const config = await app.GG.Sync.buildConfig({ includeBookmarks: false });
  assert.equal(config.apps[0].bookmarkRefs.length, 1);
  assert.equal(config.apps[0].bookmarkRefs[0].title, '新版文章');
  assert.equal(config.apps[0].bookmarkRefs[0].url, 'https://updated.example/');
});

test('full sync remaps created and reused native IDs while preserving collection order', async () => {
  const from = setup();
  from.stored.apps = [copy(selected(from))];
  const config = copy(await from.GG.Sync.buildConfig());
  const target = setup([folder('0', '', [folder('1', '书签栏')])]);
  await target.GG.Sync.applyConfig(config);
  const refs = target.stored.apps[0].bookmarkRefs;
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((ref) => ref.url), ['https://read.example/', 'https://docs.example/']);
  assert.ok(refs.every((ref) => ref.id.startsWith('local-')));
  assert.equal(target.cards.list(target.stored.apps[0], target.tree).length, 2);
  const writes = target.writes.length;
  await target.GG.Sync.applyConfig(config);
  assert.equal(target.writes.length, writes, 'reimport must reuse bookmarks');
  assert.deepEqual(target.stored.apps[0].bookmarkRefs.map((ref) => ref.id), refs.map((ref) => ref.id));
});

test('legacy folder cards retain their existing folder remapping', async () => {
  const from = setup();
  from.stored.apps = [{ id: 'folder-card', folderId: '10', title: '工作' }];
  const config = copy(await from.GG.Sync.buildConfig());
  const target = setup([folder('0', '', [folder('1', '书签栏')])]);
  await target.GG.Sync.applyConfig(config);
  const card = target.stored.apps[0];
  assert.equal(card.sourceMode, undefined);
  assert.equal(target.tree[0].children[0].children.find((node) => node.title === '工作').id, card.folderId);
});
