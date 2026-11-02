import { extractDomain, getFaviconUrl } from './types.js';

/**
 * Extract rich metadata from the active browser tab.
 */
export async function getActiveTabMetadata() {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return {
      title: 'Current Webpage',
      url: 'https://example.com',
      domain: 'example.com',
      favicon: getFaviconUrl('https://example.com'),
      coverImage: '',
      description: ''
    };
  }

  try {
    let tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (t) => resolve(t || []));
    });

    let activeTab = tabs && tabs[0];
    if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome-extension://')) {
      const fallbackTabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (t) => resolve(t || []));
      });
      if (fallbackTabs && fallbackTabs[0] && fallbackTabs[0].url && !fallbackTabs[0].url.startsWith('chrome-extension://')) {
        activeTab = fallbackTabs[0];
      }
    }

    if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome-extension://')) {
      return {
        title: '',
        url: '',
        domain: '',
        favicon: '',
        coverImage: '',
        description: ''
      };
    }

    const basic = {
      title: activeTab.title || activeTab.url,
      url: activeTab.url,
      domain: extractDomain(activeTab.url),
      favicon: activeTab.favIconUrl || getFaviconUrl(activeTab.url),
      coverImage: '',
      description: ''
    };

    // Cannot inject scripts into restricted browser URLs
    if (activeTab.url.startsWith('chrome://') || 
        activeTab.url.startsWith('edge://') || 
        activeTab.url.startsWith('chrome-extension://') ||
        activeTab.url.startsWith('about:')) {
      return basic;
    }

    if (chrome.scripting && activeTab.id) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const getMeta = (propNames) => {
              for (const name of propNames) {
                const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
                if (el && el.content) return el.content;
              }
              return '';
            };

            const ogImage = getMeta(['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
            const ogDesc = getMeta(['og:description', 'twitter:description', 'description']);

            // Resolve relative image URLs
            let coverImage = '';
            if (ogImage) {
              try {
                coverImage = new URL(ogImage, window.location.href).href;
              } catch {
                coverImage = ogImage;
              }
            }

            return {
              coverImage,
              description: ogDesc || ''
            };
          }
        });

        if (results && results[0]?.result) {
          const meta = results[0].result;
          basic.coverImage = meta.coverImage || '';
          basic.description = meta.description || '';
        }
      } catch (err) {
        // Script injection failed or forbidden; fallback quietly
        console.debug('Active tab metadata injection skipped:', err);
      }
    }

    return basic;
  } catch (e) {
    console.error('Failed to get active tab metadata:', e);
    return {
      title: '',
      url: '',
      domain: '',
      favicon: '',
      coverImage: '',
      description: ''
    };
  }
}
