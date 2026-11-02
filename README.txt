BOOKMARK GLASS v1.0.0
Unified Microsoft Edge Bookmark, Personal Library & Reading Tracker System

The `extension` folder is a complete, standalone, zero-build unpacked Microsoft Edge extension.

INSTALLATION:
1. Open Microsoft Edge and navigate to: edge://extensions
2. Enable "Developer mode" (toggle in the left sidebar).
3. Click "Load unpacked".
4. Select the folder named "extension" in this directory.
5. Pin "Bookmark Glass" to your Edge extensions toolbar.

FEATURES & USAGE:
1. Edge Extension Popup:
   - Bottom glass navigation bar:
     • Home: Launches the full desktop dashboard in a new tab.
     • Files: In-popup bookmark browser with folder tree navigation, breadcrumbs, drag-and-drop moving, and real-time search.
     • Save: Quick-save modal for the active webpage with Open Graph metadata scraper, duplicate URL detection, and destination selector (Browser Bookmarks, My Library, Articles).
     • Change Layout: Cycles between List, Grid, and Title views (persisted independently for popup).
2. Main Desktop Dashboard (dashboard.html):
   - All Bookmarks: Complete browser bookmark hierarchy with real browser API synchronization.
   - Bookmark Bar: Dedicated manager for the browser's Bookmark/Favorites Bar with drag-and-drop reordering.
   - Folders: Create, rename, delete (with child-count confirmation), and assign visual glass colors.
   - My Library: Independent personal link archive with tags, notes, favorites, and search.
   - Articles: Reading tracker with Open Graph cover image previews, status tracking (Want to Read, In Progress, Done Reading), read timestamps, multi-select filters, and date sorting.
   - Global Search: Real-time search across Bookmarks, My Library, Articles, and Folders.
   - Settings: Independent popup/dashboard layout preferences and backup export.
3. Keyboard Shortcut:
   - Press Ctrl+Shift+L (or Command+Shift+L on macOS) to open the dashboard immediately.
4. Context Menus:
   - Right-click any page or link -> "Bookmark Glass" -> Save to Browser Bookmarks, My Library, or Articles.
