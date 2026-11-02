import { chromeBookmarkRepository } from './core/repositories/chrome-bookmarks.js';
import { libraryRepository } from './core/repositories/library-repository.js';
import { articleRepository } from './core/repositories/article-repository.js';
import { folderRepository } from './core/repositories/folder-repository.js';
import { settingsRepository } from './core/repositories/settings-repository.js';
import { searchService } from './core/services/search-service.js';
import { dragDropService } from './core/services/drag-drop-service.js';
import { openSaveDialog } from './ui/save-dialog.js';
import { openFolderMenu } from './ui/folder-menu.js';
import { confirmAction } from './ui/confirm-dialog.js';
import { showToast } from './ui/toast.js';
import { LayoutType, ArticleStatus, extractDomain, getFaviconUrl } from './core/types.js';

// Application State
let activeSection = 'all-bookmarks'; // 'all-bookmarks' | 'bookmark-bar' | 'folders' | 'my-library' | 'articles' | 'settings' | 'folder-view'
let selectedFolderId = null;
let currentDashboardLayout = LayoutType.GRID;
let currentRenderToken = 0;

// Article State
let articleSearchQuery = '';
let articleStatusFilters = []; // ['Want to Read', 'In Progress', 'Done Reading']
let articleSortBy = 'newest_saved';
let articleViewMode = 'card'; // 'card' | 'title'

// Cache
let chromeBookmarksCache = [];
let libraryCache = [];
let articlesCache = [];
let foldersCache = [];

const $ = (s) => document.querySelector(s);
const escapeHtml = (str) => {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
};

async function initDashboard() {
  // 1. Load settings
  const settings = await settingsRepository.getAll();
  currentDashboardLayout = settings.dashboardLayout || LayoutType.GRID;
  articleViewMode = settings.articleView || 'card';
  applyDashboardLayout(currentDashboardLayout);

  // 2. Setup Listeners
  setupNavigation();
  setupGlobalSearch();
  setupLayoutButtons();

  // 3. Subscribe to repositories for real-time reactive sync
  chromeBookmarkRepository.subscribe(() => refreshCurrentView());
  libraryRepository.subscribe(() => refreshCurrentView());
  articleRepository.subscribe(() => refreshCurrentView());
  folderRepository.subscribe(() => refreshSidebarFolders());

  // 4. Initial load
  await refreshCounts();
  await refreshSidebarFolders();
  await renderSection(activeSection);
}

function applyDashboardLayout(layout) {
  currentDashboardLayout = layout;
  const wrapper = $('#items-grid-wrapper');
  if (wrapper) {
    wrapper.className = `items-grid-wrapper layout-${layout}`;
  }

  document.querySelectorAll('#dashboard-layout-group .layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });
}

async function refreshCounts() {
  const [allChrome, barItems, folders, library, articles] = await Promise.all([
    chromeBookmarkRepository.getAllBookmarks(),
    chromeBookmarkRepository.getBookmarkBar(),
    chromeBookmarkRepository.getFolders(),
    libraryRepository.getAll(),
    articleRepository.getAll()
  ]);

  chromeBookmarksCache = allChrome;
  libraryCache = library;
  articlesCache = articles;
  foldersCache = folders;

  if ($('#badge-all')) $('#badge-all').textContent = allChrome.length;
  if ($('#badge-bar')) $('#badge-bar').textContent = barItems.length;
  if ($('#badge-folders')) $('#badge-folders').textContent = folders.length;
  if ($('#badge-library')) $('#badge-library').textContent = library.length;
  if ($('#badge-articles')) $('#badge-articles').textContent = articles.length;
}

async function refreshSidebarFolders() {
  const container = $('#sidebar-folders-list');
  if (!container) return;

  const [folders, colorMap] = await Promise.all([
    chromeBookmarkRepository.getFolders(),
    folderRepository.getVisualMetadataMap()
  ]);

  container.textContent = '';
  folders.forEach(f => {
    const meta = colorMap[f.id];
    const color = meta?.colorId ? (meta.colorId === 'default' ? 'rgba(255,255,255,0.7)' : meta.colorId) : 'rgba(255,255,255,0.4)';

    const btn = document.createElement('button');
    btn.className = `folder-tree-item ${selectedFolderId === f.id ? 'active' : ''}`;
    btn.dataset.id = f.id;
    btn.title = f.path || f.title;

    const dot = document.createElement('span');
    dot.className = 'folder-color-dot';
    dot.style.backgroundColor = color;

    const titleSpan = document.createElement('span');
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';
    titleSpan.style.flex = '1';
    titleSpan.textContent = f.title;

    const countSpan = document.createElement('span');
    countSpan.style.fontSize = '10px';
    countSpan.style.opacity = '0.5';
    countSpan.textContent = String(f.childrenCount || 0);

    btn.appendChild(dot);
    btn.appendChild(titleSpan);
    btn.appendChild(countSpan);

    btn.onclick = () => {
      selectedFolderId = btn.dataset.id;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.folder-tree-item').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      renderFolderView(selectedFolderId);
    };

    container.appendChild(btn);
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = async () => {
      const section = btn.dataset.section;
      if (!section) return;

      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.folder-tree-item').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');

      selectedFolderId = null;
      activeSection = section;
      await renderSection(activeSection);
    };
  });

  // Save new link button
  $('#btn-save-new').onclick = () => {
    openSaveDialog({
      defaultDestination: activeSection === 'my-library' ? 'library' : (activeSection === 'articles' ? 'article' : 'chrome'),
      onSaved: async () => {
        await refreshCounts();
        await refreshCurrentView();
      }
    });
  };

  // Add Bookmark folder from sidebar
  $('#sidebar-add-chrome-folder').onclick = async () => {
    const name = prompt('Create new Bookmark Folder:');
    if (!name || !name.trim()) return;
    await chromeBookmarkRepository.createFolder(name.trim());
    showToast(`Created folder "${name.trim()}"`);
    await refreshSidebarFolders();
    await refreshCounts();
  };
}

