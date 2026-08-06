/* GG Bookmark - browser action popup */
(() => {
  'use strict';
  document.getElementById('openNewtab').addEventListener('click', () => {
    browser.tabs.create({ url: '/pages/newtab/newtab.html' });
    window.close();
  });
  document.getElementById('openOrganize').addEventListener('click', () => {
    browser.tabs.create({ url: '/pages/organizer/organizer.html' });
    window.close();
  });
  document.getElementById('openSettings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
})();
