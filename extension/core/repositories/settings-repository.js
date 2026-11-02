import { storageAdapter } from '../storage-adapter.js';
import { LayoutType } from '../types.js';

const SETTINGS_KEY = 'bookmark_glass_settings';

const DEFAULT_SETTINGS = {
  popupLayout: LayoutType.GRID,
  dashboardLayout: LayoutType.GRID,
  theme: 'dark',
  showFavicon: true,
  showUrl: true,
  defaultSaveDestination: 'chrome', // 'chrome' | 'library' | 'article'
  articleView: 'card' // 'card' | 'title'
};

/**
 * SettingsRepository
 * Manages independent layout preferences for Popup vs Dashboard,
 * along with display preferences and default destinations.
 */
export class SettingsRepository {
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
    const data = await this.adapter.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  }

  async get(key) {
    const all = await this.getAll();
    return all[key];
  }

  async update(changes) {
    const all = await this.getAll();
    const updated = { ...all, ...changes };
    await this.adapter.set({ [SETTINGS_KEY]: updated });
    this._notify();
    return updated;
  }

  async cyclePopupLayout() {
    const current = await this.get('popupLayout');
    const order = [LayoutType.LIST, LayoutType.GRID, LayoutType.TITLE];
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    const nextLayout = order[nextIdx];
    await this.update({ popupLayout: nextLayout });
    return nextLayout;
  }

  async cycleDashboardLayout() {
    const current = await this.get('dashboardLayout');
    const order = [LayoutType.LIST, LayoutType.GRID, LayoutType.TITLE];
    const nextIdx = (order.indexOf(current) + 1) % order.length;
    const nextLayout = order[nextIdx];
    await this.update({ dashboardLayout: nextLayout });
    return nextLayout;
  }

  async exportAllData() {
    const raw = await this.adapter.get({
      [SETTINGS_KEY]: DEFAULT_SETTINGS,
      my_library_links: [],
      my_articles_library: [],
      custom_library_folders: [],
      folder_visual_metadata: {}
    });

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS, ...(raw[SETTINGS_KEY] || {}) },
      library: raw.my_library_links || [],
      articles: raw.my_articles_library || [],
      folders: raw.custom_library_folders || [],
      folderColors: raw.folder_visual_metadata || {}
    };
  }
}

export const settingsRepository = new SettingsRepository();
