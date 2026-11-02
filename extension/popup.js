import { chromeBookmarkRepository } from './core/repositories/chrome-bookmarks.js';
import { settingsRepository } from './core/repositories/settings-repository.js';
import { libraryRepository } from './core/repositories/library-repository.js';
import { articleRepository } from './core/repositories/article-repository.js';
import { folderRepository } from './core/repositories/folder-repository.js';
import { getActiveTabMetadata } from './core/metadata-extractor.js';
import { LayoutType, ArticleStatus, extractDomain, getFaviconUrl } from './core/types.js';
import { showToast } from './ui/toast.js';

// --- State ---
let currentLayout = LayoutType.GRID;
let activeView = 'files'; // 'files' | 'save' | 'settings'
let currentFolderId = null; // null = top-level Chrome roots
let folderPathStack = []; // [ { id, title } ]
let currentNodes = [];
let allBookmarksFlattened = [];
let activeDragId = null;

// Save Panel State (matching reference save-button.html)
const saveState = {
  tab: 'bm', // 'bm' | 'lib' | 'art'
  meta: {
    title: '',
    url: '',
    domain: '',
    favicon: '',
    coverImage: '',
    description: ''
  },
  bm: {
    folderId: '',
    folderName: 'Bookmarks bar',
    open: new Set(['0']),
    adding: false,
    tree: []
  },
  lib: {
    folderId: '',
    folderName: 'Inbox',
    folders: [],
    addingFolder: false,
    tags: new Set(),
    notes: '',
    fav: false
  },
  art: {
    status: ArticleStatus.WANT_TO_READ,
    tags: new Set(),
    notes: ''
  },
  tagPools: {
    lib: ['Learning', 'Tools', 'Inspiration'],
    art: ['Reading', 'Design', 'Startup']
  },
  timer: null,
  lastSaved: null
};

const DEFAULT_LIB_TAGS = ['Learning', 'Tools', 'Inspiration'];
const DEFAULT_ART_TAGS = ['Reading', 'Design', 'Startup'];

function loadTagPools() {
  try {
    const rawLib = localStorage.getItem('bg-tagpool-lib');
    const rawArt = localStorage.getItem('bg-tagpool-art');
    const legacy = localStorage.getItem('bg-tagpool');

    if (rawLib) {
      const parsed = JSON.parse(rawLib);
      if (Array.isArray(parsed) && parsed.length) {
        saveState.tagPools.lib = parsed;
      }
    } else if (legacy) {
      // Migrate existing custom tags from legacy pool
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy) && parsedLegacy.length) {
        const oldDefaults = ['design', 'startup', 'ecommerce', 'reference', 'tools', 'ai', 'reading'];
        const userCustom = parsedLegacy.filter(t => !oldDefaults.includes(t.toLowerCase()));
        saveState.tagPools.lib = Array.from(new Set([...DEFAULT_LIB_TAGS, ...userCustom]));
        saveState.tagPools.art = Array.from(new Set([...DEFAULT_ART_TAGS, ...userCustom]));
        saveTagPools();
      }
    }

    if (rawArt) {
      const parsed = JSON.parse(rawArt);
      if (Array.isArray(parsed) && parsed.length) {
        saveState.tagPools.art = parsed;
      }
    }
  } catch (e) {
    console.debug('Error loading tag pools:', e);
  }
}

function saveTagPools() {
  try {
    localStorage.setItem('bg-tagpool-lib', JSON.stringify(saveState.tagPools.lib));
    localStorage.setItem('bg-tagpool-art', JSON.stringify(saveState.tagPools.art));
  } catch (e) {}
}

loadTagPools();

// --- DOM & Helpers ---
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (str) => {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
};

const ICONS = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
  check: '<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.500l6.100-.9z"/></svg>',
  bm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/></svg>',
  art: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>'
};

const STATUS_OPTIONS = [
  ArticleStatus.WANT_TO_READ,
  ArticleStatus.IN_PROGRESS,
  ArticleStatus.DONE_READING
];

const TABS_CONFIG = [
  ['bm', 'Bookmarks'],
  ['lib', 'Library'],
  ['art', 'Article']
];

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initPopup() {
  // Pre-fetch active tab metadata eagerly in background for instant save interface readiness
  getActiveTabMetadata().then(meta => {
    if (meta && (meta.title || meta.url)) {
      if (!saveState.meta.title && !saveState.meta.url) {
        saveState.meta = meta;
      }
    }
  }).catch(() => {});

  // 1. Load layout settings & apply
  currentLayout = await settingsRepository.get('popupLayout') || LayoutType.GRID;
  applyLayout(currentLayout);

  // 2. Load root bookmarks for explorer view
  await loadBookmarks();

  // 3. Setup event listeners for navigation, layout buttons, search
  setupEventListeners();

  // 4. Default view is 'files' or from hash
  const initialView = window.location.hash === '#save' ? 'save' : (window.location.hash === '#settings' ? 'settings' : 'files');
  switchView(initialView);
}

// ============================================================================
// VIEW SWITCHING (Files, Save, Settings)
// ============================================================================

