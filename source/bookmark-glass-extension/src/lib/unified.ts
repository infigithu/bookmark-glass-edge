import { getChromeBookmarks } from './chromeBookmarks'
import { getLibrary } from './storage'
import type { BookmarkFolder, BookmarkItem } from '../types/bookmarks'

export async function getUnifiedLibrary() {
  const [{ items: chromeItems, folders: chromeFolders }, custom] = await Promise.all([
    getChromeBookmarks(),
    getLibrary(),
  ])

  const chromeMetadata = new Map(custom.items.filter(item => item.source === 'chrome').map(item => [item.id, item]))
  const mergedChromeItems = chromeItems.map(item => {
    const metadata = chromeMetadata.get(item.id)
    return metadata ? { ...item, ...metadata, chromeNodeId: item.chromeNodeId, source: 'chrome' as const } : item
  })

  const chromeIds = new Set(chromeItems.map(item => item.id))
  const customItems = custom.items.filter(item => item.source === 'custom' && !chromeIds.has(item.id))
  const customFolders = custom.folders.filter(folder => folder.source === 'custom')

  return {
    items: [...mergedChromeItems, ...customItems],
    folders: [...chromeFolders, ...customFolders],
    settings: custom.settings,
  }
}

export function filterItems(items: BookmarkItem[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.url.toLowerCase().includes(q) ||
    item.tags.some(tag => tag.toLowerCase().includes(q)) ||
    (item.notes ?? '').toLowerCase().includes(q)
  )
}

export function folderPath(folderId: string | undefined, folders: BookmarkFolder[]) {
  if (!folderId) return []
  const result: string[] = []
  let current = folders.find(folder => folder.id === folderId)
  while (current) {
    result.unshift(current.name)
    current = folders.find(folder => folder.id === current?.parentId)
  }
  return result
}
