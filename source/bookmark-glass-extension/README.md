# Bookmark Glass

A Chrome MV3 extension for a fast bookmark launcher and a personal saved-link dashboard.

## Features in this first build
- Reads Chrome bookmarks live.
- Popup with horizontal, vertical and grid layouts.
- Search.
- Glassmorphism/macOS-inspired compact UI.
- Full dashboard.
- Custom saved links and folders.
- Favorites/pins.
- Context-menu "Save to Bookmark Glass".
- Import/export of the custom library JSON.
- Keyboard shortcut: Ctrl/Cmd + Shift + B.

## Run locally

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `dist` folder.

## Notes
Chrome bookmarks are treated as read/live source data. Custom organization is stored separately in `chrome.storage.local`, so your Chrome bookmark tree is not rewritten by the extension.
