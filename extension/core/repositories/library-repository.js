import { storageAdapter } from '../storage-adapter.js';
import { generateUUID, extractDomain, getFaviconUrl } from '../types.js';

const STORAGE_KEY = 'my_library_links';

/**
 * LibraryRepository
 * Independent personal link repository.
 * Decoupled from chrome.bookmarks and chrome.storage.
 */
export class LibraryRepository {
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

  async getAll() {
    const data = await this.adapter.get({ [STORAGE_KEY]: [] });
    return data[STORAGE_KEY] || [];
  }

  async getById(id) {
    const all = await this.getAll();
    return all.find(item => item.id === id) || null;
  }

  async getByFolder(folderId) {
    const all = await this.getAll();
    return all.filter(item => item.folderId === folderId);
  }

  async create(data) {
    const all = await this.getAll();
    const now = Date.now();
    const item = {
      id: generateUUID(),
      title: data.title?.trim() || extractDomain(data.url),
      url: data.url?.trim(),
      favicon: data.favicon || getFaviconUrl(data.url),
      description: data.description?.trim() || '',
      notes: data.notes?.trim() || '',
      folderId: data.folderId || null,
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      favorite: Boolean(data.favorite),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      source: 'library'
    };

    all.unshift(item);
    await this.adapter.set({ [STORAGE_KEY]: all });
    this._notify();
    return item;
  }

  async update(id, changes) {
    const all = await this.getAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) return null;

    const current = all[index];
    const updated = {
      ...current,
      ...changes,
      updatedAt: Date.now()
    };

    if (changes.tags && typeof changes.tags === 'string') {
      updated.tags = changes.tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    all[index] = updated;
    await this.adapter.set({ [STORAGE_KEY]: all });
    this._notify();
    return updated;
  }

  async delete(id) {
    const all = await this.getAll();
    const filtered = all.filter(item => item.id !== id);
    await this.adapter.set({ [STORAGE_KEY]: filtered });
    this._notify();
    return true;
  }

  async remove(id) {
    return this.delete(id);
  }

  async move(id, folderId) {
    return this.update(id, { folderId });
  }

  async reorder(startIndex, endIndex) {
    const all = await this.getAll();
    if (startIndex < 0 || startIndex >= all.length || endIndex < 0 || endIndex >= all.length) {
      return all;
    }
    const [moved] = all.splice(startIndex, 1);
    all.splice(endIndex, 0, moved);
    await this.adapter.set({ [STORAGE_KEY]: all });
    this._notify();
    return all;
  }

  async toggleFavorite(id) {
    const item = await this.getById(id);
    if (!item) return null;
    return this.update(id, { favorite: !item.favorite });
  }

  async touchOpened(id) {
    return this.update(id, { lastOpenedAt: Date.now() });
  }

  async search(query) {
    const all = await this.getAll();
    if (!query) return all;
    const q = query.toLowerCase().trim();
    return all.filter(item => {
      return (
        item.title?.toLowerCase().includes(q) ||
        item.url?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    });
  }

  async existsUrl(url) {
    const all = await this.getAll();
    return all.find(item => item.url?.toLowerCase() === url?.toLowerCase()) || null;
  }
}

export const libraryRepository = new LibraryRepository();
