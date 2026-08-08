/* GG Bookmark - Chrome native API layer
 * ---------------------------------------------------------------------------
 * Chrome's `chrome.bookmarks` returns nodes WITHOUT a `type` field. Unlike
 * Firefox's `browser.bookmarks`, there is no `type` property on the returned
 * BookmarkTreeNode. Chrome distinguishes folders from bookmarks by the
 * presence of a `url` property:
 *   - a bookmark (link) has a `url`
 *   - a folder does NOT have a `url`
 *
 * This module wraps the callback-style `chrome.*` APIs in Promises and
 * normalizes every bookmark node so it carries a reliable `type` field
 * ('folder' | 'bookmark'). All the page / background code can then use
 * `node.type === 'folder'` uniformly.
 *
 * The rest of the codebase must reference `GG.api.*` (never `browser.*`).
 */

(function () {
  'use strict';
  const _root = (typeof window !== 'undefined' ? window : self);
  _root.GG = _root.GG || {};

  /* ---- callback -> Promise helper ----
   * `receiver` is the object that owns `method` (e.g. chrome.storage.local).
   * Chrome's API methods must be invoked with the correct `this`, otherwise
   * they throw "Illegal invocation". The method is bound to the receiver. */
  function promisify(method, receiver) {
    const bound = typeof method === 'function' ? method.bind(receiver) : method;
    return function (...args) {
      return new Promise((resolve, reject) => {
        args.push((result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
          } else {
            resolve(result);
          }
        });
        try {
          bound(...args);
        } catch (e) {
          reject(e);
        }
      });
    };
  }

  /* ---- node normalization ---- */
  // Inject `type` into a single node (recursively). Folders have no `url`.
  function normalizeNode(node) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === undefined || node.type === null) {
      node.type = node.url ? 'bookmark' : 'folder';
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(normalizeNode);
    }
    return node;
  }

  /* ---- chrome.bookmarks wrapper (normalized + promised) ---- */
  const bm = chrome.bookmarks;
  const bookmarks = {
    getTree: () => promisify(bm.getTree, bm)().then((t) => t.map(normalizeNode)),
    getSubTree: (id) => promisify(bm.getSubTree, bm)(id).then((t) => t.map(normalizeNode)),
    get: (id) => promisify(bm.get, bm)(id).then((arr) => arr.map(normalizeNode)),
    getChildren: (id) => promisify(bm.getChildren, bm)(id).then((arr) => arr.map(normalizeNode)),
    getRecent: (n) => promisify(bm.getRecent, bm)(n).then((arr) => arr.map(normalizeNode)),
    search: (query) => promisify(bm.search, bm)(query).then((arr) => arr.map(normalizeNode)),
    // Chrome's bookmarks.create does NOT accept a `type` property (it throws
    // "Unexpected property: 'type'"). A folder is created by omitting `url`;
    // a bookmark is created by providing `url`. Strip out the Firefox-style
    // `type` field so callers can pass { type: 'folder' } harmlessly.
    create: (bookmark) => {
      const clean = Object.assign({}, bookmark);
      delete clean.type;
      return promisify(bm.create, bm)(clean).then(normalizeNode);
    },
    move: (id, destination) => promisify(bm.move, bm)(id, destination).then(normalizeNode),
    update: (id, changes) => {
      const clean = Object.assign({}, changes);
      delete clean.type;
      return promisify(bm.update, bm)(id, clean).then(normalizeNode);
    },
    remove: (id) => promisify(bm.remove, bm)(id),
    removeTree: (id) => promisify(bm.removeTree, bm)(id),
    onCreated: bm.onCreated,
    onRemoved: bm.onRemoved,
    onChanged: bm.onChanged,
    onMoved: bm.onMoved,
    onChildrenReordered: bm.onChildrenReordered
  };

  /* ---- chrome.storage wrapper ---- */
  const st = chrome.storage.local;
  const storage = {
    get: (keys) => promisify(st.get, st)(keys),
    set: (obj) => promisify(st.set, st)(obj),
    remove: (keys) => promisify(st.remove, st)(keys),
    clear: () => promisify(st.clear, st)(),
    onChanged: chrome.storage.onChanged
  };

  /* ---- chrome.tabs wrapper ----
   * chrome.tabs.update has an overloaded signature:
   *   update(tabId, updateProperties)  or  update(updateProperties)
   * Normalize so `update(updateProperties)` (no tab id) works: if the first
   * arg is not a number, treat it as the properties and target the active tab. */
  function updateTab(arg1, arg2) {
    return new Promise((resolve, reject) => {
      const cb = (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || String(chrome.runtime.lastError)));
        } else {
          resolve(tab);
        }
      };
      try {
        if (typeof arg1 === 'number') chrome.tabs.update(arg1, arg2 || {}, cb);
        else chrome.tabs.update(arg1 || {}, cb);
      } catch (e) {
        reject(e);
      }
    });
  }

  const tabs = {
    create: (opts) => promisify(chrome.tabs.create, chrome.tabs)(opts),
    update: updateTab,
    query: (queryInfo) => promisify(chrome.tabs.query, chrome.tabs)(queryInfo)
  };

  /* ---- chrome.runtime wrapper ---- */
  const runtime = {
    getURL: (path) => chrome.runtime.getURL(path),
    id: chrome.runtime.id,
    lastError: () => chrome.runtime.lastError,
    sendMessage: (msg) => promisify(chrome.runtime.sendMessage, chrome.runtime)(msg),
    onMessage: chrome.runtime.onMessage,
    onInstalled: chrome.runtime.onInstalled,
    onStartup: chrome.runtime.onStartup
  };

  /* ---- chrome.alarms wrapper ----
   * chrome.alarms.create(name, info) does NOT accept a callback, so awaiting
   * it via promisify would hang forever. Wrap as an immediately-resolved
   * promise. clear()/get()/getAll() do take callbacks and can be promisified. */
  const al = chrome.alarms;
  const alarms = {
    create: (name, info) => Promise.resolve().then(() => al.create(name, info)),
    clear: (name) => promisify(al.clear, al)(name),
    clearAll: () => promisify(al.clearAll, al)(),
    get: (name) => promisify(al.get, al)(name),
    getAll: () => promisify(al.getAll, al)(),
    onAlarm: al.onAlarm
  };

  GG.api = { bookmarks, storage, tabs, runtime, alarms };

  // Expose the normalization helper too (used by import/export code paths).
  GG.normalizeNode = normalizeNode;
})();
