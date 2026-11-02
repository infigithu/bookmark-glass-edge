chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'save-to-bookmark-glass', title: 'Save to Bookmark Glass', contexts: ['page', 'link'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-bookmark-glass') return
  const url = info.linkUrl || info.pageUrl || tab?.url
  if (!url) return
  const existing = await chrome.storage.local.get('bookmark-glass-library')
  const library = existing['bookmark-glass-library'] ?? { items: [], folders: [], settings: { popupLayout: 'grid', theme: 'dark', showFavicons: true, showUrls: false } }
  const title = info.linkUrl ? (info.selectionText || info.linkUrl) : (tab?.title || url)
  if (library.items.some((item: any) => item.url === url && item.source === 'custom')) return
  library.items.unshift({ id: `link-${crypto.randomUUID()}`, title, url, source: 'custom', tags: [], favorite: false, createdAt: Date.now(), updatedAt: Date.now() })
  await chrome.storage.local.set({ 'bookmark-glass-library': library })
})

chrome.commands.onCommand.addListener(async command => {
  if (command === 'open-dashboard') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
  }
})