function switchView(viewName) {
  activeView = viewName;

  // 1. Update views visibility
  const viewFiles = $('#view-files');
  const viewSave = $('#view-save');
  const viewSettings = $('#view-settings');
  const layoutsControl = $('#layouts');

  if (viewFiles) viewFiles.style.display = viewName === 'files' ? 'flex' : 'none';
  if (viewSave) viewSave.style.display = viewName === 'save' ? 'flex' : 'none';
  if (viewSettings) viewSettings.style.display = viewName === 'settings' ? 'flex' : 'none';

  // 2. Toggle layout switcher visibility/state in top header
  if (layoutsControl) {
    layoutsControl.classList.toggle('off', viewName !== 'files');
  }

  // 3. Update bottom navigation active pills
  document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));
  const targetNav = $(`#nav-${viewName}`);
  if (targetNav) targetNav.classList.add('active');

  // 4. Trigger view-specific render
  if (viewName === 'save') {
    initAndRenderSavePanel();
  } else if (viewName === 'files') {
    renderBookmarks();
  }
}

// ============================================================================
// TOP HEADER LAYOUT SWITCHER
// ============================================================================

function applyLayout(layout) {
  currentLayout = layout;
  document.body.classList.remove('layout-list', 'layout-grid', 'layout-title');
  document.body.classList.add(`layout-${layout}`);

  // Update segmented control buttons
  const layoutBtns = document.querySelectorAll('#layouts button');
  layoutBtns.forEach(btn => {
    const isSelected = btn.dataset.l === layout;
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    btn.classList.toggle('active', isSelected);
  });
}

// ============================================================================
// BOOKMARK EXPLORER (FILES VIEW WITH DRAG & DROP MOVING)
// ============================================================================

async function loadBookmarks() {
  const tree = await chromeBookmarkRepository.getTree();
  allBookmarksFlattened = await chromeBookmarkRepository.getAllBookmarks();

  const root = tree[0];
  if (!root || !root.children) return;

  if (currentFolderId === null) {
    folderPathStack = [{ id: null, title: 'Bookmarks' }];
    currentNodes = root.children;
  } else {
    currentNodes = await chromeBookmarkRepository.getChildren(currentFolderId);
  }

  renderBreadcrumbs();
  renderBookmarks();
}

function renderBreadcrumbs() {
  const trail = $('#breadcrumb-trail');
  if (!trail) return;

  trail.textContent = '';
  folderPathStack.forEach((item, idx) => {
    const isLast = idx === folderPathStack.length - 1;
    if (isLast) {
      const current = document.createElement('span');
      current.className = 'crumb-current';
      current.textContent = item.title;
      trail.appendChild(current);
    } else {
      const link = document.createElement('span');
      link.className = 'crumb-link';
      link.dataset.index = idx;
      link.textContent = item.title;
      trail.appendChild(link);

      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '/';
      trail.appendChild(sep);
    }
  });

  trail.querySelectorAll('.crumb-link').forEach(el => {
    el.onclick = () => {
      const targetIdx = parseInt(el.dataset.index, 10);
      folderPathStack = folderPathStack.slice(0, targetIdx + 1);
      const target = folderPathStack[targetIdx];
      currentFolderId = target.id;
      loadBookmarks();
    };

    // Breadcrumb is also a drop target to move items up to ancestor folders!
    el.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    };

    el.ondragleave = () => {
      el.classList.remove('drag-over');
    };

    el.ondrop = async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const targetIdx = parseInt(el.dataset.index, 10);
      const targetCrumb = folderPathStack[targetIdx];
      const defaultId = await chromeBookmarkRepository.getDefaultFolderId();
      const targetFolderId = targetCrumb.id || defaultId;
      const sourceId = e.dataTransfer.getData('text/plain') || activeDragId;

      if (!sourceId || sourceId === targetFolderId) return;

      try {
        await chromeBookmarkRepository.move(sourceId, { parentId: targetFolderId });
        showToast(`Moved to ${targetCrumb.title}`);
        await loadBookmarks();
      } catch (err) {
        console.error('Failed to move to ancestor:', err);
        showToast(`Cannot move: ${err.message || 'Invalid target'}`, 'error');
      }
    };
  });
}

