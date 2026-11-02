import { folderRepository } from '../core/repositories/folder-repository.js';
import { chromeBookmarkRepository } from '../core/repositories/chrome-bookmarks.js';
import { FOLDER_COLOR_PALETTES } from '../core/types.js';
import { confirmAction } from './confirm-dialog.js';
import { showToast } from './toast.js';

let activeMenu = null;

export function closeActiveFolderMenu() {
  if (activeMenu && activeMenu.parentNode) {
    activeMenu.parentNode.removeChild(activeMenu);
    activeMenu = null;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.folder-menu-dropdown') && !e.target.closest('.folder-dots-btn')) {
    closeActiveFolderMenu();
  }
});

export function openFolderMenu({ folder, isChrome, triggerEl, onUpdate }) {
  closeActiveFolderMenu();

  const menu = document.createElement('div');
  menu.className = 'folder-menu-dropdown glass';

  menu.innerHTML = `
    <div class="menu-action" id="act-rename">
      <span>✏️</span> <span>Rename</span>
    </div>
    <div class="menu-action-section">
      <div class="menu-label">Folder Color</div>
      <div class="color-swatches" id="color-swatches"></div>
    </div>
    <div class="menu-divider"></div>
    <div class="menu-action destructive" id="act-delete">
      <span>🗑️</span> <span>Delete Folder</span>
    </div>
  `;

  // Render color swatches
  const swatchesEl = menu.querySelector('#color-swatches');
  FOLDER_COLOR_PALETTES.forEach(p => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = p.color;
    swatch.title = p.name;
    swatch.onclick = async (e) => {
      e.stopPropagation();
      await folderRepository.setFolderColor(folder.id, p.id);
      showToast(`Folder color set to ${p.name}`);
      closeActiveFolderMenu();
      if (onUpdate) onUpdate();
    };
    swatchesEl.appendChild(swatch);
  });

  // Rename
  menu.querySelector('#act-rename').onclick = async (e) => {
    e.stopPropagation();
    closeActiveFolderMenu();
    const currentName = folder.title || folder.name || '';
    const newName = prompt('Enter new folder name:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;

    if (isChrome) {
      await chromeBookmarkRepository.update(folder.id, { title: newName.trim() });
    } else {
      await folderRepository.renameCustomFolder(folder.id, newName.trim());
    }
    showToast(`Folder renamed to "${newName.trim()}"`);
    if (onUpdate) onUpdate();
  };

  // Delete
  menu.querySelector('#act-delete').onclick = async (e) => {
    e.stopPropagation();
    closeActiveFolderMenu();

    let childrenCount = folder.childrenCount || 0;
    if (isChrome && typeof folder.childrenCount !== 'number') {
      const children = await chromeBookmarkRepository.getChildren(folder.id);
      childrenCount = children.length;
    }

    const folderName = folder.title || folder.name || 'Folder';
    const warningMsg = childrenCount > 0
      ? `This folder contains ${childrenCount} item(s). Deleting it will remove all contents inside. Are you sure?`
      : `Are you sure you want to delete "${folderName}"?`;

    const confirmed = await confirmAction({
      title: `Delete "${folderName}"?`,
      message: warningMsg,
      confirmText: 'Delete Folder',
      isDestructive: true
    });

    if (!confirmed) return;

    if (isChrome) {
      await chromeBookmarkRepository.removeTree(folder.id);
    } else {
      await folderRepository.deleteCustomFolder(folder.id);
    }

    showToast(`Deleted folder "${folderName}"`);
    if (onUpdate) onUpdate();
  };

  // Position relative to trigger button
  document.body.appendChild(menu);
  const rect = triggerEl.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.min(window.innerWidth - 180, Math.max(10, rect.left - 130))}px`;
  menu.style.zIndex = '9999';

  activeMenu = menu;
}
