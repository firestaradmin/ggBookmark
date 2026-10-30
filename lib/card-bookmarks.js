/* Cards may display a folder or an ordered collection of native bookmark references. */
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const GG = root.GG = root.GG || {};
  const isSelection = (app) => !!app && app.sourceMode === 'selection';

  function flatten(tree) {
    const result = [];
    function walk(nodes, folderPath) {
      for (const node of nodes || []) {
        if (node.url) result.push({ ...node, folderPath });
        else walk(node.children, node.title ? folderPath.concat(node.title) : folderPath);
      }
    }
    walk(tree, []);
    return result;
  }

  function reference(node) {
    return { id: node.id, title: node.title || '', url: node.url, folderPath: (node.folderPath || []).slice() };
  }

  function list(app, tree) {
    const byId = new Map(flatten(tree).map((node) => [node.id, node]));
    const seen = new Set();
    return (app.bookmarkRefs || []).flatMap((ref) => {
      const node = ref.id && byId.get(ref.id);
      if (!node || seen.has(node.id)) return [];
      seen.add(node.id);
      return [node];
    });
  }

  function snapshotApps(apps, tree) {
    const byId = new Map(flatten(tree).map((node) => [node.id, node]));
    return apps.map((app) => !isSelection(app) ? app : {
      ...app,
      // A known local ID that disappeared is a deleted bookmark, not a new link to create.
      bookmarkRefs: (app.bookmarkRefs || []).flatMap((ref) => {
        const live = ref.id && byId.get(ref.id);
        return live ? [reference(live)] : (ref.id ? [] : [ref]);
      })
    });
  }

  function remapApps(apps, tree, idMap) {
    const nodes = flatten(tree);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return apps.map((app) => {
      if (!isSelection(app)) return app;
      const seen = new Set();
      const bookmarkRefs = (app.bookmarkRefs || []).flatMap((ref) => {
        let node = idMap && byId.get(idMap.get(ref.id));
        if (!node) {
          // Imported IDs belong to another browser. Never trust a coinciding local ID.
          const candidates = nodes.filter((item) => item.url === ref.url);
          const exact = candidates.filter((item) => item.title === ref.title && JSON.stringify(item.folderPath) === JSON.stringify(ref.folderPath));
          if (exact.length === 1) node = exact[0];
          else if (candidates.length === 1) node = candidates[0];
        }
        if (!node) return [{ ...ref, id: null }];
        if (seen.has(node.id)) return [];
        seen.add(node.id);
        return [reference(node)];
      });
      return { ...app, folderId: null, recursive: false, bookmarkRefs };
    });
  }

  function place(app, node, anchorId, before) {
    const refs = (app.bookmarkRefs || []).filter((ref) => ref.id !== node.id);
    const index = anchorId ? refs.findIndex((ref) => ref.id === anchorId) : -1;
    refs.splice(index < 0 ? refs.length : index + (before ? 0 : 1), 0, reference(node));
    return { ...app, sourceMode: 'selection', folderId: null, recursive: false, bookmarkRefs: refs };
  }

  GG.CardBookmarks = { isSelection, flatten, reference, list, snapshotApps, remapApps, place };
})();