function renderBookmarks() {
  const container = $('#bookmarks-container');
  if (!container) return;

  const searchInput = $('#popup-search');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  let nodesToDisplay = currentNodes;

  if (query) {
    nodesToDisplay = allBookmarksFlattened.filter(b => {
      return (
        (b.title || '').toLowerCase().includes(query) ||
        (b.url || '').toLowerCase().includes(query) ||
        (b.folderName || '').toLowerCase().includes(query)
      );
    });
  }

  if (!nodesToDisplay || nodesToDisplay.length === 0) {
    container.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'empty-icon';
    emptyIcon.textContent = '📂';
    const emptyText = document.createElement('span');
    emptyText.className = 'empty-text';
    emptyText.textContent = query ? `No bookmarks match "${query}"` : 'This folder is empty';
    emptyDiv.appendChild(emptyIcon);
    emptyDiv.appendChild(emptyText);
    container.appendChild(emptyDiv);
    return;
  }

  container.textContent = '';
  nodesToDisplay.forEach(node => {
    const isFolder = !node.url;
    const title = node.title || (isFolder ? 'Folder' : extractDomain(node.url));
    const domain = node.url ? extractDomain(node.url) : 'Folder';
    const subText = node.url ? (currentLayout === LayoutType.LIST ? node.url : domain) : 'Folder';
    const favicon = node.url ? getFaviconUrl(node.url) : '';

    const item = document.createElement('div');
    item.className = `bookmark-item ${isFolder ? 'is-folder' : ''}`;
    item.dataset.id = node.id;
    item.dataset.url = node.url || '';
    item.dataset.folder = isFolder ? 'true' : 'false';
    item.dataset.title = title;
    item.draggable = true;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'item-icon';
    if (isFolder) {
      iconDiv.textContent = '📁';
    } else {
      const img = document.createElement('img');
      img.src = favicon;
      img.alt = '';
      img.onerror = () => { img.src = 'icon.svg'; };
      iconDiv.appendChild(img);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'item-content';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'item-title';
    titleDiv.title = title;
    titleDiv.textContent = title;

    const subDiv = document.createElement('div');
    subDiv.className = 'item-sub';
    subDiv.title = subText;
    subDiv.textContent = subText;

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(subDiv);

    item.appendChild(iconDiv);
    item.appendChild(contentDiv);

    container.appendChild(item);
  });

  // Attach click & drag-and-drop handlers to move folders and bookmarks
  container.querySelectorAll('.bookmark-item').forEach(el => {
    // Normal Click
    el.onclick = async () => {
      const isFolder = el.dataset.folder === 'true';
      const id = el.dataset.id;
      const url = el.dataset.url;
      const title = el.dataset.title;

      if (isFolder) {
        currentFolderId = id;
        folderPathStack.push({ id, title });
        if (searchInput) searchInput.value = '';
        const clearBtn = $('#search-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        await loadBookmarks();
      } else if (url) {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url });
        } else {
          window.open(url, '_blank');
        }
      }
    };

    // Drag Start
    el.ondragstart = (e) => {
      activeDragId = el.dataset.id;
      e.dataTransfer.setData('text/plain', el.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    };

    // Drag End
    el.ondragend = () => {
      el.classList.remove('dragging');
      activeDragId = null;
      container.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
      document.querySelectorAll('.crumb-link.drag-over').forEach(d => d.classList.remove('drag-over'));
    };

    // If item is a folder, accept drops to move items inside
    if (el.dataset.folder === 'true') {
      el.ondragover = (e) => {
        if (!activeDragId || activeDragId === el.dataset.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      };

      el.ondragleave = () => {
        el.classList.remove('drag-over');
      };

      el.ondrop = async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const targetFolderId = el.dataset.id;
        const targetTitle = el.dataset.title;
        const sourceId = e.dataTransfer.getData('text/plain') || activeDragId;

        if (!sourceId || sourceId === targetFolderId) return;

        try {
          await chromeBookmarkRepository.move(sourceId, { parentId: targetFolderId });
          showToast(`Moved to ${targetTitle}`);
          await loadBookmarks();
        } catch (err) {
          console.error('Failed to move item:', err);
          showToast(`Cannot move here: ${err.message || 'Invalid target'}`, 'error');
        }
      };
    }
  });
}

// ============================================================================
// SAVE PANEL (Matching exact structure, clean icon, removable tags, expandable notes)
// ============================================================================

function filterFolderTree(nodes) {
  if (!nodes) return [];
  return nodes
    .filter(n => !n.url)
    .map(n => ({
      id: n.id,
      title: n.title,
      children: filterFolderTree(n.children)
    }));
}

async function initAndRenderSavePanel() {
  const panel = $('#view-save');
  if (!panel) return;

  // Clear previous timer and reset saved state
  if (saveState.timer) clearTimeout(saveState.timer);
  panel.classList.remove('saved');

  // Load current active tab metadata if not already present
  if (!saveState.meta.url) {
    const meta = await getActiveTabMetadata();
    saveState.meta = meta;
  }

  // Load bookmark folders
  const tree = await chromeBookmarkRepository.getTree();
  const root = tree[0];
  const folders = root && root.children ? filterFolderTree(root.children) : [];
  saveState.bm.tree = folders;

  // Pick first folder as default if not already chosen
  const defaultFolderId = await chromeBookmarkRepository.getDefaultFolderId();
  if (folders.length && (!saveState.bm.folderId || saveState.bm.folderId === '1')) {
    const matchedFolder = folders.find(f => f.id === defaultFolderId) || folders[0];
    saveState.bm.folderId = matchedFolder.id;
    saveState.bm.folderName = matchedFolder.title;
    saveState.bm.open.add(matchedFolder.id);
  }

  // Load custom library folders
  const customFolders = await folderRepository.getCustomFolders();
  const defaultNames = ['Inbox', 'Research', 'Courses', 'Ideas'];
  const folderList = [...customFolders];
  for (const name of defaultNames) {
    if (!folderList.some(f => (f.name || '').toLowerCase() === name.toLowerCase())) {
      folderList.push({ id: 'def-' + name.toLowerCase(), name });
    }
  }
  saveState.lib.folders = folderList;
  if (!saveState.lib.folderId && folderList.length) {
    saveState.lib.folderId = folderList[0].id;
    saveState.lib.folderName = folderList[0].name;
  }

  renderSavePanel();
}

