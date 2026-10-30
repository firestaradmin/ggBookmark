const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const copy = (value) => JSON.parse(JSON.stringify(value));
function setup() {
  const tree = [{ id: '0', title: '', children: [
    { id: '1', title: '书签栏', parentId: '0', children: [
      { id: '10', title: '开发工具', parentId: '1', children: [
        { id: '100', parentId: '10', title: '旧标题', url: 'https://example.com/' }
      ] },
      { id: '20', title: '阅读', parentId: '1', children: [] }
    ] },
    { id: '2', title: '其他书签', parentId: '0', children: [] },
    { id: '3', title: '组织书签', parentId: '0', unmodifiable: 'managed', children: [
      { id: '30', title: '只读子文件夹', parentId: '3', children: [] }
    ] }
  ] }];
  const writes = [];
  const stored = { apps: [
    { id: 'card', title: '自选', sourceMode: 'selection', folderId: null, bookmarkRefs: [] },
    { id: 'folder-card', folderId: '10', title: '开发工具' }
  ], quickBookmarkRecentFolders: ['20', '10', '1'] };
  const nodes = () => { const all = []; const walk = (list) => list.forEach((n) => { all.push(n); walk(n.children || []); }); walk(tree); return all; };
  let sequence = 1000, failStorageKey = '';
  const GG = { api: {
    bookmarks: {
      getTree: async () => copy(tree),
      getChildren: async (id) => copy(nodes().find((n) => n.id === id).children),
      create: async (data) => {
        writes.push({ method: 'create', ...data });
        const node = { id: String(++sequence), ...data };
        if (!node.url) node.children = [];
        nodes().find((n) => n.id === data.parentId).children.push(node);
        return copy(node);
      },
      update: async (id, data) => {
        writes.push({ method: 'update', id, ...data });
        const node = nodes().find((n) => n.id === id);
        Object.assign(node, data);
        return copy(node);
      },
      move: async (id, data) => {
        writes.push({ method: 'move', id, ...data });
        const node = nodes().find((n) => n.id === id);
        const parent = nodes().find((n) => n.id === node.parentId);
        parent.children = parent.children.filter((n) => n.id !== id);
        nodes().find((n) => n.id === data.parentId).children.push(node);
        node.parentId = data.parentId;
        return copy(node);
      }
    },
    storage: {
      get: async (key) => copy({ [key]: stored[key] }),
      set: async (value) => {
        if (failStorageKey in value) throw new Error('存储写入失败');
        Object.assign(stored, copy(value));
      }
    }
  } };
  const context = vm.createContext({ window: { GG }, URL });
  for (const name of ['card-bookmarks.js', 'quick-bookmark.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib', name), 'utf8'), context);
  }
  return { model: GG.QuickBookmark, tree, stored, writes, failStorage: (key) => { failStorageKey = key; } };
}

test('folder search matches full paths and prioritizes recent writable folders', () => {
  const { model, tree } = setup();
  const folders = model.folders(tree);
  assert.deepEqual(Array.from(folders, (folder) => folder.id), ['1', '10', '20', '2']);
  assert.deepEqual(Array.from(model.orderedFolders(folders, ['20', '10']), (folder) => folder.id), ['20', '10', '1', '2']);
  assert.deepEqual(Array.from(model.orderedFolders(folders, [], '书签栏 开发'), (folder) => folder.id), ['10']);
  assert.equal(model.orderedFolders(folders, [], '不存在').length, 0);
});

test('saving creates a native bookmark in the selected folder and records local recents', async () => {
  const { model, stored, writes } = setup();
  const result = await model.save({ title: '文章', url: 'https://read.example/', folderId: '20' });
  assert.deepEqual(writes, [{ method: 'create', title: '文章', url: 'https://read.example/', parentId: '20' }]);
  assert.equal(result.bookmark.parentId, '20');
  assert.equal(result.reused, false);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(stored.quickBookmarkRecentFolders, ['20', '10', '1']);
});

test('the same URL in the same folder is reused and renamed without duplicates', async () => {
  const { model, tree, writes } = setup();
  const result = await model.save({ title: '新标题', url: 'https://example.com/', folderId: '10' });
  assert.equal(result.reused, true);
  assert.equal(result.bookmark.id, '100');
  assert.deepEqual(writes, [{ method: 'update', id: '100', title: '新标题' }]);
  assert.equal(tree[0].children[0].children[0].children.length, 1);
  await model.save({ title: '新标题', url: 'https://example.com/', folderId: '10' });
  assert.equal(writes.length, 1);
});

test('saving an already bookmarked URL to another folder moves its native ID without creating copies', async () => {
  const { model, tree, writes, stored } = setup();
  stored.apps[0].bookmarkRefs = [{ id: '100', title: '旧标题', url: 'https://example.com/' }];
  const result = await model.save({ title: '新标题', url: 'https://example.com/', folderId: '20', cardId: 'card' });
  assert.equal(result.reused, true);
  assert.equal(result.moved, true);
  assert.equal(result.bookmark.id, '100');
  assert.equal(tree[0].children[0].children[0].children.length, 0);
  assert.equal(tree[0].children[0].children[1].children.length, 1);
  assert.equal(result.bookmark.parentId, '20');
  assert.equal(writes.filter((write) => write.method === 'create').length, 0);
  assert.equal(stored.apps[0].bookmarkRefs[0].id, '100');
  assert.deepEqual(stored.apps[0].bookmarkRefs[0].folderPath, ['书签栏', '阅读']);
});

