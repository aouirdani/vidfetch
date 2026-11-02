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
      startServerCommand: 'HOSTNAME=127.0.0.1 PORT=4173 node build/releases/$VIDFETCH_RELEASE/app/server.js',
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 30000,
      settings: {
        preset: 'mobile',
        chromeFlags: '--no-sandbox --headless',
      },
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.95, aggregationMethod: 'pessimistic' }],
        'categories:accessibility': ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
        'categories:best-practices': ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
        'categories:seo': ['error', { minScore: 1, aggregationMethod: 'pessimistic' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 1800, aggregationMethod: 'pessimistic' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.02, aggregationMethod: 'pessimistic' }],
        'total-blocking-time': ['error', { maxNumericValue: 100, aggregationMethod: 'pessimistic' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
