/**
 * Abstract Storage Adapter
 * Decouples the repositories from direct chrome.storage or browser localStorage APIs.
 * Can be swapped with a RemoteDatabaseAdapter in the future.
 */

export class StorageAdapter {
  async get(keys) {
    throw new Error('Method get() must be implemented');
  }
  async set(items) {
    throw new Error('Method set() must be implemented');
  }
  async remove(keys) {
    throw new Error('Method remove() must be implemented');
  }
}

export class ChromeStorageAdapter extends StorageAdapter {
  constructor(area = 'local') {
    super();
    this.area = area;
  }

  async get(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[this.area]) {
      return new Promise((resolve) => {
        chrome.storage[this.area].get(keys, (res) => resolve(res || {}));
      });
    }
    // Fallback to localStorage if chrome.storage is not available
    const result = {};
    if (typeof keys === 'string') {
      const raw = localStorage.getItem(keys);
      if (raw !== null) {
        try { result[keys] = JSON.parse(raw); } catch { result[keys] = raw; }
      }
    } else if (Array.isArray(keys)) {
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (raw !== null) {
          try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
        }
      }
    } else if (typeof keys === 'object' && keys !== null) {
      for (const [k, defaultVal] of Object.entries(keys)) {
        const raw = localStorage.getItem(k);
        if (raw !== null) {
          try { result[k] = JSON.parse(raw); } catch { result[k] = raw; }
        } else {
          result[k] = defaultVal;
        }
      }
    }
    return result;
  }

  async set(items) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[this.area]) {
      return new Promise((resolve) => {
        chrome.storage[this.area].set(items, () => resolve());
      });
    }
    // Fallback to localStorage
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  }

  async remove(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[this.area]) {
      return new Promise((resolve) => {
        chrome.storage[this.area].remove(keys, () => resolve());
      });
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      localStorage.removeItem(k);
    }
  }
}

// Global default adapter singleton
export const storageAdapter = new ChromeStorageAdapter('local');