function setupLayoutButtons() {
  document.querySelectorAll('#dashboard-layout-group .layout-btn').forEach(btn => {
    btn.onclick = async () => {
      const layout = btn.dataset.layout;
      await settingsRepository.update({ dashboardLayout: layout });
      applyDashboardLayout(layout);
    };
  });
}

function setupGlobalSearch() {
  const searchInput = $('#global-search');
  const clearBtn = $('#search-clear-btn');
  const searchView = $('#view-search-results');
  const primaryView = $('#view-primary');
  const resultsList = $('#search-results-list');
  const resultsCount = $('#search-results-count');

  let debounceTimer = null;

  const performSearch = async () => {
    const q = searchInput.value.trim();
    if (!q) {
      clearBtn.style.display = 'none';
      searchView.style.display = 'none';
      primaryView.style.display = 'block';
      return;
    }

    clearBtn.style.display = 'block';
    searchView.style.display = 'block';
    primaryView.style.display = 'none';

    const results = await searchService.searchAll(q);
    resultsCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'} across all sources`;

    resultsList.textContent = '';

    if (results.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      const icon = document.createElement('span');
      icon.className = 'empty-icon';
      icon.textContent = '🔍';
      const text = document.createElement('span');
      text.className = 'empty-text';
      text.textContent = `No matches found for "${q}"`;
      emptyDiv.appendChild(icon);
      emptyDiv.appendChild(text);
      resultsList.appendChild(emptyDiv);
      return;
    }

    results.forEach(res => {
      const favicon = res.favicon || (res.url ? getFaviconUrl(res.url) : '');
      const row = document.createElement('div');
      row.className = 'search-result-row';
      row.dataset.url = res.url || '';
      row.dataset.folderId = res.isFolder ? res.id : '';

      const iconDiv = document.createElement('div');
      iconDiv.className = 'result-icon';
      if (res.isFolder) {
        iconDiv.textContent = '📁';
      } else {
        const img = document.createElement('img');
        img.src = favicon;
        img.alt = '';
        img.onerror = () => { img.src = 'icon.svg'; };
        iconDiv.appendChild(img);
      }

      const infoDiv = document.createElement('div');
      infoDiv.className = 'result-info';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'result-title';
      titleDiv.textContent = res.title || 'Untitled';

      const subDiv = document.createElement('div');
      subDiv.className = 'result-sub';
      subDiv.textContent = res.subtext || res.url || '';

      infoDiv.appendChild(titleDiv);
      infoDiv.appendChild(subDiv);

      const tagSpan = document.createElement('span');
      tagSpan.className = `source-tag source-${res.source}`;
      tagSpan.textContent = res.sourceLabel;

      row.appendChild(iconDiv);
      row.appendChild(infoDiv);
      row.appendChild(tagSpan);

      resultsList.appendChild(row);
    });

    resultsList.querySelectorAll('.search-result-row').forEach(row => {
      row.onclick = () => {
        const url = row.dataset.url;
        const folderId = row.dataset.folderId;
        if (url) {
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.create({ url });
          } else {
            window.open(url, '_blank');
          }
        } else if (folderId) {
          // Open folder view
          selectedFolderId = folderId;
          searchView.style.display = 'none';
          primaryView.style.display = 'block';
          searchInput.value = '';
          clearBtn.style.display = 'none';
          renderFolderView(folderId);
        }
      };
    });
  };

  searchInput.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 150);
  };

  clearBtn.onclick = () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    searchView.style.display = 'none';
    primaryView.style.display = 'block';
  };

  $('#search-close-results').onclick = () => {
    clearBtn.click();
  };
}

async function refreshCurrentView() {
  await refreshCounts();
  if (selectedFolderId) {
    await renderFolderView(selectedFolderId);
  } else {
    await renderSection(activeSection);
  }
}