function renderSavePanel() {
  const panel = $('#view-save');
  if (!panel) return;

  const meta = saveState.meta;
  const initial = (meta.title || meta.domain || 'W').trim()[0].toUpperCase();

  panel.innerHTML = `
    <!-- Page Header (Clean Favicon with NO background box + Editable Title & URL + Close) -->
    <div class="save-page-header">
      <div class="save-fav" id="save-page-fav" aria-hidden="true"></div>
      <div class="save-meta">
        <input class="save-ed save-ed-title" id="save-input-title" placeholder="Title" aria-label="Title" value="${escapeHtml(meta.title || '')}">
        <input class="save-ed save-ed-url" id="save-input-url" placeholder="https://" aria-label="Link" spellcheck="false" value="${escapeHtml(meta.url || '')}">
      </div>
      <button class="save-close-btn" id="save-close-btn" aria-label="Close">&times;</button>
    </div>

    <!-- Navigation Tabs: Bookmarks, Library, Article -->
    <div class="save-tabs" id="save-tabs" role="tablist">
      <button role="tab" data-tab="bm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
        <span>Bookmarks</span>
      </button>
      <button role="tab" data-tab="lib">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/></svg>
        <span>Library</span>
      </button>
      <button role="tab" data-tab="art">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>
        <span>Article</span>
      </button>
    </div>

    <!-- Active Tab Pane -->
    <div class="save-pane" id="save-pane"></div>

    <!-- Save Footer -->
    <div class="save-foot">
      <button class="save-main-btn" id="save-submit-btn">Save</button>
      <div class="save-done-state" id="save-done-box" style="display: none;">
        <div class="save-done-check"><svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></div>
        <p class="save-done-text" id="save-done-text">Saved</p>
        <button class="save-undo-btn" id="save-undo-btn" type="button">Undo</button>
      </div>
      <div class="save-progress-bar" id="save-progress-bar" style="display: none;">
        <i></i>
      </div>
    </div>
  `;

  const favBox = $('#save-page-fav');
  if (favBox) {
    favBox.textContent = '';
    if (meta.favicon) {
      const img = document.createElement('img');
      img.src = meta.favicon;
      img.alt = '';
      img.onerror = () => {
        favBox.textContent = '';
        const fl = document.createElement('span');
        fl.className = 'fav-letter';
        fl.textContent = initial;
        favBox.appendChild(fl);
      };
      favBox.appendChild(img);
    } else {
      const fl = document.createElement('span');
      fl.className = 'fav-letter';
      fl.textContent = initial;
      favBox.appendChild(fl);
    }
  }

  // Active tab state
  panel.querySelectorAll('#save-tabs button').forEach(b => {
    const isSel = b.dataset.tab === saveState.tab;
    b.classList.toggle('active', isSel);
    b.setAttribute('aria-selected', isSel ? 'true' : 'false');
  });

  // Attach live editing on title & url
  const titleInp = $('#save-input-title');
  const urlInp = $('#save-input-url');
  if (titleInp) {
    titleInp.value = meta.title || '';
    titleInp.oninput = () => { saveState.meta.title = titleInp.value; };
  }
  if (urlInp) {
    urlInp.value = meta.url || '';
    urlInp.oninput = () => { saveState.meta.url = urlInp.value; };
  }

  // Close button switches back to files
  const closeBtn = $('#save-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => switchView('files');
  }

  // Tabs switching
  panel.querySelectorAll('#save-tabs button').forEach(btn => {
    btn.onclick = () => {
      saveState.tab = btn.dataset.tab;
      panel.querySelectorAll('#save-tabs button').forEach(b => {
        const isSel = b.dataset.tab === saveState.tab;
        b.classList.toggle('active', isSel);
        b.setAttribute('aria-selected', isSel ? 'true' : 'false');
      });
      renderSavePaneContent();
      updateSaveButtonLabel();
    };
  });

  // Render pane content and button label
  renderSavePaneContent();
  updateSaveButtonLabel();

  // Footer Save submit & undo
  const saveBtn = $('#save-submit-btn');
  if (saveBtn) {
    saveBtn.onclick = commitSave;
  }

  const undoBtn = $('#save-undo-btn');
  if (undoBtn) {
    undoBtn.onclick = undoSave;
  }
}

function appendTreeRows(container, folders, depth = 0) {
  folders.forEach(f => {
    const hasChildren = f.children && f.children.length > 0;
    const isOpen = saveState.bm.open.has(f.id);
    const isSelected = saveState.bm.folderId === f.id;

    const row = document.createElement('div');
    row.className = `save-tr ${isSelected ? 'sel' : ''}`;
    row.style.paddingLeft = `${depth * 14}px`;
    row.dataset.fid = f.id;
    row.dataset.ftitle = f.title || '';
    row.draggable = true;

    const expBtn = document.createElement('button');
    expBtn.className = `ch ${isOpen ? 'open' : ''} ${hasChildren ? '' : 'none'}`;
    expBtn.dataset.a = 'exp';
    expBtn.dataset.fid = f.id;
    expBtn.setAttribute('aria-label', 'Expand');
    expBtn.type = 'button';
    expBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'nm';
    nameBtn.dataset.a = 'tsel';
    nameBtn.dataset.fid = f.id;
    nameBtn.dataset.ftitle = f.title || '';
    nameBtn.type = 'button';
    nameBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6h7l2 2h9v11H3z"/></svg>';

    const span = document.createElement('span');
    span.textContent = f.title || '';
    nameBtn.appendChild(span);

    row.appendChild(expBtn);
    row.appendChild(nameBtn);
    container.appendChild(row);

    if (hasChildren && isOpen) {
      appendTreeRows(container, f.children, depth + 1);
    }
  });
}

