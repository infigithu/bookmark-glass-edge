import type { BookmarkFolder, BookmarkItem } from '../types/bookmarks'

function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], folders: BookmarkFolder[], items: BookmarkItem[], parentId?: string) {
  for (const node of nodes) {
    if (node.url) {
      items.push({
        id: `chrome:${node.id}`,
        chromeNodeId: node.id,
        title: node.title || node.url,
        url: node.url,
        source: 'chrome',
        folderId: parentId,
        tags: [],
        favorite: false,
        createdAt: node.dateAdded ?? Date.now(),
        updatedAt: node.dateAdded ?? Date.now(),
      })
    } else {
      const syntheticId = `chrome-folder:${node.id}`
      folders.push({
        id: syntheticId,
        chromeNodeId: node.id,
        name: node.title || 'Bookmarks',
        source: 'chrome',
        parentId,
        createdAt: node.dateAdded ?? Date.now(),
      })
      if (node.children) walk(node.children, folders, items, syntheticId)
    }
  }
}

export async function getChromeBookmarks(): Promise<{ items: BookmarkItem[]; folders: BookmarkFolder[] }> {
  const tree = await chrome.bookmarks.getTree()
  const items: BookmarkItem[] = []
  const folders: BookmarkFolder[] = []
  walk(tree, folders, items)
  return { items, folders }
}

export async function searchChromeBookmarks(query: string) {
  if (!query.trim()) return []
  return chrome.bookmarks.search(query)
}
