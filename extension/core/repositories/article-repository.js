import { storageAdapter } from '../storage-adapter.js';
import { generateUUID, extractDomain, getFaviconUrl, ArticleStatus } from '../types.js';

const STORAGE_KEY = 'my_articles_library';

/**
 * ArticleRepository
 * Dedicated reading tracking and article management layer.
 */
export class ArticleRepository {
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

  async create(data) {
    const all = await this.getAll();
    const now = Date.now();
    const status = data.readingStatus || ArticleStatus.WANT_TO_READ;

    const article = {
      id: generateUUID(),
      title: data.title?.trim() || extractDomain(data.url),
      url: data.url?.trim(),
      favicon: data.favicon || getFaviconUrl(data.url),
      coverImage: data.coverImage || '',
      domain: extractDomain(data.url),
      createdAt: now,
      updatedAt: now,
      readingStatus: status,
      readDate: status === ArticleStatus.DONE_READING ? now : null,
      notes: data.notes?.trim() || '',
      folderId: data.folderId || null,
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      source: 'article'
    };

    all.unshift(article);
    await this.adapter.set({ [STORAGE_KEY]: all });
    this._notify();
    return article;
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

    // If reading status changed to Done Reading, record readDate if not already set
    if (changes.readingStatus) {
      if (changes.readingStatus === ArticleStatus.DONE_READING) {
        if (!updated.readDate) updated.readDate = Date.now();
      } else {
        // When moved back to Want to Read or In Progress, reset readDate
        updated.readDate = null;
      }
    }

    if (changes.tags && typeof changes.tags === 'string') {
      updated.tags = changes.tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    all[index] = updated;
    await this.adapter.set({ [STORAGE_KEY]: all });
    this._notify();
    return updated;
  }

  async setStatus(id, newStatus) {
    return this.update(id, { readingStatus: newStatus });
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

  async existsUrl(url) {
    const all = await this.getAll();
    return all.find(item => item.url?.toLowerCase() === url?.toLowerCase()) || null;
  }

  async queryArticles({ search = '', statuses = [], sortBy = 'newest_saved' } = {}) {
    let articles = await this.getAll();

    // 1. Status Filter (Multi-select)
    if (statuses && statuses.length > 0) {
      articles = articles.filter(a => statuses.includes(a.readingStatus));
    }

    // 2. Search Filter
    if (search) {
      const q = search.toLowerCase().trim();
      articles = articles.filter(a => {
        return (
          a.title?.toLowerCase().includes(q) ||
          a.url?.toLowerCase().includes(q) ||
          a.domain?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q) ||
          (a.tags || []).some(t => t.toLowerCase().includes(q))
        );
      });
    }

    // 3. Date / Status Sorting
    articles.sort((a, b) => {
      switch (sortBy) {
        case 'oldest_saved':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'recently_read':
          return (b.readDate || 0) - (a.readDate || 0);
        case 'oldest_read':
          return (a.readDate || 0) - (b.readDate || 0);
        case 'newest_saved':
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });

    return articles;
  }

  async search(opts = {}) {
    return this.queryArticles({
      search: opts.query || opts.search || '',
      statuses: opts.statusFilters || opts.statuses || [],
      sortBy: opts.sortBy || 'newest_saved'
    });
  }
}

export const articleRepository = new ArticleRepository();