async function renderSection(section) {
  const renderToken = ++currentRenderToken;
  const heading = $('#section-heading');
  const subtext = $('#section-subtext');
  const controls = $('#section-controls');
  const container = $('#items-grid-wrapper');

  controls.innerHTML = '';
  container.textContent = '';

  if (section === 'articles' || section === 'settings') {
    $('#dashboard-layout-group').style.display = 'none';
  } else {
    $('#dashboard-layout-group').style.display = 'flex';
    applyDashboardLayout(currentDashboardLayout);
  }

  switch (section) {
    case 'all-bookmarks':
      heading.textContent = 'All Bookmarks';
      subtext.textContent = 'Complete hierarchy of synchronized browser bookmarks';
      await renderAllBookmarksView(renderToken);
      break;

    case 'bookmark-bar':
      heading.textContent = 'Bookmark Bar';
      subtext.textContent = 'Live items on your browser bookmark bar — drag to reorder';
      await renderBookmarkBarView(renderToken);
      break;

    case 'folders':
      heading.textContent = 'Folders';
      subtext.textContent = 'Manage bookmark folders, colors, and organization';
      await renderFoldersView(renderToken);
      break;

    case 'my-library':
      heading.textContent = 'My Library';
      subtext.textContent = 'Personal link archive with custom tags, notes, and favorites';
      await renderLibraryView(renderToken);
      break;

    case 'articles':
      heading.textContent = 'Articles';
      subtext.textContent = 'Reading tracker for essays, documentation, and articles';
      await renderArticlesView(renderToken);
      break;

    case 'settings':
      heading.textContent = 'Settings';
      subtext.textContent = 'Preferences, layout defaults, and application configuration';
      await renderSettingsView(renderToken);
      break;
  }
}

// --------------------------------------------------------------------------
// SECTION 1: ALL BOOKMARKS
// --------------------------------------------------------------------------
async function renderAllBookmarksView(renderToken) {
  const container = $('#items-grid-wrapper');
  const bookmarks = await chromeBookmarkRepository.getAllBookmarks();
  if (renderToken !== currentRenderToken) return;

  if (bookmarks.length === 0) {
    setEmptyState(container, '🔖', 'No bookmarks found. Save your first page!');
    return;
  }

  container.textContent = '';
  bookmarks.forEach((b, i) => {
    container.appendChild(createBookmarkCardElement(b, 'chrome', i));
  });
  attachBookmarkCardHandlers(container, bookmarks, 'chrome');
}

// --------------------------------------------------------------------------
// SECTION 2: BOOKMARK BAR (Dedicated view with real drag reordering)
// --------------------------------------------------------------------------
async function renderBookmarkBarView(renderToken) {
  const container = $('#items-grid-wrapper');
  const barItems = await chromeBookmarkRepository.getBookmarkBar();
  if (renderToken !== currentRenderToken) return;

  if (barItems.length === 0) {
    setEmptyState(container, '⭐', 'Bookmark Bar is empty. Drag or save bookmarks here!');
    return;
  }

  container.textContent = '';
  barItems.forEach((item, index) => {
    if (item.url) {
      container.appendChild(createBookmarkCardElement({
        id: item.id,
        title: item.title,
        url: item.url,
        domain: extractDomain(item.url),
        favicon: getFaviconUrl(item.url),
        source: 'chrome'
      }, 'chrome', index));
    } else {
      container.appendChild(createFolderCardElement({
        id: item.id,
        title: item.title,
        childrenCount: (item.children || []).length,
        source: 'chrome'
      }, index));
    }
  });

  attachBookmarkCardHandlers(container, barItems, 'chrome', true);
}

// --------------------------------------------------------------------------
// SECTION 3: FOLDERS VIEW
// --------------------------------------------------------------------------
async function renderFoldersView(renderToken) {
  const container = $('#items-grid-wrapper');
  const controls = $('#section-controls');

  controls.textContent = '';
  const newFolderBtn = document.createElement('button');
  newFolderBtn.className = 'glass-btn btn-sm btn-primary';
  newFolderBtn.id = 'btn-create-folder-top';
  newFolderBtn.textContent = '+ New Folder';
  newFolderBtn.onclick = async () => {
    const name = prompt('Enter new folder name:');
    if (!name || !name.trim()) return;
    await chromeBookmarkRepository.createFolder(name.trim());
    showToast(`Created folder "${name.trim()}"`);
    await renderFoldersView(++currentRenderToken);
    await refreshSidebarFolders();
  };
  controls.appendChild(newFolderBtn);

  const [chromeFolders, colorMap] = await Promise.all([
    chromeBookmarkRepository.getFolders(),
    folderRepository.getVisualMetadataMap()
  ]);
  if (renderToken !== currentRenderToken) return;

  if (chromeFolders.length === 0) {
    setEmptyState(container, '📁', 'No folders found');
    return;
  }

  container.textContent = '';
  chromeFolders.forEach(f => {
    const meta = colorMap[f.id];
    const color = meta?.colorId ? (meta.colorId === 'default' ? 'rgba(255,255,255,0.7)' : meta.colorId) : 'rgba(255,255,255,0.4)';

    const card = document.createElement('div');
    card.className = 'folder-card';
    card.dataset.id = f.id;
    card.dataset.title = f.title || '';

    const accent = document.createElement('div');
    accent.className = 'folder-card-accent';
    accent.style.backgroundColor = color;

    const iconBox = document.createElement('div');
    iconBox.className = 'card-icon-box';
    iconBox.textContent = '📁';

    const details = document.createElement('div');
    details.className = 'card-details';

    const titleEl = document.createElement('div');
    titleEl.className = 'card-title-text';
    titleEl.textContent = f.title || '';

    const subText = document.createElement('div');
    subText.className = 'card-sub-text';
    subText.textContent = `${f.path || ''} • ${f.childrenCount || 0} item${f.childrenCount === 1 ? '' : 's'}`;

    details.appendChild(titleEl);
    details.appendChild(subText);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'card-actions-row';

    const dotsBtn = document.createElement('button');
    dotsBtn.className = 'folder-dots-btn';
    dotsBtn.dataset.id = f.id;
    dotsBtn.title = 'Folder Options';
    dotsBtn.textContent = '⋮';

    actionsRow.appendChild(dotsBtn);

    card.appendChild(accent);
    card.appendChild(iconBox);
    card.appendChild(details);
    card.appendChild(actionsRow);

    card.onclick = (e) => {
      if (e.target.closest('.folder-dots-btn')) return;
      const folderId = card.dataset.id;
      selectedFolderId = folderId;
      renderFolderView(folderId);
    };

    dotsBtn.onclick = (e) => {
      e.stopPropagation();
      const folderId = dotsBtn.dataset.id;
      const folder = chromeFolders.find(x => x.id === folderId);
      if (folder) {
        openFolderMenu({
          folder,
          isChrome: true,
          triggerEl: dotsBtn,
          onUpdate: async () => {
            await renderFoldersView(++currentRenderToken);
            await refreshSidebarFolders();
          }
        });
      }
    };

    container.appendChild(card);
  });
}

