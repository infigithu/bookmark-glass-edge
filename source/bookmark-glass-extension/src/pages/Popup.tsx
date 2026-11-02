import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, Rows3, Settings2, Pin, ArrowRight } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { BookmarkTile } from '../components/BookmarkTile'
import { getUnifiedLibrary, filterItems } from '../lib/unified'
import { updateItem, updateSettings } from '../lib/storage'
import type { AppSettings, BookmarkFolder, BookmarkItem } from '../types/bookmarks'

export default function Popup() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [folders, setFolders] = useState<BookmarkFolder[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [query, setQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | undefined>()

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const data = await getUnifiedLibrary()
    setItems(data.items)
    setFolders(data.folders)
    setSettings(data.settings)
  }

  const filtered = useMemo(() => {
    let result = filterItems(items, query)
    if (selectedFolder) result = result.filter(item => item.folderId === selectedFolder)
    return result
  }, [items, query, selectedFolder])

  async function toggleFavorite(item: BookmarkItem) {
    const library = await chrome.storage.local.get('bookmark-glass-library')
    const current = library['bookmark-glass-library'] ?? { items: [], folders: [], settings }
    const shadow = current.items.find((x: BookmarkItem) => x.id === item.id)
    const next = { ...item, favorite: !item.favorite }
    current.items = shadow
      ? current.items.map((x: BookmarkItem) => x.id === item.id ? next : x)
      : [...current.items, next]
    await chrome.storage.local.set({ 'bookmark-glass-library': current })
    refresh()
  }

  function open(item: BookmarkItem) {
    chrome.tabs.create({ url: item.url })
  }

  async function openDashboard() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
    window.close()
  }

  async function setLayout(layout: AppSettings['popupLayout']) {
    const next = await updateSettings({ popupLayout: layout })
    setSettings(next)
  }

  if (!settings) return <div className="popup-shell loading">Loading...</div>

  const folderItems = folders.filter(f => f.source === 'chrome' && f.parentId === 'chrome-folder:1' || f.source === 'chrome' && f.parentId === 'chrome-folder:0')

  return (
    <div className="popup-shell">
      <div className="popup-head">
        <div>
          <div className="eyebrow">BOOKMARK GLASS</div>
          <div className="popup-title">Your bookmarks</div>
        </div>
        <button className="icon-btn" onClick={openDashboard} title="Open dashboard"><Pin size={16} /></button>
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="toolbar">
        <div className="segmented">
          <button className={settings.popupLayout === 'horizontal' ? 'active' : ''} onClick={() => setLayout('horizontal')}><Rows3 size={14} /></button>
          <button className={settings.popupLayout === 'vertical' ? 'active' : ''} onClick={() => setLayout('vertical')}><List size={14} /></button>
          <button className={settings.popupLayout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')}><LayoutGrid size={14} /></button>
        </div>
        <button className="quiet-btn" onClick={openDashboard}><Settings2 size={14} /> Manage <ArrowRight size={13} /></button>
      </div>

      {folderItems.length > 0 && (
        <div className="folder-strip">
          <button className={!selectedFolder ? 'folder-chip active' : 'folder-chip'} onClick={() => setSelectedFolder(undefined)}>All</button>
          {folderItems.slice(0, 5).map(folder => (
            <button key={folder.id} className={selectedFolder === folder.id ? 'folder-chip active' : 'folder-chip'} onClick={() => setSelectedFolder(folder.id)}>{folder.name}</button>
          ))}
        </div>
      )}

      <div className={`bookmark-list ${settings.popupLayout}`}>
        {filtered.slice(0, 24).map(item => <BookmarkTile key={item.id} item={item} folders={folders} compact={settings.popupLayout === 'horizontal'} onToggleFavorite={toggleFavorite} onOpen={open} />)}
        {filtered.length === 0 && <div className="empty-state">No bookmarks found.</div>}
      </div>

      <button className="dashboard-cta" onClick={openDashboard}>Open full library <ArrowRight size={15} /></button>
    </div>
  )
}
