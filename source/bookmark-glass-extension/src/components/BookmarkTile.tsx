import { ExternalLink, Pin } from 'lucide-react'
import type { BookmarkFolder, BookmarkItem } from '../types/bookmarks'
import { faviconUrl } from '../lib/favicon'
import { folderPath } from '../lib/unified'
import { GlassCard } from './GlassCard'

export function BookmarkTile({ item, folders, compact = false, onToggleFavorite, onOpen }: {
  item: BookmarkItem
  folders: BookmarkFolder[]
  compact?: boolean
  onToggleFavorite?: (item: BookmarkItem) => void
  onOpen?: (item: BookmarkItem) => void
}) {
  const path = folderPath(item.folderId, folders)
  return (
    <button className={`bookmark-tile ${compact ? 'compact' : ''}`} onClick={() => onOpen?.(item)} title={item.url}>
      <GlassCard className="tile-inner">
        <div className="tile-top">
          <img src={faviconUrl(item.url)} className="favicon" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
          <span className="source-pill">{item.source === 'chrome' ? 'Chrome' : 'Saved'}</span>
          {onToggleFavorite && (
            <span className={`pin-button ${item.favorite ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onToggleFavorite(item) }}>
              <Pin size={13} />
            </span>
          )}
        </div>
        <div className="tile-title">{item.title || item.url}</div>
        {!compact && <div className="tile-meta">{path.join(' / ') || new URL(item.url).hostname}</div>}
        {!compact && <div className="tile-open"><ExternalLink size={12} /> Open</div>}
      </GlassCard>
    </button>
  )
}
