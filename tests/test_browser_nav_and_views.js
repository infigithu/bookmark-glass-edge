import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { sampleArticles, sampleLibrary, sampleFolderVisualMetadata } from './sample_data.js';

async function runBrowserTest() {
  console.log('--- Starting Headless Chromium Interactive Navigation & View Tests ---');

  const extDir = path.resolve('extension');
  const scratchDir = path.resolve('scratch');

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    let filePath;
    if (reqPath.startsWith('/scratch/')) {
      filePath = path.join(scratchDir, reqPath.replace('/scratch/', ''));
    } else {
      filePath = path.join(extDir, reqPath);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png'
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise(resolve => server.listen(3499, '127.0.0.1', resolve));

  const userDataDir = '/tmp/chrome-test-profile-' + Date.now();
  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  let cdpWsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json/version');
      const data = await res.json();
      cdpWsUrl = data.webSocketDebuggerUrl;
      if (cdpWsUrl) break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (!cdpWsUrl) throw new Error('Could not connect to Chrome CDP');

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

  const { targetId } = await cdpSend('Target.createTarget', { url: 'http://127.0.0.1:3499/dashboard.html' });
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
  await sessionSend('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Inject sample data into local/sync storage before page scripts initialize
  await sessionSend('Runtime.evaluate', {
    expression: `
      window.localStorage.setItem('my_articles_library', '${JSON.stringify(sampleArticles).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
      window.localStorage.setItem('my_library_links', '${JSON.stringify(sampleLibrary).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
      window.localStorage.setItem('folder_visual_metadata', '${JSON.stringify(sampleFolderVisualMetadata).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
      window.localStorage.setItem('bookmark_glass_settings', JSON.stringify({
        dashboardLayout: 'grid',
        popupLayout: 'list',
        defaultSaveDestination: 'chrome',
        articleView: 'card',
        accentColor: 'blue',
        theme: 'dark'
      }));
    `
  });

  await sessionSend('Page.reload');
  await new Promise(r => setTimeout(r, 600));

  // Test 1: Navigation to Personal Library
  console.log('1. Navigating to Personal Library...');
  let res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        document.querySelector('[data-section="my-library"]').click();
        await new Promise(r => setTimeout(r, 100));
        const heading = document.querySelector('#section-heading').textContent;
        const count = document.querySelectorAll('#items-grid-wrapper .bookmark-card').length;
        const layoutClass = document.querySelector('#items-grid-wrapper').className;
        return { heading, count, layoutClass };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Personal Library result:', res.result.value);
  if (res.result.value.heading !== 'My Library' || res.result.value.count === 0) {
    throw new Error('Personal Library failed to render');
  }

  // Test 2: Switch to Title Layout in My Library
  console.log('2. Switching layout to Title View...');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        document.querySelector('[data-layout="title"]').click();
        await new Promise(r => setTimeout(r, 100));
        const layoutClass = document.querySelector('#items-grid-wrapper').className;
        const titleBtnActive = document.querySelector('[data-layout="title"]').classList.contains('active');
        return { layoutClass, titleBtnActive };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Title layout result:', res.result.value);
  if (!res.result.value.layoutClass.includes('layout-title') || !res.result.value.titleBtnActive) {
    throw new Error('Title layout not properly applied');
  }

  // Test 3: Navigate to Articles
  console.log('3. Navigating to Articles...');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        document.querySelector('[data-section="articles"]').click();
        await new Promise(r => setTimeout(r, 100));
        const heading = document.querySelector('#section-heading').textContent;
        const articleCount = document.querySelectorAll('#items-grid-wrapper .article-card').length;
        const libraryCards = document.querySelectorAll('#items-grid-wrapper .bookmark-card').length;
        const layoutGroupDisplay = document.querySelector('#dashboard-layout-group').style.display;
        return { heading, articleCount, libraryCards, layoutGroupDisplay };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Articles result:', res.result.value);
  if (res.result.value.heading !== 'Articles' || res.result.value.articleCount === 0 || res.result.value.libraryCards > 0) {
    throw new Error('Articles view failed or contained stale library cards');
  }

  // Test 4: Navigate back to My Library - check layout restored to Title View
  console.log('4. Navigating back to My Library to verify layout restoration...');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        document.querySelector('[data-section="my-library"]').click();
        await new Promise(r => setTimeout(r, 100));
        const layoutClass = document.querySelector('#items-grid-wrapper').className;
        const activeBtn = document.querySelector('#dashboard-layout-group .layout-btn.active').dataset.layout;
        const cardCount = document.querySelectorAll('#items-grid-wrapper .bookmark-card').length;
        const articleCount = document.querySelectorAll('#items-grid-wrapper .article-card').length;
        return { layoutClass, activeBtn, cardCount, articleCount };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Returned to My Library result:', res.result.value);
  if (!res.result.value.layoutClass.includes('layout-title') || res.result.value.activeBtn !== 'title') {
    throw new Error('Layout preference was not restored properly on navigation back');
  }
  if (res.result.value.articleCount > 0) {
    throw new Error('Stale article card leaked into My Library');
  }

  // Test 5: Rapid section clicking stress test
  console.log('5. Stress testing rapid section navigation...');
  res = await sessionSend('Runtime.evaluate', {
    expression: `
      (async () => {
        const sections = ['all-bookmarks', 'bookmark-bar', 'folders', 'my-library', 'articles', 'settings', 'my-library'];
        for (const s of sections) {
          const btn = document.querySelector('[data-section="' + s + '"]');
          if (btn) btn.click();
          await new Promise(r => setTimeout(r, 10)); // rapid 10ms clicks
        }
        // Wait for all async promises to settle
        await new Promise(r => setTimeout(r, 300));
        const heading = document.querySelector('#section-heading').textContent;
        const cardCount = document.querySelectorAll('#items-grid-wrapper .bookmark-card').length;
        const articleCount = document.querySelectorAll('#items-grid-wrapper .article-card').length;
        return { finalHeading: heading, cardCount, articleCount };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('   Rapid navigation result:', res.result.value);
  if (res.result.value.finalHeading !== 'My Library' || res.result.value.articleCount > 0) {
    throw new Error('Rapid navigation resulted in stale DOM or incorrect final view');
  }

  // Cleanup
  ws.close();
  chromeProcess.kill();
  server.close();

  console.log('\n✅ All Headless Browser Navigation & Layout Tests Passed Successfully!');
}

runBrowserTest().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});

