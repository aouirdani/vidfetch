import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [reportDir = '.lighthouseci-pr', htmlRoot = '.next/server/app'] = process.argv.slice(2);
const routes = ['/', '/fr', '/id/download-video-tiktok', '/video-to-mp3', '/blog/why-cant-i-save-tiktok', '/ar', '/about', '/fr/contact'];
const expectedRuns = 3;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const notes = [];
const warn = message => {
  notes.push(message);
  console.log(`::warning::${message.replace(/[\r\n]+/g, ' ')}`);
};

try {
  const files = (await readdir(reportDir)).filter(file => /\.report\.json$/.test(file));
  if (files.length !== routes.length * expectedRuns) {
    warn(`Lighthouse non-bloquant : ${reportDir} contient ${files.length} rapport(s), ${routes.length * expectedRuns} attendus ; résumé incomplet.`);
  }

  const grouped = new Map();
  const assets = new Map();
  for (const file of files) {
    const report = JSON.parse(await readFile(join(reportDir, file), 'utf8'));
    const path = decodeURIComponent(new URL(report.finalDisplayedUrl).pathname);
    if (!routes.includes(path)) {
      warn(`Rapport Lighthouse inattendu pour ${path}.`);
      continue;
    }
    const audits = report.audits ?? {};
    const metrics = grouped.get(path) ?? { performance: [], lcp: [], tbt: [] };
    metrics.performance.push(report.categories?.performance?.score);
    metrics.lcp.push(audits['largest-contentful-paint']?.numericValue);
    metrics.tbt.push(audits['total-blocking-time']?.numericValue);
    grouped.set(path, metrics);

    const origin = new URL(report.finalDisplayedUrl).origin;
    const requests = audits['network-requests']?.details?.items ?? [];
    const scripts = requests
      .filter(item => item.resourceType === 'Script' && new URL(item.url).origin === origin)
      .reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
    const previous = assets.get(path) ?? { scripts: 0, cssGzip: 0 };
    previous.scripts = Math.max(previous.scripts, scripts);

    try {
      const htmlPath = join(htmlRoot, `${path === '/' ? 'index' : path.replace(/^\//, '')}.html`);
      const html = await readFile(htmlPath, 'utf8');
      const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
      previous.cssGzip = Math.max(previous.cssGzip, gzipSync(css).byteLength);
      const fontPreloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/gi)];
      const fontUrls = new Set(fontPreloads.map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]).filter(Boolean));
      if (fontUrls.size !== (path === '/ar' ? 0 : 1)) warn(`${path}: préchargements de police inattendus (${fontUrls.size}).`);
    } catch (error) {
      warn(`${path}: HTML non disponible pour le diagnostic des ressources (${error.message}).`);
    }

    assets.set(path, previous);
    const lcpDetails = JSON.stringify(audits['largest-contentful-paint-element']?.details ?? {});
    if (/hero-scene|hero-card|hero-token/i.test(lcpDetails)) warn(`${path}: la scène 3D est candidate LCP.`);
  }

  const fontFiles = [
    'public/fonts/bricolage-grotesque-latin-800.woff2',
    'public/fonts/bricolage-grotesque-latin-ext-800.woff2',
  ];
  const fontBytes = (await Promise.all(fontFiles.map(file => readFile(file)))).reduce((sum, font) => sum + font.byteLength, 0);
  if (fontBytes > 90_000) warn(`Bricolage Latin WOFF2: ${fontBytes} B (budget indicatif 90,000 B).`);
  console.log(`Polices Bricolage Latin + Latin-ext : ${fontBytes} B (repère 90,000 B).`);

  for (const path of routes) {
    const values = grouped.get(path);
    if (!values || Object.values(values).some(list => list.length !== expectedRuns || list.some(value => !Number.isFinite(value)))) {
      warn(`${path}: médiane Performance/LCP/TBT indisponible.`);
      continue;
    }
    const performance = median(values.performance);
    const lcp = median(values.lcp);
    const tbt = median(values.tbt);
    console.log(`${path}: Performance ${Math.round(performance * 100)} (repère ≥90), LCP ${Math.round(lcp)} ms (repère ≤2,500), TBT ${Math.round(tbt)} ms (repère ≤200).`);
    if (performance < 0.9) warn(`${path}: Performance ${Math.round(performance * 100)} est sous le repère 90.`);
    if (lcp > 2_500) warn(`${path}: LCP médian ${Math.round(lcp)} ms dépasse le repère 2,500 ms.`);
    if (tbt > 200) warn(`${path}: TBT médian ${Math.round(tbt)} ms dépasse le repère 200 ms.`);

    const pageAssets = assets.get(path);
    if (pageAssets) {
      if (pageAssets.scripts > 166_266) warn(`${path}: JS première partie ${pageAssets.scripts} B dépasse le repère 166,266 B.`);
      if (pageAssets.cssGzip > 16_284) warn(`${path}: CSS intégré gzip ${pageAssets.cssGzip} B dépasse le repère 16,284 B.`);
      console.log(`${path}: JS même origine ${pageAssets.scripts} B (repère 166,266), CSS inline gzip ${pageAssets.cssGzip} B (repère 16,284).`);
    }
  }

  console.log(notes.length ? `Rapport Lighthouse : ${notes.length} avertissement(s), aucun ne bloque la CI.` : 'Rapport Lighthouse : aucun avertissement de budget.');
} catch (error) {
  warn(`Rapport Lighthouse non bloquant impossible à produire : ${error.message}.`);
}