// --------------------------------------------------------------------------
// SECTION 4: MY LIBRARY (Separate Personal Storage)
// --------------------------------------------------------------------------
async function renderLibraryView(renderToken) {
  const container = $('#items-grid-wrapper');
  const controls = $('#section-controls');

  controls.innerHTML = `
    <button class="glass-btn btn-sm btn-secondary" id="lib-filter-favs">Favorites Only</button>
    <button class="glass-btn btn-sm btn-primary" id="lib-add-link">+ Add to Library</button>
  `;

  let showFavsOnly = false;
  const filterFavBtn = $('#lib-filter-favs');
  filterFavBtn.onclick = () => {
    showFavsOnly = !showFavsOnly;
    filterFavBtn.classList.toggle('active', showFavsOnly);
    filterFavBtn.textContent = showFavsOnly ? '★ Showing Favorites' : 'Favorites Only';
    drawLibrary(++currentRenderToken);
  };

  $('#lib-add-link').onclick = () => {
    openSaveDialog({
      defaultDestination: 'library',
      onSaved: () => renderLibraryView(++currentRenderToken)
    });
  };

  const drawLibrary = async (token) => {
    let items = await libraryRepository.getAll();
    if (token !== currentRenderToken) return;

    if (showFavsOnly) items = items.filter(x => x.favorite);

    if (items.length === 0) {
      setEmptyState(container, '📚', showFavsOnly ? 'No favorite items yet.' : 'My Library is empty. Save personal links here!');
      return;
    }

    container.textContent = '';
    items.forEach((item, index) => {
      container.appendChild(createBookmarkCardElement(item, 'library', index));
    });
    attachBookmarkCardHandlers(container, items, 'library', true);
  };

  await drawLibrary(renderToken);
}