function createTagsSectionElement(activeTagsSet) {
  const wrap = document.createElement('div');
  const lab = document.createElement('div');
  lab.className = 'save-lab';
  lab.textContent = 'Tags';
  wrap.appendChild(lab);

  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'save-chips';

  const currentTab = saveState.tab === 'art' ? 'art' : 'lib';
  const pool = saveState.tagPools[currentTab] || [];

  pool.forEach(t => {
    const isActive = activeTagsSet.has(t);
    const btn = document.createElement('button');
    btn.className = `save-chip ${isActive ? 'active' : ''}`;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.dataset.a = 'tag';
    btn.dataset.t = t;
    btn.type = 'button';

    const span = document.createElement('span');
    span.textContent = t;
    btn.appendChild(span);

    const del = document.createElement('span');
    del.className = 'chip-del';
    del.dataset.a = 'deltag';
    del.dataset.t = t;
    del.title = 'Remove tag';
    del.textContent = '×';
    btn.appendChild(del);

    chipsDiv.appendChild(btn);
  });

  const miniInp = document.createElement('input');
  miniInp.className = 'save-mini-in';
  miniInp.dataset.add = 'tag';
  miniInp.placeholder = '+ New tag';
  miniInp.maxLength = 24;
  miniInp.setAttribute('aria-label', 'New tag');
  chipsDiv.appendChild(miniInp);

  wrap.appendChild(chipsDiv);
  return wrap;
}

