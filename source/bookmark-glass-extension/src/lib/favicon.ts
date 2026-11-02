export function faviconUrl(url: string, size = 32) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', url);
      u.searchParams.set('size', String(size));
      return u.toString();
    }
    return '';
  } catch {
    return '';
  }
}
