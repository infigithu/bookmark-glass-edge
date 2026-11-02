import fs from 'fs';

// Helper to create beautiful SVG cover images as data URLs
function createCoverSvg(title, category, gradientFrom, gradientTo, icon) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${gradientFrom}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${gradientTo}" stop-opacity="0.8" />
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="600" height="300" fill="#0d0f17" />
  <rect width="600" height="300" fill="url(#grad)" opacity="0.85" />
  <rect width="600" height="300" fill="url(#glow)" />
  <circle cx="500" cy="80" r="120" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
  <circle cx="500" cy="80" r="80" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
  <text x="40" y="70" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.7)" letter-spacing="2">${category.toUpperCase()}</text>
  <text x="40" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${title}</text>
  <text x="500" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="48" fill="rgba(255,255,255,0.4)">${icon}</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const sampleArticles = [
  {
    id: 'art-1',
    title: 'Designing Fluid Interfaces & Spatial Physics',
    url: 'https://developer.apple.com/design/human-interface-guidelines/',
    domain: 'developer.apple.com',
    favicon: '',
    coverImage: createCoverSvg('Designing Fluid Interfaces', 'Design & UI', '#3b82f6', '#1d4ed8', '✦'),
    readingStatus: 'Want to Read',
    readDate: null,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
    notes: 'Key principles for gesture-driven animations, spring physics, and spatial design.',
    tags: ['design', 'ux', 'motion'],
    folderId: null,
    source: 'article'
  },
  {
    id: 'art-2',
    title: 'Modern CSS Grid & Glassmorphism Patterns',
    url: 'https://css-tricks.com/snippets/css/complete-guide-grid/',
    domain: 'css-tricks.com',
    favicon: '',
    coverImage: createCoverSvg('Modern CSS Grid Guide', 'Frontend Web', '#8b5cf6', '#6d28d9', '▦'),
    readingStatus: 'In Progress',
    readDate: null,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1,
    notes: 'Subgrid alignment, backdrop-filter performance, and container queries.',
    tags: ['css', 'frontend', 'glassmorphism'],
    folderId: null,
    source: 'article'
  },
  {
    id: 'art-3',
    title: 'Patterns of Resilient Distributed Systems',
    url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/',
    domain: 'martinfowler.com',
    favicon: '',
    coverImage: createCoverSvg('Resilient Distributed Systems', 'Architecture', '#10b981', '#047857', '◈'),
    readingStatus: 'Done Reading',
    readDate: Date.now() - 86400000 * 1,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 1,
    notes: 'Idempotency tokens, consensus protocols, and circuit breaker patterns.',
    tags: ['architecture', 'backend', 'scalability'],
    folderId: null,
    source: 'article'
  },
  {
    id: 'art-4',
    title: 'The Architecture of WebAssembly Runtimes',
    url: 'https://web.dev/articles/wasm-compilation',
    domain: 'web.dev',
    favicon: '',
    coverImage: createCoverSvg('WebAssembly Architecture', 'Compilers & Wasm', '#06b6d4', '#0891b2', '⚡'),
    readingStatus: 'Done Reading',
    readDate: Date.now() - 86400000 * 4,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 4,
    notes: 'JIT compilation vs AOT pipelines and multi-threaded WebAssembly performance.',
    tags: ['wasm', 'performance', 'compilers'],
    folderId: null,
    source: 'article'
  },
  {
    id: 'art-5',
    title: 'Understanding Multi-Head Attention Mechanisms',
    url: 'https://arxiv.org/abs/1706.03762',
    domain: 'arxiv.org',
    favicon: '',
    coverImage: createCoverSvg('Multi-Head Attention Models', 'Machine Learning', '#f59e0b', '#b45309', '✦'),
    readingStatus: 'Want to Read',
    readDate: null,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
    notes: 'Foundational paper on scaled dot-product attention and positional encoding.',
    tags: ['ai', 'research', 'deep-learning'],
    folderId: null,
    source: 'article'
  }
];