function renderSavePaneContent() {
  const pane = $('#save-pane');
  if (!pane) return;

  const t = saveState.tab;

  if (t === 'bm') {
    const bm = saveState.bm;
    pane.textContent = '';

    const rowsDiv = document.createElement('div');
    rowsDiv.className = 'save-rows';
    appendTreeRows(rowsDiv, bm.tree, 0);
    pane.appendChild(rowsDiv);

    if (bm.adding) {
      const inp = document.createElement('input');
      inp.className = 'save-mini-in';
      inp.style.cssText = 'width: 100%; border-radius: 10px; margin-top: 6px; height: 34px;';
      inp.dataset.add = 'folder';
      inp.placeholder = 'Folder name, then Enter';
      inp.setAttribute('aria-label', 'Folder name');
      pane.appendChild(inp);
    } else {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'save-row-more';
      moreBtn.dataset.a = 'newf';
      moreBtn.type = 'button';
      moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
      const moreSpan = document.createElement('span');
      moreSpan.textContent = ` New folder in ${bm.folderName}`;
      moreBtn.appendChild(moreSpan);
      pane.appendChild(moreBtn);
    }

    // Drag-and-drop moving of folders inside the tree
    let draggedFid = null;
    pane.querySelectorAll('.save-tr').forEach(row => {
      row.ondragstart = (e) => {
        draggedFid = row.dataset.fid;
        e.dataTransfer.setData('text/plain', draggedFid);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      };

      row.ondragend = () => {
        row.classList.remove('dragging');
        draggedFid = null;
        pane.querySelectorAll('.save-tr.drag-over').forEach(r => r.classList.remove('drag-over'));
      };

      row.ondragover = (e) => {
        if (!draggedFid || draggedFid === row.dataset.fid) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      };

      row.ondragleave = () => {
        row.classList.remove('drag-over');
      };

      row.ondrop = async (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const targetFid = row.dataset.fid;
        const targetTitle = row.dataset.ftitle;
        const sourceId = e.dataTransfer.getData('text/plain') || draggedFid;

        if (!sourceId || sourceId === targetFid) return;

        try {
          await chromeBookmarkRepository.move(sourceId, { parentId: targetFid });
          showToast(`Moved to ${targetTitle}`);
          saveState.bm.open.add(targetFid);
          const updatedTree = await chromeBookmarkRepository.getTree();
          const rootNode = updatedTree[0];
          saveState.bm.tree = rootNode && rootNode.children ? filterFolderTree(rootNode.children) : [];
          renderSavePaneContent();
        } catch (err) {
          console.error('Failed to move tree folder:', err);
          showToast(`Cannot move: ${err.message || 'Invalid target'}`, 'error');
        }
      };
    });

  } else if (t === 'lib') {
    const lib = saveState.lib;
    pane.textContent = '';

    const fGroup = document.createElement('div');
    const fLab = document.createElement('div');
    fLab.className = 'save-lab';
    const fLabSpan = document.createElement('span');
    fLabSpan.textContent = 'Folder';
    const addLfBtn = document.createElement('button');
    addLfBtn.className = 'save-plus-btn';
    addLfBtn.dataset.a = 'addlf';
    addLfBtn.setAttribute('aria-label', 'New library folder');
    addLfBtn.title = 'Add folder';
    addLfBtn.type = 'button';
    addLfBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    fLab.appendChild(fLabSpan);
    fLab.appendChild(addLfBtn);
    fGroup.appendChild(fLab);

    const fChips = document.createElement('div');
    fChips.className = 'save-chips';
    lib.folders.forEach(f => {
      const isActive = lib.folderId === f.id;
      const chip = document.createElement('button');
      chip.className = `save-chip ${isActive ? 'active' : ''}`;
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      chip.dataset.a = 'lf';
      chip.dataset.fid = f.id;
      chip.dataset.fname = f.name;
      chip.type = 'button';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = f.name;
      chip.appendChild(nameSpan);

      const delSpan = document.createElement('span');
      delSpan.className = 'chip-del';
      delSpan.dataset.a = 'dellf';
      delSpan.dataset.fid = f.id;
      delSpan.dataset.fname = f.name;
      delSpan.title = 'Remove folder';
      delSpan.textContent = '×';
      chip.appendChild(delSpan);

      fChips.appendChild(chip);
    });

    if (lib.addingFolder) {
      const folderInp = document.createElement('input');
      folderInp.className = 'save-mini-in';
      folderInp.dataset.add = 'lfolder';
      folderInp.placeholder = 'Folder name';
      folderInp.maxLength = 30;
      folderInp.setAttribute('aria-label', 'New library folder name');
      fChips.appendChild(folderInp);
    }
    fGroup.appendChild(fChips);
    pane.appendChild(fGroup);

    pane.appendChild(createTagsSectionElement(lib.tags));

    const nGroup = document.createElement('div');
    const nLab = document.createElement('div');
    nLab.className = 'save-lab';
    nLab.textContent = 'Notes';
    nGroup.appendChild(nLab);

    const notesArea = document.createElement('textarea');
    notesArea.id = 'save-lib-notes';
    notesArea.placeholder = 'Add a note (drag corner to expand)';
    notesArea.value = lib.notes || '';
    nGroup.appendChild(notesArea);
    pane.appendChild(nGroup);

    const favGroup = document.createElement('div');
    const favBtn = document.createElement('button');
    favBtn.className = `save-star ${lib.fav ? 'active' : ''}`;
    favBtn.dataset.a = 'fav';
    favBtn.setAttribute('aria-pressed', lib.fav ? 'true' : 'false');
    favBtn.type = 'button';
    favBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.500l6.100-.9z"/></svg>';
    const favSpan = document.createElement('span');
    favSpan.textContent = 'Favorite';
    favBtn.appendChild(favSpan);
    favGroup.appendChild(favBtn);
    pane.appendChild(favGroup);

    notesArea.oninput = () => {
      saveState.lib.notes = notesArea.value;
      notesArea.style.height = 'auto';
      notesArea.style.height = Math.max(68, notesArea.scrollHeight + 2) + 'px';
    };
  } else if (t === 'art') {
    const art = saveState.art;
    pane.textContent = '';

    const stGroup = document.createElement('div');
    const stLab = document.createElement('div');
    stLab.className = 'save-lab';
    stLab.textContent = 'Reading status';
    stGroup.appendChild(stLab);

    const segDiv = document.createElement('div');
    segDiv.className = 'save-seg';
    STATUS_OPTIONS.forEach(s => {
      const isActive = art.status === s;
      const sBtn = document.createElement('button');
      sBtn.className = isActive ? 'active' : '';
      sBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      sBtn.dataset.a = 'status';
      sBtn.dataset.s = s;
      sBtn.type = 'button';
      sBtn.textContent = s;
      segDiv.appendChild(sBtn);
    });
    stGroup.appendChild(segDiv);
    pane.appendChild(stGroup);

    if (saveState.meta.coverImage) {
      const coverDiv = document.createElement('div');
      coverDiv.className = 'article-cover-preview';
      coverDiv.style.cssText = 'margin-top: 4px; border-radius: 10px; overflow: hidden; height: 90px; position: relative; border: 1px solid rgba(255,255,255,0.1);';

      const coverImg = document.createElement('img');
      coverImg.src = saveState.meta.coverImage;
      coverImg.alt = 'Cover preview';
      coverImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      coverImg.onerror = () => { coverDiv.style.display = 'none'; };

      const badge = document.createElement('span');
      badge.style.cssText = 'position: absolute; bottom: 6px; left: 8px; font-size: 10px; padding: 2px 7px; border-radius: 999px; background: rgba(0,0,0,0.65); color: var(--accent);';
      badge.textContent = 'Cover detected';

      coverDiv.appendChild(coverImg);
      coverDiv.appendChild(badge);
      pane.appendChild(coverDiv);
    }

    pane.appendChild(createTagsSectionElement(art.tags));

    const nGroup = document.createElement('div');
    const nLab = document.createElement('div');
    nLab.className = 'save-lab';
    nLab.textContent = 'Notes / Takeaways';
    nGroup.appendChild(nLab);

    const notesArea = document.createElement('textarea');
    notesArea.id = 'save-art-notes';
    notesArea.placeholder = 'Key takeaways (drag corner to expand)';
    notesArea.value = art.notes || '';
    nGroup.appendChild(notesArea);
    pane.appendChild(nGroup);

    notesArea.oninput = () => {
      saveState.art.notes = notesArea.value;
      notesArea.style.height = 'auto';
      notesArea.style.height = Math.max(68, notesArea.scrollHeight + 2) + 'px';
    };
  }

  // Focus inline inputs if currently adding
  const autoFocusInp = pane.querySelector('[data-add]');
  if (autoFocusInp && (saveState.bm.adding || saveState.lib.addingFolder)) {
    autoFocusInp.focus();
  }

  // Attach pane click handlers
  pane.onclick = async (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    const d = el.dataset;

    if (a === 'deltag') {
      // Remove tag from section tag pool
      e.stopPropagation();
      e.preventDefault();
      const tagToRemove = d.t;
      const currentTab = saveState.tab === 'art' ? 'art' : 'lib';
      saveState.tagPools[currentTab] = saveState.tagPools[currentTab].filter(t => t !== tagToRemove);
      saveTagPools();
      saveState[currentTab].tags.delete(tagToRemove);
      renderSavePaneContent();
      return;
    } else if (a === 'dellf') {
      // Remove library folder
      e.stopPropagation();
      e.preventDefault();
      const folderIdToRemove = d.fid;
      const folderNameToRemove = d.fname;

      try {
        await folderRepository.deleteCustomFolder(folderIdToRemove);
      } catch (err) {
        console.warn('Could not delete folder:', err);
      }

      saveState.lib.folders = saveState.lib.folders.filter(f => f.id !== folderIdToRemove);

      if (saveState.lib.folderId === folderIdToRemove) {
        if (saveState.lib.folders.length > 0) {
          saveState.lib.folderId = saveState.lib.folders[0].id;
          saveState.lib.folderName = saveState.lib.folders[0].name;
        } else {
          saveState.lib.folderId = '';
          saveState.lib.folderName = 'Library';
        }
      }

      showToast(`Removed folder "${folderNameToRemove}"`);
      renderSavePaneContent();
      updateSaveButtonLabel();
      return;
    } else if (a === 'exp') {
      const fid = d.fid;
      if (saveState.bm.open.has(fid)) {
        saveState.bm.open.delete(fid);
      } else {
        saveState.bm.open.add(fid);
      }
      renderSavePaneContent();
    } else if (a === 'tsel') {
      saveState.bm.folderId = d.fid;
      saveState.bm.folderName = d.ftitle;
      saveState.bm.adding = false;
      renderSavePaneContent();
      updateSaveButtonLabel();
    } else if (a === 'newf') {
      saveState.bm.adding = true;
      renderSavePaneContent();
    } else if (a === 'lf') {
      saveState.lib.folderId = d.fid;
      saveState.lib.folderName = d.fname;
      renderSavePaneContent();
      updateSaveButtonLabel();
    } else if (a === 'addlf') {
      saveState.lib.addingFolder = !saveState.lib.addingFolder;
      renderSavePaneContent();
    } else if (a === 'tag') {
      const tag = d.t;
      const set = saveState[saveState.tab].tags;
      if (set.has(tag)) set.delete(tag);
      else set.add(tag);
      renderSavePaneContent();
    } else if (a === 'status') {
      saveState.art.status = d.s;
      renderSavePaneContent();
      updateSaveButtonLabel();
    } else if (a === 'fav') {
      saveState.lib.fav = !saveState.lib.fav;
      renderSavePaneContent();
    }
  };

  // Attach pane keydown handlers for inline inputs (Enter to add, Escape to cancel)
  pane.onkeydown = async (e) => {
    const inp = e.target.closest('[data-add]');
    if (!inp) return;

    if (e.key === 'Escape') {
      e.stopPropagation();
      saveState.bm.adding = false;
      saveState.lib.addingFolder = false;
      renderSavePaneContent();
      return;
    }

    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();

    const val = inp.value.trim().replace(/\//g, '');
    if (!val) return;

    const action = inp.dataset.add;

    if (action === 'tag') {
      const currentTab = saveState.tab === 'art' ? 'art' : 'lib';
      const pool = saveState.tagPools[currentTab] || [];
      const trimmed = val.trim();
      const existingIdx = pool.findIndex(t => t.toLowerCase() === trimmed.toLowerCase());
      const finalTag = existingIdx !== -1 ? pool[existingIdx] : trimmed;
      if (existingIdx === -1) {
        pool.push(finalTag);
        saveTagPools();
      }
      saveState[currentTab].tags.add(finalTag);
      renderSavePaneContent();
      const nextInp = pane.querySelector('[data-add="tag"]');
      if (nextInp) nextInp.focus();
    } else if (action === 'lfolder') {
      const created = await folderRepository.createCustomFolder(val);
      saveState.lib.folders.push(created);
      saveState.lib.folderId = created.id;
      saveState.lib.folderName = created.name;
      saveState.lib.addingFolder = false;
      renderSavePaneContent();
      updateSaveButtonLabel();
    } else if (action === 'folder') {
      const parentId = saveState.bm.folderId || await chromeBookmarkRepository.getDefaultFolderId();
      const created = await chromeBookmarkRepository.createFolder(val, parentId);
      saveState.bm.open.add(parentId);
      saveState.bm.folderId = created.id;
      saveState.bm.folderName = created.title;
      saveState.bm.adding = false;

      // Refresh Chrome tree
      const updatedTree = await chromeBookmarkRepository.getTree();
      const rootNode = updatedTree[0];
      saveState.bm.tree = rootNode && rootNode.children ? filterFolderTree(rootNode.children) : [];

      renderSavePaneContent();
      updateSaveButtonLabel();
    }
  };
}

function updateSaveButtonLabel() {
  const btn = $('#save-submit-btn');
  if (!btn) return;

  const t = saveState.tab;
  if (t === 'bm') {
    btn.textContent = `Save to ${saveState.bm.folderName || 'Bookmarks bar'}`;
  } else if (t === 'lib') {
    btn.textContent = `Save to ${saveState.lib.folderName || 'Library'}`;
  } else if (t === 'art') {
    btn.textContent = `Save · ${saveState.art.status}`;
  }
}

async function commitSave() {
  const titleInp = $('#save-input-title');
  const urlInp = $('#save-input-url');
  const title = (titleInp ? titleInp.value.trim() : '') || saveState.meta.title || saveState.meta.domain || 'Saved Page';
  const url = (urlInp ? urlInp.value.trim() : '') || saveState.meta.url;

  if (!url) {
    alert('Invalid or empty URL');
    return;
  }

  let savedItem = null;
  let targetName = '';
  const currentTab = saveState.tab;

  try {
    if (currentTab === 'bm') {
      const parentId = saveState.bm.folderId || await chromeBookmarkRepository.getDefaultFolderId();
      savedItem = await chromeBookmarkRepository.create({ parentId, title, url });
      targetName = saveState.bm.folderName || 'Bookmarks bar';
    } else if (currentTab === 'lib') {
      const lib = saveState.lib;
      savedItem = await libraryRepository.create({
        title,
        url,
        favicon: saveState.meta.favicon,
        description: saveState.meta.description,
        folderId: lib.folderId,
        tags: Array.from(lib.tags),
        notes: lib.notes,
        favorite: lib.fav
      });
      targetName = 'Library › ' + (lib.folderName || 'Inbox');
    } else if (currentTab === 'art') {
      const art = saveState.art;
      savedItem = await articleRepository.create({
        title,
        url,
        favicon: saveState.meta.favicon,
        coverImage: saveState.meta.coverImage,
        readingStatus: art.status,
        tags: Array.from(art.tags),
        notes: art.notes
      });
      targetName = 'Articles';
    }

    saveState.lastSaved = {
      source: currentTab,
      id: savedItem ? savedItem.id : null,
      targetName
    };

    // Transition footer to done state with animated drain bar
    const panel = $('#view-save');
    if (panel) panel.classList.add('saved');

    const doneText = $('#save-done-text');
    if (doneText) doneText.textContent = `Saved to ${targetName}`;

    const saveBtn = $('#save-submit-btn');
    const doneBox = $('#save-done-box');
    const progBar = $('#save-progress-bar');

    if (saveBtn) saveBtn.style.display = 'none';
    if (doneBox) doneBox.style.display = 'flex';
    if (progBar) {
      progBar.style.display = 'block';
      const fill = progBar.querySelector('i');
      if (fill) {
        fill.style.animation = 'none';
        void fill.offsetWidth; // re-flow
        fill.style.animation = 'save-drain 3.5s linear forwards';
      }
    }

    // Auto-close / return to files after 3.8s
    if (saveState.timer) clearTimeout(saveState.timer);
    saveState.timer = setTimeout(async () => {
      await loadBookmarks();
      switchView('files');
    }, 3800);

  } catch (err) {
    console.error('Error committing save:', err);
    alert('Failed to save bookmark: ' + err.message);
  }
}

async function undoSave() {
  if (saveState.timer) clearTimeout(saveState.timer);

  if (saveState.lastSaved && saveState.lastSaved.id) {
    const { source, id } = saveState.lastSaved;
    try {
      if (source === 'bm') {
        await chromeBookmarkRepository.remove(id);
      } else if (source === 'lib') {
        await libraryRepository.delete(id);
      } else if (source === 'art') {
        await articleRepository.delete(id);
      }
    } catch (e) {
      console.warn('Failed to undo deletion:', e);
    }
  }

  saveState.lastSaved = null;

  // Restore panel view
  const panel = $('#view-save');
  if (panel) panel.classList.remove('saved');

  const saveBtn = $('#save-submit-btn');
  const doneBox = $('#save-done-box');
  const progBar = $('#save-progress-bar');

  if (saveBtn) saveBtn.style.display = 'flex';
  if (doneBox) doneBox.style.display = 'none';
  if (progBar) progBar.style.display = 'none';
}

// ============================================================================
// EVENT LISTENERS & SETUP
// ============================================================================

function setupEventListeners() {
  // Search bar in files explorer
  const searchInput = $('#popup-search');
  const clearBtn = $('#search-clear');

  if (searchInput) {
    searchInput.oninput = () => {
      const hasVal = Boolean(searchInput.value.trim());
      if (clearBtn) clearBtn.style.display = hasVal ? 'block' : 'none';
      renderBookmarks();
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearBtn.style.display = 'none';
      renderBookmarks();
    };
  }

  // Top header Layout Switcher buttons (Title, List, Grid)
  const layoutButtons = document.querySelectorAll('#layouts button');
  layoutButtons.forEach(btn => {
    btn.onclick = async () => {
      const layout = btn.dataset.l;
      if (!layout) return;
      await settingsRepository.update({ popupLayout: layout });
      applyLayout(layout);
      if (activeView === 'files') {
        renderBookmarks();
      }
    };
  });

  // Bottom Navigation Links
  const navHome = $('#nav-home');
  const navFiles = $('#nav-files');
  const navSave = $('#nav-save');
  const navSettings = $('#nav-settings');

  // Home: Open full Dashboard in new tab
  if (navHome) {
    navHome.onclick = (e) => {
      e.preventDefault();
      const dashboardUrl = (typeof chrome !== 'undefined' && chrome.runtime)
        ? chrome.runtime.getURL('dashboard.html')
        : 'dashboard.html';

      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: dashboardUrl });
      } else {
        window.open(dashboardUrl, '_blank');
      }
    };
  }

  // Files: Show Chrome Bookmarks explorer
  if (navFiles) {
    navFiles.onclick = (e) => {
      e.preventDefault();
      switchView('files');
    };
  }

  // Save: Show quick save interface matching save-button.html
  if (navSave) {
    navSave.onclick = (e) => {
      e.preventDefault();
      switchView('save');
    };
  }

  // Settings: Show settings view matching screenshot
  if (navSettings) {
    navSettings.onclick = (e) => {
      e.preventDefault();
      switchView('settings');
    };
  }

  // Open Dashboard Settings button inside Settings view
  const btnOpenSettings = $('#btn-open-dashboard-settings');
  if (btnOpenSettings) {
    btnOpenSettings.onclick = () => {
      const dashboardUrl = (typeof chrome !== 'undefined' && chrome.runtime)
        ? chrome.runtime.getURL('dashboard.html')
        : 'dashboard.html';

      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: dashboardUrl });
      } else {
        window.open(dashboardUrl, '_blank');
      }
    };
  }

  // External Chrome bookmark changes
  chromeBookmarkRepository.subscribe(() => {
    if (activeView === 'files') {
      loadBookmarks();
    }
  });

  // Global keydown: Escape returns to files if in save/settings view
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activeView === 'save' || activeView === 'settings') {
        switchView('files');
      }
    }
  });
}

// Bootstrap
initPopup();
