/**
 * Bookmark Glass - Service Worker (Background)
 */

function getDefaultBookmarkFolderId() {
  return new Promise((resolve) => {
    if (!chrome.bookmarks || !chrome.bookmarks.getTree) {
      return resolve('1');
    }
    chrome.bookmarks.getTree((tree) => {
      const root = tree && tree[0];
      if (!root || !root.children || !root.children.length) {
        return resolve('1');
      }
      const bar = root.children.find(c => {
        const title = (c.title || '').toLowerCase();
        return c.id === '1' || c.id === 'toolbar_____' || title.includes('bar') || title.includes('toolbar') || title.includes('favorites');
      }) || root.children[0];
      resolve(bar ? bar.id : '1');
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  // Setup Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'parent-save',
      title: 'Bookmark Glass',
      contexts: ['page', 'link', 'selection']
    });

    chrome.contextMenus.create({
      parentId: 'parent-save',
      id: 'save-to-chrome',
      title: 'Save to Browser Bookmarks',
      contexts: ['page', 'link']
    });

    chrome.contextMenus.create({
      parentId: 'parent-save',
      id: 'save-to-library',
      title: 'Save to My Library',
      contexts: ['page', 'link']
    });

    chrome.contextMenus.create({
      parentId: 'parent-save',
      id: 'save-as-article',
      title: 'Save as Article (Want to Read)',
      contexts: ['page', 'link']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url;
  const title = info.selectionText || tab?.title || url;
  if (!url) return;

  if (info.menuItemId === 'save-to-chrome') {
    const parentId = await getDefaultBookmarkFolderId();
    chrome.bookmarks.create({ parentId, title, url });
  } else if (info.menuItemId === 'save-to-library') {
    const st = await chrome.storage.local.get({ my_library_links: [] });
    const links = st.my_library_links || [];
    if (!links.some(x => x.url === url)) {
      links.unshift({
        id: crypto.randomUUID(),
        title,
        url,
        folderId: null,
        tags: [],
        notes: '',
        favorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastOpenedAt: null,
        source: 'library'
      });
      await chrome.storage.local.set({ my_library_links: links });
    }
  } else if (info.menuItemId === 'save-as-article') {
    const st = await chrome.storage.local.get({ my_articles_library: [] });
    const articles = st.my_articles_library || [];
    if (!articles.some(x => x.url === url)) {
      articles.unshift({
        id: crypto.randomUUID(),
        title,
        url,
        coverImage: '',
        domain: (new URL(url)).hostname.replace(/^www\./, ''),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        readingStatus: 'Want to Read',
        readDate: null,
        notes: '',
        folderId: null,
        tags: [],
        source: 'article'
      });
      await chrome.storage.local.set({ my_articles_library: articles });
    }
  }
});

// Shortcut commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});
