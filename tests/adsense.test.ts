import { clientMessages } from "../src/i18n/client-messages";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADSENSE_CLIENT, ADSENSE_DEFERRED_LOADER, ADSENSE_DEFERRED_LOADING_ENABLED, ADSENSE_SCRIPT, ADVERTISING_PRIVACY } from "../src/lib/adsense";
import { LOCALES } from "../src/i18n/config";
import { dictionaries } from "../src/i18n/dictionaries";

test("indexable content pages declare the publisher without loading the AdSense script", () => {
  assert.equal(ADSENSE_SCRIPT, "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7903460199253248");
  const layout = readFileSync("src/app/(site)/[[...segments]]/layout.tsx", "utf8");
  // The publisher meta is limited to the same eligible content pages (showsAds).
  assert.match(layout, /<head>[\s\S]*\{showsAds\(page\) && <meta name="google-adsense-account" content=\{ADSENSE_CLIENT\} \/>\}[\s\S]*<\/head>/);
  assert.doesNotMatch(layout, /<script async src=\{ADSENSE_SCRIPT\}/);
  assert.equal(ADSENSE_DEFERRED_LOADING_ENABLED, false);
  assert.match(ADSENSE_DEFERRED_LOADER, /document\.readyState==="complete"/);
  assert.match(ADSENSE_DEFERRED_LOADER, /pointerdown|scroll/);
  assert.match(layout, /ADSENSE_DEFERRED_LOADING_ENABLED && <script dangerouslySetInnerHTML/);
});

test("ads.txt authorises exactly this publisher for Google", () => {
  assert.equal(readFileSync("public/ads.txt", "utf8"), `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
});

test("the privacy notice accurately says ads are not currently displayed in all languages", () => {
  assert.deepEqual(Object.keys(ADVERTISING_PRIVACY).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.match(ADVERTISING_PRIVACY[locale], /currently|actuellement|actualmente|no momento|saat ini|derzeit|al momento|حاليًا/i, locale);
    assert.doesNotMatch(ADVERTISING_PRIVACY[locale], /shows ads|affiche des annonces|muestra anuncios servidos|exibe anúncios veiculados|menampilkan iklan yang disajikan|zeigt Anzeigen, die von|mostra annunci forniti|يعرض الموقع إعلانات تقدمها/i, locale);
    assert.notEqual(ADVERTISING_PRIVACY[locale], dictionaries[locale].privacy1, locale);
    assert.equal(clientMessages({ ...dictionaries[locale], privacy1: ADVERTISING_PRIVACY[locale] }).privacy1, ADVERTISING_PRIVACY[locale], locale);
  }
  // the dictionary sent to the browser carries the same notice, not the old claim
  // (the contact addresses of the same dictionary are moved to vidfetch.app first: tests/home-navigation.test.ts)
  assert.match(readFileSync("src/components/FetchFormSection.tsx", "utf8"), /messages=\{clientMessages\(\{ \.\.\.withOfficialContacts\(d\), privacy1: ADVERTISING_PRIVACY\[locale\] \}\)\}/);
  const legal = readFileSync("src/views/SiteViews.tsx", "utf8");
  assert.match(legal, /items: verifiedPrivacySummary\(page\.locale\)/);
  assert.doesNotMatch(legal, /d\.privacy1\b/);
});
