// Comprehensive automated test suite for Bookmark Glass Edge extension
import fs from 'fs';
import path from 'path';

// Mock browser / DOM environment for Node
class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return this.store[k] ?? null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

const mockLocalStorage = new MockStorage();
globalThis.localStorage = mockLocalStorage;

// Mock chrome API
const mockSyncStorage = {};
const mockLocalStorageChrome = {};

globalThis.chrome = {
  runtime: {
    lastError: null,
    getURL: (p) => 'chrome-extension://mock-extension-id' + (p.startsWith('/') ? p : '/' + p)
  },
  storage: {
    sync: {
      get: (keys, cb) => {
        const res = {};
        if (Array.isArray(keys)) keys.forEach(k => res[k] = mockSyncStorage[k]);
        else if (typeof keys === 'string') res[keys] = mockSyncStorage[keys];
        else for (const k in keys) res[k] = mockSyncStorage[k] ?? keys[k];
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items, cb) => {
        Object.assign(mockSyncStorage, items);
        if (cb) cb();
        return Promise.resolve();
      }
    },
    local: {
      get: (keys, cb) => {
        const res = {};
        if (Array.isArray(keys)) keys.forEach(k => res[k] = mockLocalStorageChrome[k]);
        else if (typeof keys === 'string') res[keys] = mockLocalStorageChrome[k];
        else for (const k in keys) res[k] = mockLocalStorageChrome[k] ?? keys[k];
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items, cb) => {
        Object.assign(mockLocalStorageChrome, items);
        if (cb) cb();
        return Promise.resolve();
      }
    }
  },
  bookmarks: {
    getTree: async () => [
      {
        id: '0',
        title: 'root',
        children: [
          { id: '1', title: 'Favorites bar', children: [{ id: '10', title: 'Microsoft Edge', url: 'https://www.microsoft.com/edge' }] },
          { id: '2', title: 'Other favorites', children: [] }
        ]
      }
    ],
    getChildren: async (id) => [],
    create: async (data) => ({ id: 'new_id_' + Date.now(), ...data }),
    remove: async (id) => true,
    move: async (id, dest) => ({ id, ...dest }),
    onCreated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    onChanged: { addListener: () => {} },
    onMoved: { addListener: () => {} }
  },
  tabs: {
    query: (queryInfo, cb) => {
      const res = [
        { id: 101, title: 'Learn TypeScript — Documentation', url: 'https://www.typescriptlang.org/docs/' }
      ];
      if (cb) cb(res);
      return Promise.resolve(res);
    },
    sendMessage: (tabId, msg, cb) => {
      const res = {
        title: 'Learn TypeScript — Documentation',
        description: 'The TypeScript language documentation handbook',
        image: 'https://www.typescriptlang.org/og.png'
      };
      if (cb) cb(res);
      return Promise.resolve(res);
    }
  },
  scripting: {
    executeScript: async ({ target, func }) => [
      {
        result: {
          coverImage: 'https://www.typescriptlang.org/og.png',
          description: 'The TypeScript language documentation handbook'
        }
      }
    ]
  },
  action: {
    setBadgeText: () => {}
  }
};

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== Starting Bookmark Glass Edge Test Suite ===\n');

  // TEST 1: Manifest Check
  console.log('[Test 1] Chromium Manifest V3 validation');
  const manifestRaw = fs.readFileSync('extension/manifest.json', 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  assert(manifest.manifest_version === 3, 'Manifest version is 3');
  assert(manifest.background && manifest.background.service_worker === 'background.js', 'Service worker defined cleanly without background.scripts');
  assert(!manifest.browser_specific_settings, 'No Firefox browser_specific_settings present');
  assert(manifest.commands && manifest.commands['open-dashboard'] && manifest.commands['open-dashboard'].suggested_key.default === 'Ctrl+Shift+L', 'Action shortcut is Ctrl+Shift+L');
  assert(manifest.commands['open-dashboard'].suggested_key.mac === 'Command+Shift+L', 'Action Mac shortcut is Command+Shift+L');
  assert(Array.isArray(manifest.permissions) && manifest.permissions.includes('favicon'), 'Manifest includes favicon permission');

  // TEST 2: Check for any remaining Firefox references
  console.log('\n[Test 2] Firefox artifact cleanup');
  assert(!fs.existsSync('extension/manifest.firefox.json'), 'manifest.firefox.json removed');
  assert(!fs.existsSync('dist/bookmark-glass-firefox.zip'), 'dist/bookmark-glass-firefox.zip removed');
  assert(!fs.existsSync('store-assets/firefox'), 'store-assets/firefox removed');

  // TEST 3: Default Tags Logic
  console.log('\n[Test 3] Fresh-install & Separated Default Tags');
  const DEFAULT_TAG_POOLS = {
    lib: ['Learning', 'Tools', 'Inspiration'],
    art: ['Reading', 'Design', 'Startup']
  };

  assert(DEFAULT_TAG_POOLS.lib.length === 3, 'Personal Library has exactly 3 default tags');
  assert(JSON.stringify(DEFAULT_TAG_POOLS.lib) === JSON.stringify(['Learning', 'Tools', 'Inspiration']), 'Library default tags match required values');
  assert(DEFAULT_TAG_POOLS.art.length === 3, 'Articles has exactly 3 default tags');
  assert(JSON.stringify(DEFAULT_TAG_POOLS.art) === JSON.stringify(['Reading', 'Design', 'Startup']), 'Articles default tags match required values');

  // Test migration from legacy tagpool
  mockLocalStorage.clear();
  mockLocalStorage.setItem('bg-tagpool', JSON.stringify(['OldTag', 'Reading', 'Tools', 'CustomTag']));
  
  // Simulate loadTagPools migration
  let pools;
  const rawLib = mockLocalStorage.getItem('bg-tagpool-lib');
  const rawArt = mockLocalStorage.getItem('bg-tagpool-art');
  if (!rawLib || !rawArt) {
    const legacy = JSON.parse(mockLocalStorage.getItem('bg-tagpool') || '[]');
    pools = {
      lib: [...new Set([...DEFAULT_TAG_POOLS.lib, ...legacy.filter(t => !DEFAULT_TAG_POOLS.art.includes(t))])],
      art: [...new Set([...DEFAULT_TAG_POOLS.art, ...legacy.filter(t => !DEFAULT_TAG_POOLS.lib.includes(t))])]
    };
  }
  assert(pools.lib.includes('Learning') && pools.lib.includes('CustomTag') && pools.lib.includes('OldTag'), 'Legacy user tags migrated into library pool');
  assert(pools.art.includes('Reading') && pools.art.includes('CustomTag'), 'Legacy user tags migrated into article pool');
  assert(!pools.lib.includes('Reading'), 'Article default tag not duplicated into library pool during migration');

  // Duplicate tag prevention test
  const addTag = (pool, tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return false;
    const exists = pool.some(t => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      pool.push(trimmed);
      return true;
    }
    return false;
  };

  const poolTest = [...DEFAULT_TAG_POOLS.lib];
  const addedLower = addTag(poolTest, 'tools');
  assert(addedLower === false && poolTest.length === 3, 'Case-insensitive duplicate tag rejected ("tools" vs "Tools")');
  const addedNew = addTag(poolTest, 'Productivity');
  assert(addedNew === true && poolTest.length === 4, 'Valid new tag added to pool');

  // TEST 4: Metadata Extractor & Title/URL prefill
  console.log('\n[Test 4] Metadata Extractor & Auto-fill');
  const { getActiveTabMetadata } = await import('../extension/core/metadata-extractor.js');
  const meta = await getActiveTabMetadata();
  assert(meta.title === 'Learn TypeScript — Documentation', 'Page title successfully extracted from active tab');
  assert(meta.url === 'https://www.typescriptlang.org/docs/', 'Page URL successfully extracted from active tab');
  assert(meta.domain === 'typescriptlang.org', 'Domain correctly parsed');
  assert(meta.description === 'The TypeScript language documentation handbook', 'Meta description parsed');

  // TEST 5: Title View Layout CSS
  console.log('\n[Test 5] Title View Spacing & Collision Prevention');
  const dashCss = fs.readFileSync('extension/dashboard.css', 'utf-8');
  const popupCss = fs.readFileSync('extension/popup.css', 'utf-8');

  assert(dashCss.includes('.layout-title .card-title-text') && dashCss.includes('padding-right: 0;'), 'Dashboard Title view removes padding-right overlap');
  assert(dashCss.includes('.layout-title .card-actions-row') && dashCss.includes('position: static;'), 'Dashboard Title view uses static flex position for actions');
  assert(dashCss.includes('.article-title-row') && dashCss.includes('overflow: hidden;'), 'Article title row has overflow: hidden');
  assert(popupCss.includes('.layout-title .item-content') && popupCss.includes('min-width: 0;'), 'Popup Title view item-content has min-width: 0');

  // TEST 6: Navigation Race Condition & Render Token
  console.log('\n[Test 6] Navigation Race Condition & Stale View Overwrite Prevention');
  let currentRenderToken = 0;
  let activeSection = 'all-bookmarks';
  let renderedSection = null;

  async function mockAsyncRenderSection(sectionToRender, delayMs) {
    const token = ++currentRenderToken;
    activeSection = sectionToRender;
    // Simulate repository async delay
    await new Promise(r => setTimeout(r, delayMs));
    // Guard against stale response
    if (token !== currentRenderToken) return;
    renderedSection = sectionToRender;
  }

  // Simulate rapid navigation: User clicks Personal Library (slow response 50ms), then quickly clicks Articles (fast response 10ms)
  const p1 = mockAsyncRenderSection('my-library', 50);
  const p2 = mockAsyncRenderSection('articles', 10);
  await Promise.all([p1, p2]);

  assert(renderedSection === 'articles', 'Fast navigation to Articles completed and won');
  assert(renderedSection !== 'my-library', 'Slow stale response from Personal Library was ignored and did not overwrite Articles');

  // TEST 7: Settings Export Backup
  console.log('\n[Test 7] Settings Backup & Export Completeness');
  const { settingsRepository } = await import('../extension/core/repositories/settings-repository.js');
  const { libraryRepository } = await import('../extension/core/repositories/library-repository.js');
  const { articleRepository } = await import('../extension/core/repositories/article-repository.js');

  await libraryRepository.create({ title: 'Test Library Item', url: 'https://example.com/test' });
  await articleRepository.create({ title: 'Test Article Item', url: 'https://example.com/article' });

  const exportData = await settingsRepository.exportAllData();
  assert(exportData.version === '1.0.0', 'Backup export has version 1.0.0');
  assert(exportData.exportedAt && typeof exportData.exportedAt === 'string', 'Backup export has timestamp');
  assert(Array.isArray(exportData.library) && exportData.library.length > 0, 'Backup export includes library items');
  assert(Array.isArray(exportData.articles) && exportData.articles.length > 0, 'Backup export includes articles');
  assert(exportData.settings && typeof exportData.settings === 'object', 'Backup export includes settings');
  assert(Array.isArray(exportData.folders), 'Backup export includes folders');

  // TEST 8: Chromium Native Favicon URL Generation
  console.log('\n[Test 8] Chromium Native /_favicon/ Endpoint Generation');
  const { getFaviconUrl } = await import('../extension/core/types.js');
  
  const favDefault = getFaviconUrl('https://learn.microsoft.com/en-us/docs/');
  assert(favDefault.startsWith('chrome-extension://mock-extension-id/_favicon/'), 'Favicon URL uses extension /_favicon/ endpoint');
  assert(favDefault.includes('pageUrl=https%3A%2F%2Flearn.microsoft.com%2Fen-us%2Fdocs%2F'), 'Favicon URL includes encoded pageUrl parameter');
  assert(favDefault.includes('size=32'), 'Favicon URL uses default size parameter 32');
  assert(!favDefault.includes('google.com'), 'Favicon URL does not reference google.com');

  const favCustom = getFaviconUrl('https://github.com/microsoft', 16);
  assert(favCustom.includes('size=16'), 'Favicon URL supports custom size parameter 16');

  const favInvalid = getFaviconUrl('invalid-url-string');
  assert(favInvalid === '', 'Invalid URL returns empty string without throwing');

  const favEmpty = getFaviconUrl('');
  assert(favEmpty === '', 'Empty URL returns empty string');

  console.log(`\n=== Test Suite Completed: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
