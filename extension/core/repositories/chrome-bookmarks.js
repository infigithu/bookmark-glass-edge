import { extractDomain, getFaviconUrl } from '../types.js';

/**
 * ChromeBookmarkRepository
 * Real integration with chrome.bookmarks API.
 * Modifies and syncs directly with the Chrome bookmarks engine.
 */
export class ChromeBookmarkRepository {
  constructor() {
    this.isSupported = typeof chrome !== 'undefined' && Boolean(chrome.bookmarks);
    this._listeners = new Set();
    this._mockTree = null;

    if (this.isSupported) {
      const notify = () => this._notifyListeners();
      chrome.bookmarks.onCreated.addListener(notify);
      chrome.bookmarks.onRemoved.addListener(notify);
      chrome.bookmarks.onChanged.addListener(notify);
      const onReordered = chrome.bookmarks['onChildrenReordered'];
      if (onReordered && typeof onReordered.addListener === 'function') {
        onReordered.addListener(notify);
      }
    } else {
      this._initMockTree();
    }
  }

  _initMockTree() {
    this._mockTree = [
      {
        id: '0',
        title: 'Root',
        children: [
          {
            id: '1',
            title: 'Bookmarks bar',
            children: [
              { id: '101', title: 'Google', url: 'https://www.google.com', parentId: '1' },
              { id: '102', title: 'YouTube', url: 'https://www.youtube.com', parentId: '1' },
              { id: '103', title: 'GitHub', url: 'https://github.com', parentId: '1' },
              { id: '104', title: 'Notion', url: 'https://www.notion.so', parentId: '1' },
              {
                id: '105',
                title: 'Learning',
                parentId: '1',
                children: [
                  { id: '106', title: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu', parentId: '105' },
                  { id: '107', title: 'Coursera', url: 'https://www.coursera.org', parentId: '105' },
                  { id: '108', title: 'Mathematics', url: 'https://mathworld.wolfram.com', parentId: '105' }
                ]
              },
              {
                id: '109',
                title: 'Work',
                parentId: '1',
                children: [
                  { id: '110', title: 'Gmail', url: 'https://mail.google.com', parentId: '109' },
                  { id: '111', title: 'Drive', url: 'https://drive.google.com', parentId: '109' },
                  { id: '112', title: 'Docs', url: 'https://docs.google.com', parentId: '109' }
                ]
              },
              {
                id: '113',
                title: 'Design Tools',
                parentId: '1',
                children: [
                  { id: '114', title: 'Dribbble', url: 'https://dribbble.com', parentId: '113' },
                  { id: '115', title: 'Behance', url: 'https://www.behance.net', parentId: '113' }
                ]
              },
              {
                id: '116',
                title: 'Development',
                parentId: '1',
                children: [
                  { id: '117', title: 'Stack Overflow', url: 'https://stackoverflow.com', parentId: '116' },
                  { id: '118', title: 'npm registry', url: 'https://www.npmjs.com', parentId: '116' }
                ]
              }
            ]
          },
          {
            id: '2',
            title: 'Other bookmarks',
            children: [
              { id: '201', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', parentId: '2' },
              { id: '202', title: 'Hacker News', url: 'https://news.ycombinator.com', parentId: '2' }
            ]
          }
        ]
      }
    ];
  }

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notifyListeners() {
    for (const listener of this._listeners) {
      try { listener(); } catch (e) { console.error(e); }
    }
  }

  async getTree() {
    if (this.isSupported) {
      return new Promise((resolve) => {
        chrome.bookmarks.getTree((tree) => resolve(tree || []));
      });
    }
    return JSON.parse(JSON.stringify(this._mockTree));
  }

  async getDefaultFolderId() {
    const tree = await this.getTree();
    const root = tree && tree[0];
    if (!root || !root.children || !root.children.length) return '1';
    // Dynamically match Bookmarks / Favorites bar folder ('1' or title matching bar/favorites)
    const bar = root.children.find(c => {
      const title = (c.title || '').toLowerCase();
      return c.id === '1' || c.id === 'toolbar_____' || title.includes('bar') || title.includes('toolbar') || title.includes('favorites');
    }) || root.children[0];
    return bar ? bar.id : '1';
  }

  async getBookmarkBar() {
    const tree = await this.getTree();
    const root = tree[0];
    if (!root || !root.children) return [];
    const bar = root.children.find(c => {
      const title = (c.title || '').toLowerCase();
      return c.id === '1' || c.id === 'toolbar_____' || title.includes('bar') || title.includes('toolbar') || title.includes('favorites');
    }) || root.children[0];
    return bar ? bar.children || [] : [];
  }

  async getFolders() {
    const tree = await this.getTree();
    const folders = [];
    const traverse = (node, path = []) => {
      if (!node.url && node.id !== '0') {
        const currentPath = [...path, node.title || 'Folder'];
        const isBar = node.id === '1' || node.id === 'toolbar_____' || (node.title || '').toLowerCase().includes('bar') || (node.title || '').toLowerCase().includes('toolbar');
        folders.push({
          id: node.id,
          title: node.title || 'Untitled Folder',
          parentId: node.parentId,
          path: currentPath.join(' / '),
          childrenCount: (node.children || []).length,
          isBookmarkBar: isBar
        });
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child, node.id === '0' ? [] : [...path, node.title]);
        }
      }
    };
    if (tree[0]) traverse(tree[0]);
    return folders;
  }

