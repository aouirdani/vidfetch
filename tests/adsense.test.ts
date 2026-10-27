import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADSENSE_CLIENT, ADSENSE_SCRIPT, ADVERTISING_PRIVACY } from "../src/lib/adsense";
import { LOCALES } from "../src/i18n/config";
import { dictionaries } from "../src/i18n/dictionaries";

test("the AdSense tag is the publisher's exact snippet, loaded async and anonymous in the head of content pages", () => {
  assert.equal(ADSENSE_SCRIPT, "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7903460199253248");
  const layout = readFileSync("src/app/(site)/[[...segments]]/layout.tsx", "utf8");
  // in the head of the content pages only (showsAds: never a 404, a noindex draft or the legal page)
  assert.match(layout, /<head>[\s\S]*\{showsAds\(page\) && <script async src=\{ADSENSE_SCRIPT\} crossOrigin="anonymous" \/>\}[\s\S]*<\/head>/);
});

test("ads.txt authorises exactly this publisher for Google", () => {
  assert.equal(readFileSync("public/ads.txt", "utf8"), `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
});

test("the privacy notice discloses Google ads in every language; the old no-advertising claim is no longer shown", () => {
  assert.deepEqual(Object.keys(ADVERTISING_PRIVACY).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.match(ADVERTISING_PRIVACY[locale], /Google AdSense/, locale);
    assert.match(ADVERTISING_PRIVACY[locale], /\(adssettings\.google\.com\)/, locale);
    assert.notEqual(ADVERTISING_PRIVACY[locale], dictionaries[locale].privacy1, locale);
  }
  // the dictionary sent to the browser carries the same notice, not the old claim
  assert.match(readFileSync("src/app/(site)/[[...segments]]/layout.tsx", "utf8"), /messages=\{\{ \.\.\.d, privacy1: ADVERTISING_PRIVACY\[locale\] \}\}/);
  const legal = readFileSync("src/views/SiteViews.tsx", "utf8");
  assert.match(legal, /items: \[ADVERTISING_PRIVACY\[page\.locale\], d\.privacy2,/);
  assert.doesNotMatch(legal, /d\.privacy1\b/);
});
