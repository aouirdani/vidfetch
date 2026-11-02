const routes = [
  '/',
  '/fr',
  '/id/download-video-tiktok',
  '/video-to-mp3',
  '/blog/why-cant-i-save-tiktok',
  '/ar',
];

module.exports = {
  ci: {
    collect: {
      url: routes.map(route => `http://127.0.0.1:4173${route}`),
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH,
      startServerCommand: `HOSTNAME=127.0.0.1 PORT=4173 node ${process.env.VIDFETCH_LHCI_SERVER ?? `build/releases/${process.env.VIDFETCH_RELEASE}/app/server.js`}`,
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 30000,
      settings: {
        emulatedFormFactor: 'mobile',
        chromeFlags: '--no-sandbox --headless',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 1, aggregationMethod: 'median' }],
        'categories:best-practices': ['error', { minScore: 1, aggregationMethod: 'median' }],
        'categories:seo': ['error', { minScore: 1, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.02, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: process.env.LHCI_OUTPUT_DIR ?? '.lighthouseci' },
  },
};