  async getAllBookmarks() {
    const tree = await this.getTree();
    const bookmarks = [];
    const traverse = (node, folderName = 'Other bookmarks') => {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title || extractDomain(node.url),
          url: node.url,
          parentId: node.parentId,
          folderName,
          favicon: getFaviconUrl(node.url),
          domain: extractDomain(node.url),
          dateAdded: node.dateAdded || Date.now(),
          source: 'chrome'
        });
      }
      if (node.children) {
        const currentFolder = node.title || folderName;
        for (const child of node.children) {
          traverse(child, currentFolder);
        }
      }
    };
    if (tree[0]) traverse(tree[0]);
    return bookmarks;
  }

  async getChildren(parentId) {
    if (this.isSupported) {
      return new Promise((resolve) => {
        chrome.bookmarks.getChildren(parentId, (children) => resolve(children || []));
      });
    }
    const tree = await this.getTree();
    let result = [];
    const find = (node) => {
      if (node.id === parentId) {
        result = node.children || [];
        return true;
      }
      if (node.children) {
        for (const c of node.children) {
          if (find(c)) return true;
        }
      }
      return false;
    };
    find(tree[0]);
    return result;
  }

  async create(data) {
    // data: { parentId, title, url }
    const resolvedParentId = data.parentId || await this.getDefaultFolderId();
    const payload = { ...data, parentId: resolvedParentId };
    if (this.isSupported) {
      return new Promise((resolve, reject) => {
        chrome.bookmarks.create(payload, (node) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(node);
        });
      });
    }
    const newNode = {
      id: 'mock-' + Date.now(),
      parentId: resolvedParentId,
      title: data.title || '',
      url: data.url
    };
    const attach = (node) => {
      if (node.id === newNode.parentId) {
        node.children = node.children || [];
        node.children.push(newNode);
        return true;
      }
      if (node.children) {
        for (const c of node.children) if (attach(c)) return true;
      }
      return false;
    };
    attach(this._mockTree[0]);
    this._notifyListeners();
    return newNode;
  }

  async createFolder(title, parentId = null) {
    const targetParentId = parentId || await this.getDefaultFolderId();
    return this.create({ title, parentId: targetParentId });
  }

  async update(id, changes) {
    if (this.isSupported) {
      return new Promise((resolve, reject) => {
        chrome.bookmarks.update(id, changes, (node) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(node);
        });
      });
    }
    const find = (node) => {
      if (node.id === id) {
        Object.assign(node, changes);
        return true;
      }
      if (node.children) {
        for (const c of node.children) if (find(c)) return true;
      }
      return false;
    };
    find(this._mockTree[0]);
    this._notifyListeners();
  }

  async move(id, destination) {
    // destination: { parentId, index }
    if (this.isSupported) {
      return new Promise((resolve, reject) => {
        chrome.bookmarks.move(id, destination, (node) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(node);
        });
      });
    }

    // Mock tree move
    let movedNode = null;
    const detach = (parent) => {
      if (!parent || !parent.children) return false;
      const idx = parent.children.findIndex(c => c.id === id);
      if (idx !== -1) {
        movedNode = parent.children.splice(idx, 1)[0];
        return true;
      }
      for (const c of parent.children) {
        if (detach(c)) return true;
      }
      return false;
    };
    detach(this._mockTree[0]);

    if (movedNode && destination.parentId) {
      movedNode.parentId = destination.parentId;
      const attach = (parent) => {
        if (parent.id === destination.parentId) {
          parent.children = parent.children || [];
          if (typeof destination.index === 'number') {
            parent.children.splice(destination.index, 0, movedNode);
          } else {
            parent.children.push(movedNode);
          }
          return true;
        }
        if (parent.children) {
          for (const c of parent.children) {
            if (attach(c)) return true;
          }
        }
        return false;
      };
      attach(this._mockTree[0]);
    }

    this._notifyListeners();
    return movedNode || true;
  }

  async remove(id) {
    if (this.isSupported) {
      return new Promise((resolve, reject) => {
        chrome.bookmarks.remove(id, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
    const removeNode = (node) => {
      if (!node.children) return false;
      const idx = node.children.findIndex(c => c.id === id);
      if (idx !== -1) {
        node.children.splice(idx, 1);
        return true;
      }
      for (const c of node.children) if (removeNode(c)) return true;
      return false;
    };
    removeNode(this._mockTree[0]);
    this._notifyListeners();
  }

  async removeTree(id) {
    if (this.isSupported) {
      return new Promise((resolve, reject) => {
        chrome.bookmarks.removeTree(id, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
    return this.remove(id);
  }
}

export const chromeBookmarkRepository = new ChromeBookmarkRepository();
