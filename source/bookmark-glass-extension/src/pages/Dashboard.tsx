import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Plus, Search, FolderPlus, Star, Link2, Chrome, MoreHorizontal, Trash2, ExternalLink, Download, Upload, Pin, X } from 'lucide-react'
import { BookmarkTile } from '../components/BookmarkTile'
import { getUnifiedLibrary, filterItems, folderPath } from '../lib/unified'
import { addFolder, addItem, getLibrary, updateItem } from '../lib/storage'
import { newId } from '../lib/storage'
import type { BookmarkFolder, BookmarkItem } from '../types/bookmarks'

export default function Dashboard() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [folders, setFolders] = useState<BookmarkFolder[]>([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'all' | 'chrome' | 'custom' | 'favorites' | 'recent'>('all')
  const [activeFolder, setActiveFolder] = useState<string | undefined>()
  const [showAdd, setShowAdd] = useState(false)
  const [showFolder, setShowFolder] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newFolderName, setNewFolderName] = useState('')

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const data = await getUnifiedLibrary()
    setItems(data.items)
    setFolders(data.folders)
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault()
    if (!newUrl.trim()) return
    const title = newTitle.trim() || (() => { try { return new URL(newUrl).hostname } catch { return newUrl } })()
    const item: BookmarkItem = {
      id: newId('link'), title, url: newUrl.trim(), source: 'custom', tags: [], favorite: false,
      createdAt: Date.now(), updatedAt: Date.now(), folderId: activeFolder,
    }
    await addItem(item)
    setNewTitle(''); setNewUrl(''); setShowAdd(false); await refresh()
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    await addFolder({ id: newId('folder'), name: newFolderName.trim(), source: 'custom', parentId: activeFolder, createdAt: Date.now() })
    setNewFolderName(''); setShowFolder(false); await refresh()
  }

  async function toggleFavorite(item: BookmarkItem) {
    const lib = await getLibrary()
    const existing = lib.items.find(x => x.id === item.id)
    if (existing) await updateItem(item.id, { favorite: !item.favorite })
    else await addItem({ ...item, favorite: !item.favorite })
    await refresh()
  }

  async function exportLibrary() {
    const lib = await getLibrary()
    const blob = new Blob([JSON.stringify(lib, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bookmark-glass-library.json'; a.click(); URL.revokeObjectURL(url)
  }

  async function importLibrary(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const parsed = JSON.parse(await file.text())
    await chrome.storage.local.set({ 'bookmark-glass-library': parsed })
    await refresh()
    e.target.value = ''
  }

  const visible = useMemo(() => {
    let result = items
    if (view === 'chrome') result = result.filter(i => i.source === 'chrome')
    if (view === 'custom') result = result.filter(i => i.source === 'custom')
    if (view === 'favorites') result = result.filter(i => i.favorite)
    if (view === 'recent') result = [...result].sort((a,b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt))
    if (activeFolder) result = result.filter(i => i.folderId === activeFolder)
    return filterItems(result, query)
  }, [items, query, view, activeFolder])

  return (
    <div className="dashboard-shell">
      <aside className="sidebar glass-panel">
        <div className="brand"><div className="brand-mark">B</div><div><div className="eyebrow">BOOKMARK</div><strong>GLASS</strong></div></div>
        <button className="primary-btn full" onClick={() => setShowAdd(true)}><Plus size={16} /> Add link</button>
        <nav className="nav-list">
          <button className={view === 'all' && !activeFolder ? 'nav-item active' : 'nav-item'} onClick={() => {setView('all'); setActiveFolder(undefined)}}><Link2 size={16} /> All links</button>
          <button className={view === 'favorites' ? 'nav-item active' : 'nav-item'} onClick={() => {setView('favorites'); setActiveFolder(undefined)}}><Star size={16} /> Favorites</button>
          <button className={view === 'chrome' ? 'nav-item active' : 'nav-item'} onClick={() => {setView('chrome'); setActiveFolder(undefined)}}><Chrome size={16} /> Chrome bookmarks</button>
          <button className={view === 'custom' ? 'nav-item active' : 'nav-item'} onClick={() => {setView('custom'); setActiveFolder(undefined)}}><Pin size={16} /> My library</button>
          <button className={view === 'recent' ? 'nav-item active' : 'nav-item'} onClick={() => {setView('recent'); setActiveFolder(undefined)}}>Recently opened</button>
        </nav>
        <div className="sidebar-section-head"><span>Folders</span><button className="icon-btn small" onClick={() => setShowFolder(true)}><FolderPlus size={14}/></button></div>
        <div className="folder-list">
          {folders.filter(f => f.source === 'custom').map(folder => (
            <button key={folder.id} className={activeFolder === folder.id ? 'folder-row active' : 'folder-row'} onClick={() => { setActiveFolder(folder.id); setView('all') }}>
              <span>•</span>{folder.name}<MoreHorizontal size={14} className="folder-menu" />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={exportLibrary}><Download size={15} /> Export</button>
          <label className="nav-item"><Upload size={15} /> Import<input type="file" accept="application/json" hidden onChange={importLibrary}/></label>
        </div>
      </aside>

      <main className="main-content">
        <header className="dashboard-header">
          <div><div className="eyebrow">YOUR LIBRARY</div><h1>{activeFolder ? folders.find(f => f.id === activeFolder)?.name : 'Everything'}</h1><p>{visible.length} links available</p></div>
          <div className="header-actions"><div className="dashboard-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your library..." /></div><button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={16}/> Add</button></div>
        </header>

        <section className="library-toolbar"><span>{view === 'chrome' ? 'Chrome bookmarks' : view === 'custom' ? 'My saved links' : view === 'favorites' ? 'Favorites' : view === 'recent' ? 'Recently opened' : 'All links'}</span><span className="toolbar-muted">Synced live with Chrome</span></section>
        <section className="dashboard-grid">
          {visible.map(item => <BookmarkTile key={item.id} item={item} folders={folders} onToggleFavorite={toggleFavorite} onOpen={async i => { await updateItem(i.id, { lastOpenedAt: Date.now() }); chrome.tabs.create({url:i.url}) }} />)}
          {visible.length === 0 && <div className="dashboard-empty"><div className="empty-icon">⌁</div><h2>Nothing here yet</h2><p>Save a link or choose another section.</p><button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={16}/> Save your first link</button></div>}
        </section>
      </main>

      {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><form className="modal glass-panel" onClick={e => e.stopPropagation()} onSubmit={saveLink}><div className="modal-head"><div><div className="eyebrow">MY LIBRARY</div><h2>Save a link</h2></div><button type="button" className="icon-btn" onClick={() => setShowAdd(false)}><X size={18}/></button></div><label>URL<input autoFocus value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com" /></label><label>Title<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Optional title" /></label><label>Folder<select value={activeFolder ?? ''} onChange={e => setActiveFolder(e.target.value || undefined)}><option value="">No folder</option>{folders.filter(f => f.source==='custom').map(f => <option key={f.id} value={f.id}>{folderPath(f.id, folders).join(' / ')}</option>)}</select></label><div className="modal-actions"><button type="button" className="quiet-btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary-btn" type="submit">Save link</button></div></form></div>}
      {showFolder && <div className="modal-backdrop" onClick={() => setShowFolder(false)}><form className="modal glass-panel" onClick={e => e.stopPropagation()} onSubmit={createFolder}><div className="modal-head"><div><div className="eyebrow">ORGANIZE</div><h2>New folder</h2></div><button type="button" className="icon-btn" onClick={() => setShowFolder(false)}><X size={18}/></button></div><label>Folder name<input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="e.g. Learning" /></label><div className="modal-actions"><button type="button" className="quiet-btn" onClick={() => setShowFolder(false)}>Cancel</button><button className="primary-btn" type="submit">Create folder</button></div></form></div>}
    </div>
  )
}