// --------------------------------------------------------------------------
// SECTION 5: ARTICLES (Reading Tracker, Statuses, Date Sorting, Multi-filter)
// --------------------------------------------------------------------------
async function renderArticlesView(renderToken) {
  const container = $('#items-grid-wrapper');
  const controls = $('#section-controls');

  controls.innerHTML = `
    <div class="articles-control-bar">
      <!-- Search Input -->
      <div class="glass-input-wrap" style="position: relative;">
        <input class="glass-input" id="article-search-input" placeholder="Search articles..." style="width: 170px; padding: 6px 10px; font-size: 12px;">
      </div>

      <!-- Date Sorter -->
      <select class="glass-select" id="article-sort-select" style="padding: 5px 8px; font-size: 12px;">
        <option value="newest_saved">Newest Saved</option>
        <option value="oldest_saved">Oldest Saved</option>
        <option value="recently_read">Recently Read</option>
        <option value="oldest_read">Oldest Read</option>
      </select>

      <!-- Multi-select Filter Chips -->
      <div class="filter-chips-group">
        <button class="filter-chip" data-status="want_to_read">
          Want to Read
        </button>
        <button class="filter-chip" data-status="in_progress">
          In Progress
        </button>
        <button class="filter-chip" data-status="done_reading">
          Done Reading
        </button>
        <button class="filter-chip" id="article-clear-filters" style="color: #f87171; display: none;" title="Clear all filters">Clear</button>
      </div>

      <!-- View Switcher (Card vs Title View) -->
      <div class="layout-toggle-group">
        <button class="layout-btn" id="article-view-card" title="Card View (Cover Image)">
          Card
        </button>
        <button class="layout-btn" id="article-view-title" title="Title View (Compact)">
          Title
        </button>
      </div>

      <button class="glass-btn btn-sm btn-primary" id="btn-save-article-top">+ Save Article</button>
    </div>
  `;

  const searchInputInit = $('#article-search-input');
  if (searchInputInit) searchInputInit.value = articleSearchQuery || '';
  const sortSelectInit = $('#article-sort-select');
  if (sortSelectInit) sortSelectInit.value = articleSortBy;
  controls.querySelectorAll('.filter-chip[data-status]').forEach(chip => {
    if (articleStatusFilters.includes(chip.dataset.status)) chip.classList.add('active');
  });
  if (articleStatusFilters.length > 0 && $('#article-clear-filters')) {
    $('#article-clear-filters').style.display = 'inline-block';
  }
  const cardBtn = $('#article-view-card');
  const titleBtn = $('#article-view-title');
  if (cardBtn && titleBtn) {
    if (articleViewMode === 'card') cardBtn.classList.add('active');
    else titleBtn.classList.add('active');
  }

  // Attach control listeners
  const searchInput = $('#article-search-input');
  searchInput.oninput = () => {
    articleSearchQuery = searchInput.value;
    renderArticleList(++currentRenderToken);
  };

  const sortSelect = $('#article-sort-select');
  sortSelect.onchange = () => {
    articleSortBy = sortSelect.value;
    renderArticleList(++currentRenderToken);
  };

  controls.querySelectorAll('.filter-chip[data-status]').forEach(chip => {
    chip.onclick = () => {
      const status = chip.dataset.status;
      if (articleStatusFilters.includes(status)) {
        articleStatusFilters = articleStatusFilters.filter(s => s !== status);
      } else {
        articleStatusFilters.push(status);
      }
      renderArticlesView(++currentRenderToken);
    };
  });

  if ($('#article-clear-filters')) {
    $('#article-clear-filters').onclick = () => {
      articleStatusFilters = [];
      renderArticlesView(++currentRenderToken);
    };
  }

  $('#article-view-card').onclick = async () => {
    articleViewMode = 'card';
    await settingsRepository.update({ articleView: 'card' });
    renderArticlesView(++currentRenderToken);
  };

  $('#article-view-title').onclick = async () => {
    articleViewMode = 'title';
    await settingsRepository.update({ articleView: 'title' });
    renderArticlesView(++currentRenderToken);
  };

  $('#btn-save-article-top').onclick = () => {
    openSaveDialog({
      defaultDestination: 'article',
      onSaved: () => renderArticlesView(++currentRenderToken)
    });
  };

  const renderArticleList = async (token) => {
    let articles = await articleRepository.search({
      query: articleSearchQuery,
      statusFilters: articleStatusFilters,
      sortBy: articleSortBy
    });
    if (token !== currentRenderToken) return;

    if (articles.length === 0) {
      setEmptyState(container, '📰', 'No articles found matching filters.');
      return;
    }

    container.textContent = '';
    if (articleViewMode === 'card') {
      container.className = 'items-grid-wrapper articles-grid';
      articles.forEach(a => container.appendChild(createArticleCardElement(a)));
    } else {
      container.className = 'items-grid-wrapper layout-list';
      articles.forEach(a => container.appendChild(createArticleTitleRowElement(a)));
    }

    attachArticleEventHandlers(container, articles);
  };

  await renderArticleList(renderToken);
}

function attachArticleEventHandlers(container, articles) {
  // Open link
  container.querySelectorAll('.btn-open-link').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    };
  });

  // Toggle Status
  container.querySelectorAll('.btn-status-toggle').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const current = btn.dataset.currentStatus;
      const nextStatus = current === ArticleStatus.DONE_READING ? ArticleStatus.WANT_TO_READ : ArticleStatus.DONE_READING;
      await articleRepository.setStatus(id, nextStatus);
      showToast(`Status updated to "${nextStatus}"`);
      await renderArticlesView(++currentRenderToken);
    };
  });

  // Delete
  container.querySelectorAll('.card-del-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const confirmed = await confirmAction({
        title: 'Delete Article',
        message: 'Are you sure you want to delete this saved article?',
        confirmText: 'Delete',
        isDestructive: true
      });
      if (!confirmed) return;
      await articleRepository.delete(id);
      showToast('Article deleted');
      await renderArticlesView(++currentRenderToken);
    };
  });
}

