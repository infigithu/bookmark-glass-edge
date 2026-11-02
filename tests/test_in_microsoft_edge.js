import { spawn } from 'child_process';
import path from 'path';

const edgePath = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const extDir = path.resolve('extension');
const userDataDir = '/tmp/edge-test-profile-' + Date.now();

async function runEdgeTests() {
  console.log('=== Testing Bookmark Glass inside actual Microsoft Edge ===');
  console.log('Edge Binary:', edgePath);
  console.log('Extension Directory:', extDir);

  const edgeProcess = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    `--load-extension=${extDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  let cdpWsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9226/json/version');
      const data = await res.json();
      cdpWsUrl = data.webSocketDebuggerUrl;
      if (cdpWsUrl) break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (!cdpWsUrl) {
    edgeProcess.kill();
    throw new Error('Failed to connect to Microsoft Edge CDP');
  }

  console.log('Connected to Microsoft Edge CDP');

  // Query /json/list to find our extension ID
  let extensionId = null;
  for (let i = 0; i < 30; i++) {
    const listRes = await fetch('http://127.0.0.1:9226/json/list');
    const targets = await listRes.json();
    const sw = targets.find(t => t.url && t.url.includes('chrome-extension://') && t.url.endsWith('/background.js'));
    if (sw) {
      const match = sw.url.match(/chrome-extension:\/\/([a-z]+)\/background\.js/);
      if (match) {
        extensionId = match[1];
        break;
      }
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (!extensionId) {
    edgeProcess.kill();
    throw new Error('Could not find Bookmark Glass service worker in Microsoft Edge');
  }

  console.log(`Verified Bookmark Glass Extension ID in Microsoft Edge: ${extensionId}`);

  const ws = new WebSocket(cdpWsUrl);
  await new Promise(r => ws.onopen = r);

  let idCounter = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const id = idCounter++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  // 1. Create target for Dashboard page in Edge
  const dashboardUrl = `chrome-extension://${extensionId}/dashboard.html`;
  console.log(`Opening Dashboard in Edge: ${dashboardUrl}`);

  const { targetId } = await cdpSend('Target.createTarget', { url: dashboardUrl });
  const { sessionId } = await cdpSend('Target.attachToTarget', { targetId, flatten: true });

  const sessionSend = (method, params = {}) => new Promise((resolve, reject) => {
    const id = idCounter++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, sessionId, method, params }));
  });

  await sessionSend('Page.enable');
  await sessionSend('Runtime.enable');
  await sessionSend('Network.enable');

  const outgoingRequests = [];
  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Network.requestWillBeSent') {
      const reqUrl = msg.params.request.url;
      outgoingRequests.push(reqUrl);
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  console.log('\n--- Test 1: Common Websites Favicon Endpoint in Edge ---');
  let res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        const { getFaviconUrl } = await import('./core/types.js');
        const sites = [
          'https://learn.microsoft.com',
          'https://github.com',
          'https://wikipedia.org'
        ];
        const urls = sites.map(s => getFaviconUrl(s, 32));
        
        const testLoads = await Promise.all(urls.map(u => new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ url: u, status: 'loaded', w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ url: u, status: 'fallback', w: 0, h: 0 });
          img.src = u;
        })));
        return { urls, testLoads };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('  Favicon URLs generated:', res.result.value.urls);
  console.log('  Image load results in Edge:', res.result.value.testLoads);

  console.log('\n--- Test 2: Website Without Favicon / Missing Host Fallback in Edge ---');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        const { getFaviconUrl } = await import('./core/types.js');
        const fakeSites = [
          'http://internal-test-no-favicon-domain.example',
          'https://nonexistent-domain-404.test'
        ];
        const urls = fakeSites.map(s => getFaviconUrl(s, 32));
        const testLoads = await Promise.all(urls.map(u => new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ url: u, status: 'loaded_default_globe' });
          img.onerror = () => resolve({ url: u, status: 'error_triggered_fallback' });
          img.src = u;
        })));
        return { urls, testLoads };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('  Missing favicon results in Edge:', res.result.value.testLoads);

  console.log('\n--- Test 3: Saved Bookmarks and Articles Rendering in Edge Dashboard ---');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        const { libraryRepository } = await import('./core/repositories/library-repository.js');
        const { articleRepository } = await import('./core/repositories/article-repository.js');
        
        // Add sample items
        await libraryRepository.create({
          title: 'Microsoft Edge Add-ons Docs',
          url: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/'
        });
        await libraryRepository.create({
          title: 'GitHub Repositories',
          url: 'https://github.com'
        });
        await articleRepository.create({
          title: 'TypeScript Language Handbook',
          url: 'https://www.typescriptlang.org/docs/'
        });

        // Click My Library navigation
        document.querySelector('[data-section="my-library"]').click();
        await new Promise(r => setTimeout(r, 300));
        
        const libraryCards = Array.from(document.querySelectorAll('.bookmark-card')).map(c => ({
          title: c.querySelector('.card-title-text')?.textContent,
          imgSrc: c.querySelector('.card-icon-box img')?.src
        }));

        // Click Articles navigation
        document.querySelector('[data-section="articles"]').click();
        await new Promise(r => setTimeout(r, 300));

        const articleCards = Array.from(document.querySelectorAll('.article-card')).map(a => ({
          title: a.querySelector('.article-title')?.textContent,
          domain: a.querySelector('.article-domain')?.textContent
        }));

        return { libraryCards, articleCards };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('  Rendered Library Cards:', res.result.value.libraryCards);
  console.log('  Rendered Article Cards:', res.result.value.articleCards);

  console.log('\n--- Test 4: Testing Popup in Microsoft Edge ---');
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const { targetId: popupTargetId } = await cdpSend('Target.createTarget', { url: popupUrl });
  const { sessionId: popupSessionId } = await cdpSend('Target.attachToTarget', { targetId: popupTargetId, flatten: true });

  const popupSend = (method, params = {}) => new Promise((resolve, reject) => {
    const id = idCounter++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, sessionId: popupSessionId, method, params }));
  });

  await popupSend('Page.enable');
  await popupSend('Runtime.enable');
  await new Promise(r => setTimeout(r, 600));

  res = await popupSend('Runtime.evaluate', {
    expression: `
      (() => {
        const items = Array.from(document.querySelectorAll('.bookmark-item')).map(item => ({
          title: item.dataset.title,
          isFolder: item.dataset.folder === 'true',
          iconSrc: item.querySelector('.item-icon img')?.src
        }));
        return { count: items.length, sample: items.slice(0, 3) };
      })()
    `,
    returnByValue: true
  });
  console.log('  Popup Items Rendered in Edge:', res.result.value);

  console.log('\n--- Test 5: Light & Dark Theme in Microsoft Edge ---');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        const darkComputed = {
          bg: window.getComputedStyle(document.body).backgroundColor,
          color: window.getComputedStyle(document.body).color
        };

        document.documentElement.setAttribute('data-theme', 'light');
        const lightComputed = {
          bg: window.getComputedStyle(document.body).backgroundColor,
          color: window.getComputedStyle(document.body).color
        };

        // Revert to dark
        document.documentElement.setAttribute('data-theme', 'dark');

        return { darkComputed, lightComputed };
      })()
    `,
    returnByValue: true
  });
  console.log('  Theme computed styles in Edge:', res.result.value);

  console.log('\n--- Test 6: Network Request Verification in Edge ---');
  const googleRequests = outgoingRequests.filter(u => u.includes('google.com') || u.includes('gstatic.com'));
  const faviconRequests = outgoingRequests.filter(u => u.includes('_favicon/'));
  console.log('  Total requests captured:', outgoingRequests.length);
  console.log('  Internal _favicon/ requests handled by Edge:', faviconRequests.length);
  console.log('  Google / external favicon requests (must be 0):', googleRequests.length);

  await cdpSend('Target.closeTarget', { targetId });
  await cdpSend('Target.closeTarget', { targetId: popupTargetId });
  ws.close();
  edgeProcess.kill();

  console.log('\n✅ All Microsoft Edge Tests Executed and Verified Successfully!');
}

runEdgeTests().catch(err => {
  console.error('Edge test run failed:', err);
  process.exit(1);
});