test('existing-bookmark detection normalizes equivalent URLs and retains the native folder path', () => {
  const { model, tree } = setup();
  const found = model.existingBookmarks(tree, 'https://EXAMPLE.com:443');
  assert.equal(found.length, 1);
  assert.equal(found[0].parentId, '10');
  assert.deepEqual(Array.from(found[0].folderPath), ['书签栏', '开发工具']);
  assert.equal(model.existingBookmarks(tree, 'https://example.com/?page=2').length, 0);
});

test('legacy copies in the destination are reused without creating or moving another copy there', async () => {
  const { model, tree, writes } = setup();
  tree[0].children[0].children[1].children.push({ id: '200', parentId: '20', title: '已有副本', url: 'https://example.com/' });
  const result = await model.save({ title: '已有副本', url: 'https://example.com/', folderId: '20', bookmarkId: '100' });
  assert.equal(result.bookmark.id, '200');
  assert.equal(result.moved, false);
  assert.equal(writes.length, 0);
  assert.equal(tree[0].children[0].children[0].children.length, 1);
});

test('saving rechecks native bookmarks created after the popup was opened', async () => {
  const { model, tree, writes } = setup();
  tree[0].children[0].children[1].children.push({ id: '200', parentId: '20', title: '稍后创建', url: 'https://late.example/' });
  const result = await model.save({ title: '稍后创建', url: 'https://late.example/', folderId: '10' });
  assert.equal(result.bookmark.id, '200');
  assert.equal(result.moved, true);
  assert.equal(writes.filter((write) => write.method === 'create').length, 0);
});

test('a bookmark in a managed folder cannot be duplicated into a writable folder', async () => {
  const { model, tree, writes } = setup();
  tree[0].children[2].children[0].children.push({ id: '300', parentId: '30', title: '组织网页', url: 'https://managed.example/' });
  await assert.rejects(model.save({ title: '组织网页', url: 'https://managed.example/', folderId: '20' }), /只读/);
  assert.equal(writes.length, 0);
});

test('folder counts include descendants and update after moving a bookmark', async () => {
  const { model, tree } = setup();
  assert.equal(model.folders(tree).find((folder) => folder.id === '1').bookmarkCount, 1);
  await model.save({ title: '旧标题', url: 'https://example.com/', folderId: '20' });
  const folders = model.folders(tree);
  assert.equal(folders.find((folder) => folder.id === '10').bookmarkCount, 0);
  assert.equal(folders.find((folder) => folder.id === '20').bookmarkCount, 1);
  assert.equal(folders.find((folder) => folder.id === '1').bookmarkCount, 1);
});

test('invalid URLs, read-only folders, missing folders and stale cards perform no writes', async () => {
  const { model, writes } = setup();
  const input = { title: '网页', url: 'https://example.com/', folderId: '20' };
  await assert.rejects(model.save({ ...input, url: 'javascript:alert(1)' }));
  await assert.rejects(model.save({ ...input, url: 'not a url' }));
  for (const folderId of ['0', '3', '30', 'missing']) await assert.rejects(model.save({ ...input, folderId }));
  for (const cardId of ['deleted', 'folder-card']) await assert.rejects(model.save({ ...input, cardId }));
  assert.equal(writes.length, 0);
});

test('saving can also reference the native bookmark in a custom card', async () => {
  const { model, stored } = setup();
  const result = await model.save({ title: '我的网页', url: 'https://new.example/', folderId: '20', cardId: 'card' });
  const ref = stored.apps[0].bookmarkRefs[0];
  assert.equal(ref.id, result.bookmark.id);
  assert.deepEqual(ref.folderPath, ['书签栏', '阅读']);
  assert.equal(stored.apps[1].folderId, '10');
  assert.equal(result.bookmark.parentId, '20');
});

test('saving an existing reference keeps its card order and updates its metadata', async () => {
  const { model, stored } = setup();
  stored.apps[0].bookmarkRefs = [{ id: '100', title: '旧标题', url: 'https://example.com/' }, { id: 'other', url: 'https://other.example/' }];
  await model.save({ title: '更新', url: 'https://example.com/', folderId: '10', cardId: 'card' });
  assert.deepEqual(stored.apps[0].bookmarkRefs.map((ref) => ref.id), ['100', 'other']);
  assert.equal(stored.apps[0].bookmarkRefs[0].title, '更新');
});

test('post-save card failures report partial success and retry does not duplicate bookmarks', async () => {
  const { model, writes, failStorage } = setup();
  failStorage('apps');
  const input = { title: '网页', url: 'https://new.example/', folderId: '20', cardId: 'card' };
  const result = await model.save(input);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /书签已保存/);
  await model.save(input);
  assert.equal(writes.filter((write) => write.method === 'create').length, 1);
});

test('recent-folder persistence failure does not conceal a successful native save', async () => {
  const { model, failStorage } = setup();
  failStorage('quickBookmarkRecentFolders');
  const result = await model.save({ title: '', url: 'https://new.example/', folderId: '20' });
  assert.equal(result.bookmark.title, 'https://new.example/');
  assert.equal(result.warnings.length, 1);
});

test('creating a folder reuses a sibling with the same name and rejects read-only parents', async () => {
  const { model, writes } = setup();
  const first = await model.createFolder('20', '新分类');
  const second = await model.createFolder('20', ' 新分类 ');
  assert.equal(second.id, first.id);
  assert.equal(writes.length, 1);
  await assert.rejects(model.createFolder('3', '新分类'));
  await assert.rejects(model.createFolder('20', ' '));
  assert.equal(writes.length, 1);
});