export const sampleLibrary = [
  {
    id: 'lib-1',
    title: 'Figma — Collaborative Interface Design',
    url: 'https://www.figma.com',
    domain: 'figma.com',
    favicon: '',
    description: 'Design systems, prototyping, and team libraries',
    notes: 'Design tokens and production component specifications',
    folderId: 'lib-tools',
    tags: ['design', 'ui', 'collaboration'],
    favorite: true,
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 86400000 * 2,
    lastOpenedAt: Date.now() - 3600000,
    source: 'library'
  },
  {
    id: 'lib-2',
    title: 'Linear — Issue Tracking & Roadmaps',
    url: 'https://linear.app',
    domain: 'linear.app',
    favicon: '',
    description: 'Issue tracker built for high-performance software teams',
    notes: 'Sprint cycles, active initiatives, and release roadmaps',
    folderId: 'lib-work',
    tags: ['planning', 'productivity', 'teams'],
    favorite: true,
    createdAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now() - 86400000 * 5,
    lastOpenedAt: Date.now() - 7200000,
    source: 'library'
  },
  {
    id: 'lib-3',
    title: 'Tailwind CSS Documentation',
    url: 'https://tailwindcss.com',
    domain: 'tailwindcss.com',
    favicon: '',
    description: 'Utility-first CSS framework packed with classes',
    notes: 'Modern flexbox, grid, and typography utilities reference',
    folderId: 'lib-learning',
    tags: ['css', 'frontend', 'docs'],
    favorite: false,
    createdAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 86400000 * 15,
    lastOpenedAt: null,
    source: 'library'
  },
  {
    id: 'lib-4',
    title: 'Stripe API & Webhooks Reference',
    url: 'https://stripe.com/docs',
    domain: 'stripe.com',
    favicon: '',
    description: 'Complete documentation for payment processing',
    notes: 'Checkout Sessions and billing subscription lifecycle events',
    folderId: 'lib-tools',
    tags: ['payments', 'api', 'backend'],
    favorite: false,
    createdAt: Date.now() - 86400000 * 18,
    updatedAt: Date.now() - 86400000 * 8,
    lastOpenedAt: null,
    source: 'library'
  },
  {
    id: 'lib-5',
    title: 'Vercel Dashboard & Edge Middleware',
    url: 'https://vercel.com/dashboard',
    domain: 'vercel.com',
    favicon: '',
    description: 'Platform for frontend developers and serverless functions',
    notes: 'Production deployments and performance analytics',
    folderId: 'lib-work',
    tags: ['hosting', 'deployment', 'cloud'],
    favorite: true,
    createdAt: Date.now() - 86400000 * 25,
    updatedAt: Date.now() - 86400000 * 3,
    lastOpenedAt: Date.now() - 14400000,
    source: 'library'
  },
  {
    id: 'lib-6',
    title: 'Raycast — Pro Launcher & Extensions',
    url: 'https://www.raycast.com',
    domain: 'raycast.com',
    favicon: '',
    description: 'Blazingly fast, extendable launcher for Mac',
    notes: 'Custom extension store, window management shortcuts',
    folderId: 'lib-tools',
    tags: ['macos', 'tools', 'productivity'],
    favorite: true,
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 10,
    lastOpenedAt: Date.now() - 28800000,
    source: 'library'
  },
  {
    id: 'lib-7',
    title: 'Supabase — Open Source Firebase Alternative',
    url: 'https://supabase.com',
    domain: 'supabase.com',
    favicon: '',
    description: 'Postgres database, Authentication, instant APIs and Realtime',
    notes: 'Row-level security policies and edge database triggers',
    folderId: 'lib-tools',
    tags: ['database', 'backend', 'postgres'],
    favorite: true,
    createdAt: Date.now() - 86400000 * 8,
    updatedAt: Date.now() - 86400000 * 2,
    lastOpenedAt: null,
    source: 'library'
  },
  {
    id: 'lib-8',
    title: 'Excalidraw — Virtual Collaborative Whiteboard',
    url: 'https://excalidraw.com',
    domain: 'excalidraw.com',
    favicon: '',
    description: 'Hand-drawn feel sketches and system architectures',
    notes: 'System architecture diagram drafts and user flow mockups',
    folderId: 'lib-general',
    tags: ['whiteboard', 'diagrams', 'ideas'],
    favorite: false,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 14,
    lastOpenedAt: null,
    source: 'library'
  }
];

export const sampleFolderVisualMetadata = {
  '1': { colorId: 'cyan', updatedAt: Date.now() },
  '105': { colorId: 'blue', updatedAt: Date.now() },
  '109': { colorId: 'amber', updatedAt: Date.now() },
  '113': { colorId: 'rose', updatedAt: Date.now() },
  '116': { colorId: 'emerald', updatedAt: Date.now() },
  '2': { colorId: 'purple', updatedAt: Date.now() },
  'lib-general': { colorId: 'default', updatedAt: Date.now() },
  'lib-work': { colorId: 'amber', updatedAt: Date.now() },
  'lib-learning': { colorId: 'blue', updatedAt: Date.now() },
  'lib-tools': { colorId: 'cyan', updatedAt: Date.now() }
};