// --------------------------------------------------------------------------
// SECTION 6: SETTINGS VIEW
// --------------------------------------------------------------------------
async function renderSettingsView(renderToken) {
  const container = $('#items-grid-wrapper');
  container.className = 'items-grid-wrapper';

  const settings = await settingsRepository.getAll();
  if (renderToken !== currentRenderToken) return;

  container.innerHTML = `
    <div class="settings-panel">
      <div class="settings-group">
        <h3>Layout Preferences</h3>
        <p>Popup layout and dashboard layout operate completely independently.</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px;">
          <div>
            <label style="font-size: 11.5px; color: var(--muted); margin-bottom: 4px; display: block;">Extension Popup Layout</label>
            <select class="glass-select" id="setting-popup-layout">
              <option value="list">List View</option>
              <option value="grid">Grid View</option>
              <option value="title">Title View</option>
            </select>
          </div>
          <div>
            <label style="font-size: 11.5px; color: var(--muted); margin-bottom: 4px; display: block;">Dashboard Website Layout</label>
            <select class="glass-select" id="setting-dashboard-layout">
              <option value="list">List View</option>
              <option value="grid">Grid View</option>
              <option value="title">Title View</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h3>Save Destination Defaults</h3>
        <p>Choose where new items are stored by default.</p>
        <select class="glass-select" id="setting-default-dest" style="max-width: 280px; margin-top: 8px;">
          <option value="chrome">Bookmarks</option>
          <option value="library">My Library</option>
          <option value="article">Articles Reading Tracker</option>
        </select>
      </div>

      <div class="settings-group">
        <h3>Articles Default Layout</h3>
        <p>Choose default reading list view mode.</p>
        <select class="glass-select" id="setting-article-view" style="max-width: 280px; margin-top: 8px;">
          <option value="card">Card View (with cover images)</option>
          <option value="title">Compact Title View</option>
        </select>
      </div>

      <div class="settings-group">
        <h3>Backup & Export</h3>
        <p>Export all personal library links and reading list data as a JSON file.</p>
        <button class="glass-btn btn-sm btn-primary" id="btn-export-data" style="margin-top: 8px;">Export All Data (JSON)</button>
      </div>
    </div>
  `;

  $('#setting-popup-layout').value = settings.popupLayout;
  $('#setting-dashboard-layout').value = settings.dashboardLayout;
  $('#setting-default-dest').value = settings.defaultSaveDestination;
  $('#setting-article-view').value = settings.articleView;

  $('#setting-popup-layout').onchange = async (e) => {
    await settingsRepository.update({ popupLayout: e.target.value });
    showToast('Popup layout preference saved');
  };

  $('#setting-dashboard-layout').onchange = async (e) => {
    await settingsRepository.update({ dashboardLayout: e.target.value });
    currentDashboardLayout = e.target.value;
    applyDashboardLayout(currentDashboardLayout);
    showToast('Dashboard layout preference saved');
  };

  $('#setting-default-dest').onchange = async (e) => {
    await settingsRepository.update({ defaultSaveDestination: e.target.value });
    showToast('Default destination updated');
  };

  $('#setting-article-view').onchange = async (e) => {
    await settingsRepository.update({ articleView: e.target.value });
    articleViewMode = e.target.value;
    showToast('Article layout updated');
  };

  $('#btn-export-data').onclick = async () => {
    const data = await settingsRepository.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmark-glass-backup-${Date.now()}.json`;
    a.click();
    showToast('Export file downloaded');
  };
}

// --------------------------------------------------------------------------
// DRILL-DOWN FOLDER VIEW
// --------------------------------------------------------------------------
async function renderFolderView(folderId) {
  const renderToken = ++currentRenderToken;
  const heading = $('#section-heading');
  const subtext = $('#section-subtext');
  const controls = $('#section-controls');
  const container = $('#items-grid-wrapper');

  controls.textContent = '';
  container.textContent = '';
  $('#dashboard-layout-group').style.display = 'flex';
  applyDashboardLayout(currentDashboardLayout);

  const [children, allFolders] = await Promise.all([
    chromeBookmarkRepository.getChildren(folderId),
    chromeBookmarkRepository.getFolders()
  ]);
  if (renderToken !== currentRenderToken) return;

  const currentFolder = allFolders.find(f => f.id === folderId) || { title: 'Folder' };

  heading.textContent = currentFolder.title;
  subtext.textContent = `Inside folder • ${children.length} item(s)`;

  const backBtn = document.createElement('button');
  backBtn.className = 'glass-btn btn-sm btn-secondary';
  backBtn.id = 'btn-back-folders';
  backBtn.textContent = '← Back to All Folders';
  backBtn.onclick = () => {
    $('#nav-folders').click();
  };
  controls.appendChild(backBtn);

  if (children.length === 0) {
    setEmptyState(container, '📂', 'This folder is empty. Drag bookmarks here!');
    return;
  }

  container.textContent = '';
  children.forEach((item, index) => {
    if (item.url) {
      container.appendChild(createBookmarkCardElement({
        id: item.id,
        title: item.title,
        url: item.url,
        domain: extractDomain(item.url),
        favicon: getFaviconUrl(item.url),
        source: 'chrome'
      }, 'chrome', index));
    } else {
      container.appendChild(createFolderCardElement({
        id: item.id,
        title: item.title,
        childrenCount: (item.children || []).length,
        source: 'chrome'
      }, index));
    }
  });

  attachBookmarkCardHandlers(container, children, 'chrome', true);
}

// --------------------------------------------------------------------------
// CARD RENDERING HELPERS & DRAG-AND-DROP COORDINATOR
// --------------------------------------------------------------------------

function setEmptyState(container, iconChar, textMsg) {
  container.textContent = '';
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'empty-state';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'empty-icon';
  iconSpan.textContent = iconChar;
  const textSpan = document.createElement('span');
  textSpan.className = 'empty-text';
  textSpan.textContent = textMsg;
  emptyDiv.appendChild(iconSpan);
  emptyDiv.appendChild(textSpan);
  container.appendChild(emptyDiv);
}

function createBookmarkCardElement(item, source, index = 0) {
  const favicon = item.favicon || getFaviconUrl(item.url);
  const isFav = Boolean(item.favorite);

  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.draggable = true;
  card.dataset.id = item.id;
  card.dataset.url = item.url || '';
  card.dataset.source = source;
  card.dataset.index = String(index);

  const iconBox = document.createElement('div');
  iconBox.className = 'card-icon-box';
  const img = document.createElement('img');
  img.src = favicon;
  img.alt = '';
  img.onerror = () => { img.src = 'icon.svg'; };
  iconBox.appendChild(img);

  const details = document.createElement('div');
  details.className = 'card-details';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'card-title-text';
  titleDiv.title = item.title || '';
  titleDiv.textContent = item.title || '';

  const subText = currentDashboardLayout === LayoutType.LIST ? item.url : (item.domain || item.url || '');
  const subDiv = document.createElement('div');
  subDiv.className = 'card-sub-text';
  subDiv.title = item.url || '';
  subDiv.textContent = subText;

  details.appendChild(titleDiv);
  details.appendChild(subDiv);

  if (item.tags && item.tags.length) {
    const tagRow = document.createElement('div');
    tagRow.className = 'card-tag-row';
    item.tags.forEach(t => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'card-tag';
      tagSpan.textContent = t;
      tagRow.appendChild(tagSpan);
    });
    details.appendChild(tagRow);
  }

  const actionsRow = document.createElement('div');
  actionsRow.className = 'card-actions-row';

  if (source === 'library') {
    const starBtn = document.createElement('button');
    starBtn.className = `star-btn ${isFav ? 'is-fav' : ''}`;
    starBtn.dataset.id = item.id;
    starBtn.title = isFav ? 'Remove Favorite' : 'Mark Favorite';
    starBtn.textContent = isFav ? '★' : '☆';
    actionsRow.appendChild(starBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'card-del-btn';
  delBtn.dataset.id = item.id;
  delBtn.dataset.source = source;
  delBtn.title = 'Delete bookmark';
  delBtn.textContent = '✕';
  actionsRow.appendChild(delBtn);

  card.appendChild(iconBox);
  card.appendChild(details);
  card.appendChild(actionsRow);

  return card;
}

function createFolderCardElement(folder, index = 0) {
  const card = document.createElement('div');
  card.className = 'folder-card';
  card.draggable = true;
  card.dataset.id = folder.id;
  card.dataset.folder = 'true';
  card.dataset.source = 'chrome';
  card.dataset.index = String(index);

  const iconBox = document.createElement('div');
  iconBox.className = 'card-icon-box';
  iconBox.textContent = '📁';

  const details = document.createElement('div');
  details.className = 'card-details';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'card-title-text';
  titleDiv.textContent = folder.title || '';

  const subDiv = document.createElement('div');
  subDiv.className = 'card-sub-text';
  subDiv.textContent = `${folder.childrenCount || 0} items`;

  details.appendChild(titleDiv);
  details.appendChild(subDiv);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'card-actions-row';

  const dotsBtn = document.createElement('button');
  dotsBtn.className = 'folder-dots-btn';
  dotsBtn.dataset.id = folder.id;
  dotsBtn.textContent = '⋮';
  actionsRow.appendChild(dotsBtn);

  card.appendChild(iconBox);
  card.appendChild(details);
  card.appendChild(actionsRow);

  return card;
}

function createArticleCardElement(article) {
  const statusClass = article.readingStatus === ArticleStatus.DONE_READING
    ? 'status-done'
    : (article.readingStatus === ArticleStatus.IN_PROGRESS ? 'status-progress' : 'status-want');

  const savedDateStr = new Date(article.createdAt || Date.now()).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const readDateStr = article.readDate
    ? new Date(article.readDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const card = document.createElement('article');
  card.className = 'article-card';
  card.dataset.id = article.id;

  const cover = document.createElement('div');
  cover.className = 'article-cover';

  const fallback = document.createElement('div');
  fallback.className = 'article-cover-fallback';
  fallback.textContent = '📰';

  if (article.coverImage) {
    const img = document.createElement('img');
    img.src = article.coverImage;
    img.alt = article.title || '';
    fallback.style.display = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      fallback.style.display = 'flex';
    };
    cover.appendChild(img);
  }
  cover.appendChild(fallback);

  const statusPill = document.createElement('span');
  statusPill.className = `article-status-pill ${statusClass}`;
  statusPill.textContent = article.readingStatus;
  cover.appendChild(statusPill);

  const body = document.createElement('div');
  body.className = 'article-body';

  const domainDiv = document.createElement('div');
  domainDiv.className = 'article-domain';
  domainDiv.textContent = article.domain || 'Article';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'article-title';
  titleDiv.title = article.title || '';
  titleDiv.textContent = article.title || '';

  body.appendChild(domainDiv);
  body.appendChild(titleDiv);

  if (article.notes) {
    const notesDiv = document.createElement('div');
    notesDiv.className = 'article-notes';
    notesDiv.textContent = article.notes;
    body.appendChild(notesDiv);
  }

  if (article.tags && article.tags.length) {
    const tagRow = document.createElement('div');
    tagRow.className = 'card-tag-row';
    article.tags.forEach(t => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'card-tag';
      tagSpan.textContent = t;
      tagRow.appendChild(tagSpan);
    });
    body.appendChild(tagRow);
  }

  const dateRow = document.createElement('div');
  dateRow.className = 'article-date-row';
  const dateSpan = document.createElement('span');
  dateSpan.textContent = readDateStr ? `Read: ${readDateStr}` : `Saved: ${savedDateStr}`;
  dateRow.appendChild(dateSpan);
  body.appendChild(dateRow);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'article-actions-row';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'glass-btn btn-sm btn-status-toggle';
  toggleBtn.dataset.id = article.id;
  toggleBtn.dataset.currentStatus = article.readingStatus;
  toggleBtn.textContent = article.readingStatus === ArticleStatus.DONE_READING ? '↺ Re-read' : '✓ Done Reading';

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '6px';

  const openBtn = document.createElement('button');
  openBtn.className = 'glass-btn btn-sm btn-open-link';
  openBtn.dataset.url = article.url || '';
  openBtn.textContent = 'Open ↗';

  const delBtn = document.createElement('button');
  delBtn.className = 'card-del-btn';
  delBtn.dataset.id = article.id;
  delBtn.title = 'Delete Article';
  delBtn.textContent = '✕';

  btnGroup.appendChild(openBtn);
  btnGroup.appendChild(delBtn);
  actionsRow.appendChild(toggleBtn);
  actionsRow.appendChild(btnGroup);
  body.appendChild(actionsRow);

  card.appendChild(cover);
  card.appendChild(body);
  return card;
}

function createArticleTitleRowElement(article) {
  const statusClass = article.readingStatus === ArticleStatus.DONE_READING
    ? 'status-done'
    : (article.readingStatus === ArticleStatus.IN_PROGRESS ? 'status-progress' : 'status-want');

  const card = document.createElement('div');
  card.className = 'bookmark-card article-title-row';
  card.dataset.id = article.id;

  const iconBox = document.createElement('div');
  iconBox.className = 'card-icon-box';
  const img = document.createElement('img');
  img.src = article.favicon || getFaviconUrl(article.url);
  img.alt = '';
  img.onerror = () => { img.src = 'icon.svg'; };
  iconBox.appendChild(img);

  const details = document.createElement('div');
  details.className = 'card-details';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'card-title-text';
  titleDiv.textContent = article.title || '';

  const subDiv = document.createElement('div');
  subDiv.className = 'card-sub-text';
  subDiv.textContent = `${article.domain || 'Article'} • `;
  const pill = document.createElement('span');
  pill.className = `article-status-pill ${statusClass}`;
  pill.style.position = 'static';
  pill.style.padding = '1px 6px';
  pill.style.fontSize = '10px';
  pill.textContent = article.readingStatus;
  subDiv.appendChild(pill);

  details.appendChild(titleDiv);
  details.appendChild(subDiv);

  const actions = document.createElement('div');
  actions.className = 'card-actions-row';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'glass-btn btn-sm btn-status-toggle';
  toggleBtn.dataset.id = article.id;
  toggleBtn.dataset.currentStatus = article.readingStatus;
  toggleBtn.textContent = article.readingStatus === ArticleStatus.DONE_READING ? '↺' : '✓';

  const openBtn = document.createElement('button');
  openBtn.className = 'glass-btn btn-sm btn-open-link';
  openBtn.dataset.url = article.url || '';
  openBtn.textContent = 'Open';

  const delBtn = document.createElement('button');
  delBtn.className = 'card-del-btn';
  delBtn.dataset.id = article.id;
  delBtn.title = 'Delete';
  delBtn.textContent = '✕';

  actions.appendChild(toggleBtn);
  actions.appendChild(openBtn);
  actions.appendChild(delBtn);

  card.appendChild(iconBox);
  card.appendChild(details);
  card.appendChild(actions);

  return card;
}

function attachBookmarkCardHandlers(container, items, source, allowReorder = false) {
  // Click to open URL
  container.querySelectorAll('.bookmark-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('.star-btn') || e.target.closest('.card-del-btn')) return;
      const url = card.dataset.url;
      if (url) {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url });
        } else {
          window.open(url, '_blank');
        }
      }
    };
  });

  // Favorite toggle for My Library
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const updated = await libraryRepository.toggleFavorite(id);
      showToast(updated.favorite ? 'Added to favorites' : 'Removed from favorites');
      await refreshCurrentView();
    };
  });

  // Delete
  container.querySelectorAll('.card-del-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const cardSource = btn.dataset.source;

      const confirmed = await confirmAction({
        title: 'Delete Bookmark',
        message: 'Are you sure you want to delete this bookmark?',
        confirmText: 'Delete',
        isDestructive: true
      });
      if (!confirmed) return;

      if (cardSource === 'chrome') {
        await chromeBookmarkRepository.remove(id);
      } else {
        await libraryRepository.delete(id);
      }
      showToast('Bookmark deleted');
      await refreshCurrentView();
    };
  });

  // Drag & Drop
  container.querySelectorAll('[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const id = el.dataset.id;
      const itemSource = el.dataset.source;
      const index = parseInt(el.dataset.index, 10);
      dragDropService.setDragItem({ id, source: itemSource, index });
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
      dragDropService.clear();
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const targetIndex = parseInt(el.dataset.index, 10);
      const isTargetFolder = el.dataset.folder === 'true';
      const targetId = el.dataset.id;

      if (isTargetFolder) {
        // Drop into folder
        await dragDropService.handleDrop({ targetType: 'folder', targetId, newParentId: targetId });
      } else if (allowReorder) {
        // Drop to reorder
        await dragDropService.handleDrop({ targetType: 'item', targetId, targetIndex });
      }

      showToast('Items reordered');
      await refreshCurrentView();
    });
  });
}

// Bootstrap
initDashboard();
