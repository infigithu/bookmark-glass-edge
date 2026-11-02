export type Source = 'chrome' | 'custom'

export type BookmarkItem = {
  id: string
  title: string
  url: string
  source: Source
  folderId?: string
  tags: string[]
  notes?: string
  favorite: boolean
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  chromeNodeId?: string
}

export type BookmarkFolder = {
  id: string
  name: string
  parentId?: string
  source: Source
  chromeNodeId?: string
  createdAt: number
}

export type AppSettings = {
  popupLayout: 'horizontal' | 'vertical' | 'grid'
  theme: 'dark' | 'light' | 'system'
  showFavicons: boolean
  showUrls: boolean
}

export type LibraryData = {
  items: BookmarkItem[]
  folders: BookmarkFolder[]
  settings: AppSettings
}
