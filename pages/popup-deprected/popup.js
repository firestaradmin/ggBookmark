/* GG Bookmark - browser action popup */
(() => {
  'use strict';
  const view = document.getElementById('ppView');
  const panel = document.getElementById('ppSettings');

  function openSettings() {
    panel.classList.add('open');
    view.classList.add('hidden-shift');
  }
  function closeSettings() {
    panel.classList.remove('open');
    view.classList.remove('hidden-shift');
  }

  document.getElementById('openNewtab').addEventListener('click', () => {
    browser.tabs.create({ url: '/pages/newtab/newtab.html' });
    window.close();
  });
  document.getElementById('openOrganize').addEventListener('click', () => {
    browser.tabs.create({ url: '/pages/organizer/organizer.html' });
    window.close();
  });
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('ppSettingsClose').addEventListener('click', closeSettings);
})();
