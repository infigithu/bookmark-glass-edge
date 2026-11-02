import { chromeBookmarkRepository } from '../repositories/chrome-bookmarks.js';
import { libraryRepository } from '../repositories/library-repository.js';
import { articleRepository } from '../repositories/article-repository.js';
import { folderRepository } from '../repositories/folder-repository.js';
import { SourceType } from '../types.js';

/**
 * SearchService
 * Unified search engine across Chrome Bookmarks, My Library, Articles, and Folders.
 */
export class SearchService {
  async searchAll(query) {
    if (!query || !query.trim()) return [];
    const q = query.toLowerCase().trim();

    const [chromeBookmarks, libraryLinks, articles, chromeFolders, customFolders] = await Promise.all([
      chromeBookmarkRepository.getAllBookmarks(),
      libraryRepository.getAll(),
      articleRepository.getAll(),
      chromeBookmarkRepository.getFolders(),
      folderRepository.getCustomFolders()
    ]);

    const results = [];

    // 1. Chrome Bookmarks
    for (const b of chromeBookmarks) {
      if (
        b.title?.toLowerCase().includes(q) ||
        b.url?.toLowerCase().includes(q) ||
        b.folderName?.toLowerCase().includes(q) ||
        b.domain?.toLowerCase().includes(q)
      ) {
        results.push({
          id: b.id,
          title: b.title,
          url: b.url,
          favicon: b.favicon,
          subtext: b.folderName ? `Folder: ${b.folderName}` : b.domain,
          source: SourceType.CHROME,
          sourceLabel: 'Browser Bookmark',
          raw: b
        });
      }
    }

    // 2. My Library
    for (const l of libraryLinks) {
      if (
        l.title?.toLowerCase().includes(q) ||
        l.url?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        (l.tags || []).some(t => t.toLowerCase().includes(q))
      ) {
        results.push({
          id: l.id,
          title: l.title,
          url: l.url,
          favicon: l.favicon,
          subtext: l.tags?.length ? `Tags: ${l.tags.join(', ')}` : (l.notes || l.url),
          source: SourceType.LIBRARY,
          sourceLabel: 'My Library',
          raw: l
        });
      }
    }

    // 3. Articles
    for (const a of articles) {
      if (
        a.title?.toLowerCase().includes(q) ||
        a.url?.toLowerCase().includes(q) ||
        a.domain?.toLowerCase().includes(q) ||
        a.notes?.toLowerCase().includes(q) ||
        a.readingStatus?.toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.toLowerCase().includes(q))
      ) {
        results.push({
          id: a.id,
          title: a.title,
          url: a.url,
          favicon: a.favicon,
          coverImage: a.coverImage,
          subtext: `${a.readingStatus} • ${a.domain}`,
          source: SourceType.ARTICLE,
          sourceLabel: 'Article',
          raw: a
        });
      }
    }

    // 4. Folders
    for (const f of chromeFolders) {
      if (f.title?.toLowerCase().includes(q) || f.path?.toLowerCase().includes(q)) {
        results.push({
          id: f.id,
          title: f.title,
          url: null,
          favicon: null,
          subtext: `Browser Folder • ${f.childrenCount || 0} items`,
          source: SourceType.FOLDER,
          sourceLabel: 'Browser Folder',
          isFolder: true,
          raw: f
        });
      }
    }

    for (const cf of customFolders) {
      if (cf.name?.toLowerCase().includes(q)) {
        results.push({
          id: cf.id,
          title: cf.name,
          url: null,
          favicon: null,
          subtext: 'Library Folder',
          source: SourceType.FOLDER,
          sourceLabel: 'Library Folder',
          isFolder: true,
          raw: cf
        });
      }
    }

    return results;
  }
}

export const searchService = new SearchService();
