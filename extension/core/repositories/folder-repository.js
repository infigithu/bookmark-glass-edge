import { storageAdapter } from '../storage-adapter.js';
import { generateUUID, FOLDER_COLOR_PALETTES } from '../types.js';

const FOLDER_METADATA_KEY = 'folder_visual_metadata';
const CUSTOM_FOLDERS_KEY = 'custom_library_folders';

/**
 * FolderRepository
 * Manages custom folders for My Library AND visual metadata (e.g. colors, icons)
 * for both Chrome bookmark folders and Library folders without corrupting Chrome bookmark models.
 */
export class FolderRepository {
  constructor(adapter = storageAdapter) {
    this.adapter = adapter;
    this._listeners = new Set();
  }

  subscribe(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _notify() {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error(e); }
    }
  }

  // --- Visual Metadata (Colors, Icons) ---
  async getVisualMetadataMap() {
    const data = await this.adapter.get({ [FOLDER_METADATA_KEY]: {} });
    return data[FOLDER_METADATA_KEY] || {};
  }

  async getFolderColor(folderId) {
    const map = await this.getVisualMetadataMap();
    const meta = map[folderId];
    if (meta && meta.colorId) {
      return FOLDER_COLOR_PALETTES.find(p => p.id === meta.colorId) || FOLDER_COLOR_PALETTES[0];
    }
    return FOLDER_COLOR_PALETTES[0];
  }

  async setFolderColor(folderId, colorId) {
    const map = await this.getVisualMetadataMap();
    map[folderId] = {
      ...(map[folderId] || {}),
      colorId,
      updatedAt: Date.now()
    };
    await this.adapter.set({ [FOLDER_METADATA_KEY]: map });
    this._notify();
    return map[folderId];
  }

  // --- Custom Library Folders ---
  async getCustomFolders() {
    const data = await this.adapter.get({
      [CUSTOM_FOLDERS_KEY]: [
        { id: 'lib-general', name: 'General', createdAt: Date.now() },
        { id: 'lib-work', name: 'Work', createdAt: Date.now() },
        { id: 'lib-learning', name: 'Learning', createdAt: Date.now() },
        { id: 'lib-tools', name: 'Tools', createdAt: Date.now() }
      ]
    });
    return data[CUSTOM_FOLDERS_KEY] || [];
  }

  async createCustomFolder(name) {
    const folders = await this.getCustomFolders();
    const newFolder = {
      id: generateUUID(),
      name: name.trim(),
      createdAt: Date.now()
    };
    folders.push(newFolder);
    await this.adapter.set({ [CUSTOM_FOLDERS_KEY]: folders });
    this._notify();
    return newFolder;
  }

  async renameCustomFolder(id, newName) {
    const folders = await this.getCustomFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
      folder.name = newName.trim();
      await this.adapter.set({ [CUSTOM_FOLDERS_KEY]: folders });
      this._notify();
    }
    return folder;
  }

  async deleteCustomFolder(id) {
    const folders = await this.getCustomFolders();
    const filtered = folders.filter(f => f.id !== id);
    await this.adapter.set({ [CUSTOM_FOLDERS_KEY]: filtered });
    this._notify();
    return true;
  }
}

export const folderRepository = new FolderRepository();
