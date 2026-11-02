import { chromeBookmarkRepository } from '../repositories/chrome-bookmarks.js';
import { libraryRepository } from '../repositories/library-repository.js';
import { articleRepository } from '../repositories/article-repository.js';

/**
 * DragDropService
 * Coordinates HTML5 Drag & Drop interactions and commits reorder/move
 * mutations directly to the underlying real sources (Chrome API or Library).
 */
export class DragDropService {
  constructor() {
    this.draggedItem = null;
  }

  setDragItem(item) {
    this.draggedItem = item;
  }

  getDragItem() {
    return this.draggedItem;
  }

  clear() {
    this.draggedItem = null;
  }

  /**
   * Handle drop of a bookmark onto a folder or reorder position.
   */
  async handleDrop({ targetType, targetId, targetIndex = null, newParentId = null }) {
    if (!this.draggedItem) return false;

    const source = this.draggedItem.source;
    const itemId = this.draggedItem.id;

    try {
      if (source === 'chrome') {
        // Move in Chrome bookmarks
        const destination = {};
        if (newParentId) {
          destination.parentId = newParentId;
        }
        if (typeof targetIndex === 'number') {
          destination.index = targetIndex;
        }
        await chromeBookmarkRepository.move(itemId, destination);
        return true;
      } else if (source === 'library') {
        if (newParentId !== null) {
          // Move into folder
          await libraryRepository.move(itemId, newParentId);
        }
        if (typeof targetIndex === 'number') {
          // Reorder
          const all = await libraryRepository.getAll();
          const fromIndex = all.findIndex(x => x.id === itemId);
          if (fromIndex !== -1) {
            await libraryRepository.reorder(fromIndex, targetIndex);
          }
        }
        return true;
      } else if (source === 'article') {
        if (typeof targetIndex === 'number') {
          const all = await articleRepository.getAll();
          const fromIndex = all.findIndex(x => x.id === itemId);
          if (fromIndex !== -1) {
            await articleRepository.reorder(fromIndex, targetIndex);
          }
        }
        return true;
      }
    } catch (err) {
      console.error('Drag & drop commit failed:', err);
      return false;
    } finally {
      this.clear();
    }
  }
}

export const dragDropService = new DragDropService();
