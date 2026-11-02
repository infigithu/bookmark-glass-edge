import { getActiveTabMetadata } from '../core/metadata-extractor.js';
import { chromeBookmarkRepository } from '../core/repositories/chrome-bookmarks.js';
import { libraryRepository } from '../core/repositories/library-repository.js';
import { articleRepository } from '../core/repositories/article-repository.js';
import { folderRepository } from '../core/repositories/folder-repository.js';
import { settingsRepository } from '../core/repositories/settings-repository.js';
import { ArticleStatus, extractDomain } from '../core/types.js';
import { showToast } from './toast.js';

/**
 * Render and control the unified Save Dialog
 */
export async function openSaveDialog({ defaultDestination = null, onSaved = null } = {}) {
  let dialog = document.getElementById('unified-save-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'unified-save-dialog';
    dialog.className = 'glass-modal save-modal';
    document.body.appendChild(dialog);
  }

  // Load current tab metadata
  const meta = await getActiveTabMetadata();
  const settings = await settingsRepository.getAll();
  let currentDestination = defaultDestination || settings.defaultSaveDestination || 'chrome';

  // Load folders
  const [chromeFolders, customFolders, existingLibrary, existingArticle] = await Promise.all([
    chromeBookmarkRepository.getFolders(),
    folderRepository.getCustomFolders(),
    libraryRepository.existsUrl(meta.url),
    articleRepository.existsUrl(meta.url)
  ]);

  // Check duplicates
  const allChrome = await chromeBookmarkRepository.getAllBookmarks();
  const existingChrome = allChrome.find(b => b.url?.toLowerCase() === meta.url?.toLowerCase());
  const isDuplicate = Boolean(existingChrome || existingLibrary || existingArticle);
  const duplicateLocation = existingChrome ? 'Browser Bookmarks' : (existingLibrary ? 'My Library' : (existingArticle ? 'Articles' : ''));

  dialog.innerHTML = `
    <div class="save-dialog-content">
      <div class="dialog-header">
        <h3 class="dialog-title">Save Webpage</h3>
        <button class="dialog-close-btn" id="save-close">&times;</button>
      </div>

      <div class="duplicate-warning" id="save-dup-box" style="display: none;">
        <span class="warning-icon">⚠️</span>
        <div class="warning-text">
          <strong>Already Saved!</strong>
          <span id="save-dup-text">This link already exists.</span>
        </div>
        <button class="glass-btn btn-sm" id="btn-open-existing">Open</button>
      </div>

      <!-- Page Preview -->
      <div class="page-preview-box">
        <img class="preview-favicon" id="save-preview-favicon" src="icon.svg">
        <div class="preview-info">
          <input class="glass-input preview-title-input" id="save-title" placeholder="Title">
          <input class="glass-input preview-url-input" id="save-url" placeholder="https://">
        </div>
      </div>

      <!-- Destination Tabs -->
      <div class="destination-tabs">
        <button class="dest-tab" data-dest="chrome">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
          <span>Bookmarks</span>
        </button>
        <button class="dest-tab" data-dest="library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z"/></svg>
          <span>My Library</span>
        </button>
        <button class="dest-tab" data-dest="article">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>
          <span>Article</span>
        </button>
      </div>

      <!-- Form Section: Chrome Bookmarks -->
      <div class="dest-section" id="section-chrome">
        <div class="form-row">
          <label>Destination Folder</label>
          <div class="folder-select-row">
            <select class="glass-select" id="chrome-folder-select"></select>
            <button class="glass-btn btn-sm" id="btn-new-chrome-folder" title="Create new folder">+ Folder</button>
          </div>
        </div>
      </div>

      <!-- Form Section: My Library -->
      <div class="dest-section" id="section-library">
        <div class="form-row">
          <label>Library Folder</label>
          <div class="folder-select-row">
            <select class="glass-select" id="library-folder-select">
              <option value="">(No folder / Root)</option>
            </select>
            <button class="glass-btn btn-sm" id="btn-new-library-folder" title="Create new library folder">+ Folder</button>
          </div>
        </div>
        <div class="form-row">
          <label>Tags</label>
          <input class="glass-input" id="library-tags" placeholder="e.g. tools, react, inspiration">
        </div>
        <div class="form-row">
          <label>Notes</label>
          <textarea class="glass-textarea" id="library-notes" rows="2" placeholder="Optional notes..."></textarea>
        </div>
        <div class="form-row checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" id="library-favorite">
            <span>Mark as Favorite</span>
          </label>
        </div>
      </div>

      <!-- Form Section: Articles -->
      <div class="dest-section" id="section-article">
        <div class="article-cover-preview" id="save-cover-box" style="display: none;">
          <img id="save-cover-img" src="" alt="Cover preview">
          <span class="cover-badge">Open Graph Cover Found</span>
        </div>
        <div class="form-row">
          <label>Reading Status</label>
          <select class="glass-select" id="article-status">
            <option value="Want to Read" selected>Want to Read</option>
            <option value="In Progress">In Progress</option>
            <option value="Done Reading">Done Reading</option>
          </select>
        </div>
        <div class="form-row">
          <label>Tags</label>
          <input class="glass-input" id="article-tags" placeholder="e.g. tech, essay, ai">
        </div>
        <div class="form-row">
          <label>Notes / Takeaways</label>
          <textarea class="glass-textarea" id="article-notes" rows="2" placeholder="Reading summary or notes..."></textarea>
        </div>
      </div>

      <!-- Save Button Action (from reference save-button.html) -->
      <div class="save-footer" id="save-footer">
        <button class="save-main-btn" id="save-submit" type="button">
          <span id="save-btn-label">Save</span>
        </button>
        <div class="save-done-state" id="save-done-state" style="display: none;">
          <div class="save-done-check">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 12 5 5 9-10"/>
            </svg>
          </div>
          <p class="save-done-text" id="save-done-text">Saved</p>
          <button class="save-undo-btn" id="save-undo-btn" type="button">Undo</button>
        </div>
        <div class="save-progress-bar" id="save-progress-bar" style="display: none;">
          <i id="save-progress-fill"></i>
        </div>
      </div>
    </div>
  `;

  if (isDuplicate) {
    const dupBox = dialog.querySelector('#save-dup-box');
    dupBox.style.display = 'flex';
    dialog.querySelector('#save-dup-text').textContent = `This link already exists in ${duplicateLocation}.`;
  }

  const faviconImg = dialog.querySelector('#save-preview-favicon');
  faviconImg.src = meta.favicon || 'icon.svg';
  faviconImg.onerror = () => { faviconImg.src = 'icon.svg'; };

  dialog.querySelector('#save-title').value = meta.title || '';
  dialog.querySelector('#save-url').value = meta.url || '';

  dialog.querySelectorAll('.dest-tab').forEach(tab => {
    if (tab.dataset.dest === currentDestination) tab.classList.add('active');
  });
  const initialSection = dialog.querySelector(`#section-${currentDestination}`);
  if (initialSection) initialSection.classList.add('visible');

  const chromeSelect = dialog.querySelector('#chrome-folder-select');
  for (const f of chromeFolders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.path || f.title;
    if (f.isBookmarkBar || f.id === '1' || f.id === 'toolbar_____') opt.selected = true;
    chromeSelect.appendChild(opt);
  }

  const libSelect = dialog.querySelector('#library-folder-select');
  for (const f of customFolders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    libSelect.appendChild(opt);
  }

  if (meta.coverImage) {
    const coverBox = dialog.querySelector('#save-cover-box');
    const coverImg = dialog.querySelector('#save-cover-img');
    coverImg.src = meta.coverImage;
    coverImg.onerror = () => { coverBox.style.display = 'none'; };
    coverBox.style.display = 'block';
  }

  let autoCloseTimer = null;
  const closeDialog = () => {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    dialog.close();
  };

  dialog.querySelector('#save-close').onclick = closeDialog;

  if (dialog.querySelector('#btn-open-existing')) {
    dialog.querySelector('#btn-open-existing').onclick = () => {
      chrome.tabs.create({ url: meta.url });
      closeDialog();
    };
  }

  // Dynamic label updating
  const updateSaveLabel = () => {
    let target = 'Browser Bookmarks';
    if (currentDestination === 'chrome') {
      const select = dialog.querySelector('#chrome-folder-select');
      const text = select?.options[select.selectedIndex]?.text;
      target = text ? text.split('/').pop().trim() : 'Bookmarks bar';
    } else if (currentDestination === 'library') {
      const select = dialog.querySelector('#library-folder-select');
      const text = select?.options[select.selectedIndex]?.text;
      target = text && select.value ? text.trim() : 'My Library';
    } else if (currentDestination === 'article') {
      const statusSelect = dialog.querySelector('#article-status');
      target = statusSelect ? statusSelect.value : 'Want to Read';
    }

    const labelEl = dialog.querySelector('#save-btn-label');
    if (labelEl) {
      if (currentDestination === 'article') {
        labelEl.textContent = isDuplicate ? `Save Anyway · ${target}` : `Save · ${target}`;
      } else {
        labelEl.textContent = isDuplicate ? `Save Anyway to ${target}` : `Save to ${target}`;
      }
    }
  };

  // Switch destination tabs
  dialog.querySelectorAll('.dest-tab').forEach(tab => {
    tab.onclick = () => {
      dialog.querySelectorAll('.dest-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentDestination = tab.dataset.dest;

      dialog.querySelectorAll('.dest-section').forEach(sec => sec.classList.remove('visible'));
      dialog.querySelector(`#section-${currentDestination}`).classList.add('visible');
      updateSaveLabel();
    };
  });

  // Attach change listeners to select elements for live label updates
  dialog.querySelector('#chrome-folder-select').onchange = updateSaveLabel;
  dialog.querySelector('#library-folder-select').onchange = updateSaveLabel;
  dialog.querySelector('#article-status').onchange = updateSaveLabel;

  // Initialize label
  updateSaveLabel();

  // Create new Bookmark Folder
  dialog.querySelector('#btn-new-chrome-folder').onclick = async (e) => {
    e.preventDefault();
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    const parentId = dialog.querySelector('#chrome-folder-select').value || null;
    const folder = await chromeBookmarkRepository.createFolder(name.trim(), parentId);
    showToast(`Created folder "${name.trim()}"`);
    // Refresh folder select
    const updated = await chromeBookmarkRepository.getFolders();
    const select = dialog.querySelector('#chrome-folder-select');
    select.textContent = '';
    for (const f of updated) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.path || f.title;
      if (f.id === folder.id) opt.selected = true;
      select.appendChild(opt);
    }
    updateSaveLabel();
  };

  // Create new Library Folder
  dialog.querySelector('#btn-new-library-folder').onclick = async (e) => {
    e.preventDefault();
    const name = prompt('New Library folder name:');
    if (!name || !name.trim()) return;
    const folder = await folderRepository.createCustomFolder(name.trim());
    showToast(`Created library folder "${name.trim()}"`);
    const updated = await folderRepository.getCustomFolders();
    const select = dialog.querySelector('#library-folder-select');
    select.textContent = '';
    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = '(No folder / Root)';
    select.appendChild(rootOpt);
    for (const f of updated) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      if (f.id === folder.id) opt.selected = true;
      select.appendChild(opt);
    }
    updateSaveLabel();
  };

  // Submit Save
  dialog.querySelector('#save-submit').onclick = async () => {
    const title = dialog.querySelector('#save-title').value.trim() || meta.title || extractDomain(meta.url);
    const url = dialog.querySelector('#save-url').value.trim() || meta.url;

    if (!url) {
      alert('URL cannot be empty');
      return;
    }

    let savedItem = null;
    let savedTargetName = '';
    const savedSource = currentDestination;

    try {
      if (currentDestination === 'chrome') {
        const select = dialog.querySelector('#chrome-folder-select');
        const folderName = select?.options[select.selectedIndex]?.text?.split('/')?.pop()?.trim() || 'Bookmarks bar';
        const parentId = select.value || null;
        savedItem = await chromeBookmarkRepository.create({ parentId, title, url });
        savedTargetName = folderName;
      } else if (currentDestination === 'library') {
        const select = dialog.querySelector('#library-folder-select');
        const folderName = (select?.value && select?.options[select.selectedIndex]?.text) || 'My Library';
        const folderId = select.value || null;
        const tags = dialog.querySelector('#library-tags').value;
        const notes = dialog.querySelector('#library-notes').value;
        const favorite = dialog.querySelector('#library-favorite').checked;
        savedItem = await libraryRepository.create({
          title,
          url,
          favicon: meta.favicon,
          description: meta.description,
          folderId,
          tags,
          notes,
          favorite
        });
        savedTargetName = folderName;
      } else if (currentDestination === 'article') {
        const status = dialog.querySelector('#article-status').value;
        const tags = dialog.querySelector('#article-tags').value;
        const notes = dialog.querySelector('#article-notes').value;
        savedItem = await articleRepository.create({
          title,
          url,
          favicon: meta.favicon,
          coverImage: meta.coverImage,
          readingStatus: status,
          tags,
          notes
        });
        savedTargetName = status;
      }

      showToast(`Saved to ${savedTargetName}!`);

      // Transition to saved state (from reference save-button.html)
      const submitBtn = dialog.querySelector('#save-submit');
      const doneState = dialog.querySelector('#save-done-state');
      const doneText = dialog.querySelector('#save-done-text');
      const progressBar = dialog.querySelector('#save-progress-bar');
      const progressFill = dialog.querySelector('#save-progress-fill');

      submitBtn.style.display = 'none';
      doneState.style.display = 'flex';
      doneText.textContent = `Saved to ${savedTargetName}`;
      progressBar.style.display = 'block';

      // Restart drain animation
      progressFill.style.animation = 'none';
      void progressFill.offsetWidth;
      progressFill.style.animation = 'save-drain 3.5s linear forwards';

      autoCloseTimer = setTimeout(() => {
        closeDialog();
        if (onSaved) onSaved();
      }, 3500);

      // Undo button action
      const undoBtn = dialog.querySelector('#save-undo-btn');
      undoBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (autoCloseTimer) clearTimeout(autoCloseTimer);

        try {
          if (savedSource === 'chrome' && savedItem?.id) {
            await chromeBookmarkRepository.remove(savedItem.id);
          } else if (savedSource === 'library' && savedItem?.id) {
            await libraryRepository.delete(savedItem.id);
          } else if (savedSource === 'article' && savedItem?.id) {
            await articleRepository.delete(savedItem.id);
          }
          showToast('Save undone');
        } catch (undoErr) {
          console.error('Undo failed:', undoErr);
        }

        // Restore UI
        submitBtn.style.display = 'flex';
        doneState.style.display = 'none';
        progressBar.style.display = 'none';
        updateSaveLabel();
      };
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Error saving: ' + (err.message || 'Unknown error'), 'error');
    }
  };

  dialog.showModal();
}
