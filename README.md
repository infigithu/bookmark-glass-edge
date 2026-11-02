# Bookmark Glass — Microsoft Edge Add-ons Package

**Extension Name**: Bookmark Glass  
**Version**: 1.0.0  
**Target Platform**: Microsoft Edge (Desktop, Chromium MV3)  
**Manifest Version**: Manifest V3  

---

## 1. Overview & Architecture

Bookmark Glass is a browser extension providing a fast bookmark launcher, custom library archive, and reading tracker with glassmorphism aesthetics.

### Zero-Build / Zero-Transpilation Architecture
- **No Transpiler**: The extension is written in standard modern JavaScript (ES2022+), CSS3, and HTML5 using WebExtension APIs. No TypeScript, Babel, or JSX transpilation is used.
- **No Bundler**: There is no Webpack, Rollup, Vite, or Parcel bundling. Modules and scripts are structured in clean, human-readable source files under the `extension/` directory.
- **No Minification or Obfuscation**: All JavaScript and CSS files are provided in their original, readable, and fully formatted form without minification or code mangling.
- **Build / Packaging Role**: The packaging script (`package-release.sh`) performs a deterministic packaging step:
  1. Copies `extension/` to a clean staging directory.
  2. Removes `.DS_Store` and temporary metadata.
  3. Archives the staging directory into `dist/bookmark-glass-edge.zip` with files directly at the root.

---

## 2. Environment & Prerequisites

To reproduce the submitted package, you need a standard POSIX-compatible shell environment:

| Requirement | Supported Versions | Notes |
| :--- | :--- | :--- |
| **Operating System** | macOS, Linux, Windows (WSL2 / Git Bash) | Platform-independent |
| **Shell** | `bash` 3.2 or later | Standard on macOS / Linux |
| **Compression Utility** | `zip` (Info-ZIP 3.0+) and `unzip` | Standard system packages |
| **Node.js (Optional)** | Node.js v18.x or v20.x+ | Optional for automated testing |

---

## 3. Directory Structure

```text
.
├── README.md                      # Build and verification guide
├── README.txt                     # Quick installation reference
├── package-release.sh             # Deterministic packaging script for Edge
├── privacy-policy.html            # Standalone privacy policy document
├── store-assets/                  # Store submission assets
│   └── edge/                      # Edge Add-ons 300x300 logo, screenshots, listing text
└── extension/                     # Complete, human-readable source code
    ├── manifest.json              # Clean Edge Chromium Manifest V3
    ├── background.js              # Background service worker / event handlers
    ├── common.css                 # Shared CSS variables and glassmorphism design tokens
    ├── dashboard.html             # Desktop dashboard markup
    ├── dashboard.js               # Desktop dashboard logic
    ├── dashboard.css              # Desktop dashboard stylesheet
    ├── popup.html                 # Extension popup markup
    ├── popup.js                   # Extension popup logic
    ├── popup.css                  # Extension popup stylesheet
    ├── privacy-policy.html        # Local privacy policy
    ├── icon.svg                   # Extension vector icon
    ├── icon16.png                 # Extension 16x16 icon
    ├── icon32.png                 # Extension 32x32 icon
    ├── icon48.png                 # Extension 48x48 icon
    ├── icon128.png                # Extension 128x128 icon
    ├── core/                      # Data layer, storage adapters, and business logic
    │   ├── metadata-extractor.js  # Active tab & Open Graph metadata scraper
    │   ├── storage-adapter.js     # Unified storage wrapper
    │   ├── types.js               # Common enums and data models
    │   ├── repositories/          # Domain repositories (Bookmarks, Articles, Library, Settings)
    │   │   ├── article-repository.js
    │   │   ├── chrome-bookmarks.js
    │   │   ├── folder-repository.js
    │   │   ├── library-repository.js
    │   │   └── settings-repository.js
    │   └── services/              # Domain services
    │       ├── drag-drop-service.js
    │       └── search-service.js
    └── ui/                        # Accessible UI components
        ├── confirm-dialog.js
        ├── folder-menu.js
        ├── save-dialog.js
        └── toast.js
```

---

## 4. Packaging Instructions

### Run the Build Command
To produce the exact Microsoft Edge distribution package, run:
```bash
./package-release.sh
```

### Output Package
The release archive is located at:
```text
dist/bookmark-glass-edge.zip
```

---

## 5. Local Testing in Microsoft Edge

1. Open Microsoft Edge and navigate to `edge://extensions`.
2. Toggle **Developer mode** on in the left sidebar.
3. Click **Load unpacked**.
4. Select the `extension/` directory.
5. The extension will load with all features active.

---

## 6. Automated Testing

To run the automated regression test suite (unit and integration tests):
```bash
node tests/test_suite.js
```

To run interactive headless browser navigation and view tests:
```bash
node tests/test_browser_nav_and_views.js
```

To run native Microsoft Edge integration tests (requires Microsoft Edge installed):
```bash
node tests/test_in_microsoft_edge.js
```
