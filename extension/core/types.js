/**
 * Core Data Models & Constants
 * Designed for future database interchangeability.
 */

export const ArticleStatus = {
  WANT_TO_READ: 'Want to Read',
  IN_PROGRESS: 'In Progress',
  DONE_READING: 'Done Reading'
};

export const LayoutType = {
  LIST: 'list',
  GRID: 'grid',
  TITLE: 'title'
};

export const SourceType = {
  CHROME: 'chrome',
  LIBRARY: 'library',
  ARTICLE: 'article',
  FOLDER: 'folder'
};

export const FOLDER_COLOR_PALETTES = [
  { id: 'default', name: 'Glass White', color: 'rgba(255, 255, 255, 0.85)', bg: 'rgba(255, 255, 255, 0.12)' },
  { id: 'blue', name: 'Ocean Blue', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.2)' },
  { id: 'purple', name: 'Cosmic Purple', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.2)' },
  { id: 'emerald', name: 'Emerald', color: '#34d399', bg: 'rgba(52, 211, 153, 0.2)' },
  { id: 'amber', name: 'Warm Amber', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)' },
  { id: 'rose', name: 'Rose Quartz', color: '#fb7185', bg: 'rgba(251, 113, 133, 0.2)' },
  { id: 'cyan', name: 'Neon Cyan', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.2)' },
  { id: 'indigo', name: 'Indigo Dream', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.2)' }
];

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

export function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return urlString || '';
  }
}

export function getFaviconUrl(urlString, size = 32) {
  try {
    if (!urlString || typeof urlString !== 'string') return '';
    new URL(urlString);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const url = new URL(chrome.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', urlString);
      url.searchParams.set('size', String(size));
      return url.toString();
    }
    return '';
  } catch {
    return '';
  }
}
