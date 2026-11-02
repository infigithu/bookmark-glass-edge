import type { AppSettings, BookmarkFolder, BookmarkItem, LibraryData } from '../types/bookmarks'

export const defaultSettings: AppSettings = {
  popupLayout: 'grid',
  theme: 'dark',
  showFavicons: true,
  showUrls: false,
}

const STORAGE_KEY = 'bookmark-glass-library'

export async function getLibrary(): Promise<LibraryData> {
  const data = await chrome.storage.local.get(STORAGE_KEY)
  return (data[STORAGE_KEY] as LibraryData | undefined) ?? {
    items: [],
    folders: [],
    settings: defaultSettings,
  }
}

export async function saveLibrary(data: LibraryData) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data })
}

export async function addItem(item: BookmarkItem) {
  const library = await getLibrary()
  library.items.unshift(item)
  await saveLibrary(library)
}

export async function updateItem(id: string, patch: Partial<BookmarkItem>) {
  const library = await getLibrary()
  library.items = library.items.map(item => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)
  await saveLibrary(library)
}

export async function deleteItem(id: string) {
  const library = await getLibrary()
  library.items = library.items.filter(item => item.id !== id)
  await saveLibrary(library)
}

export async function addFolder(folder: BookmarkFolder) {
  const library = await getLibrary()
  library.folders.push(folder)
  await saveLibrary(library)
}

export async function deleteFolder(id: string) {
  const library = await getLibrary()
  library.folders = library.folders.filter(folder => folder.id !== id)
  library.items = library.items.map(item => item.folderId === id ? { ...item, folderId: undefined } : item)
  await saveLibrary(library)
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const library = await getLibrary()
  library.settings = { ...library.settings, ...settings }
  await saveLibrary(library)
  return library.settings
}

export function newId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`
}
