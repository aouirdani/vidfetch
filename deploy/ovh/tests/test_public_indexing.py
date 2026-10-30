"""Opt-in end to end: the real Next build behind the real Caddy 2.11.7 running Caddyfile.public, crawled through Caddy.
The sitemap lists exactly the pages of fixtures/public-indexing-expected.json, each indexable with its expected hreflang
set; every other prerendered page is exactly one of its noindex pages; downloads closed, one-hop redirects.
Needs an OVH build and Docker. VIDFETCH_REQUIRE_INDEXING_TEST=1 makes missing prerequisites fatal in the post-build CI step; VIDFETCH_INDEXING_APP selects the actual release app.

Run with: VIDFETCH_TARGET=ovh npx next build && python3 -m unittest deploy/ovh/tests/test_public_indexing.py
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]
expected = json.loads((root / 'deploy/ovh/tests/fixtures/public-indexing-expected.json').read_text(encoding='utf-8'))


class PublicIndexing(unittest.TestCase):
    def unavailable(self, reason):
        if os.environ.get('VIDFETCH_REQUIRE_INDEXING_TEST') == '1':
            self.fail(reason)
        self.skipTest(reason)

    def test_expected_pages_are_explicit(self):
        indexable, noindex = expected['indexable'], expected['noindex']
        self.assertTrue(set(indexable.values()) <= set(expected['hreflang']), 'unknown hreflang group')
        self.assertEqual(len(noindex), len(set(noindex)))
        self.assertFalse(set(indexable) & set(noindex), 'a page cannot be both indexable and noindex')
        self.assertTrue(all(path.startswith('/') for path in [*indexable, *noindex]))

    def test_public_apex_through_real_caddy(self):
        if not (root / '.next' / 'BUILD_ID').exists():
            self.unavailable('no local frontend build')
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.unavailable('Docker not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/public-indexing.test.sh')], capture_output=True, text=True, timeout=600)
        if result.returncode == 2:
            self.unavailable('environment missing: ' + result.stdout[-200:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        indexable, noindex = len(expected['indexable']), len(expected['noindex'])
        self.assertIn(f'sitemap lists exactly the {indexable} expected canonical URLs ({indexable} listed)', result.stdout)
        lines = result.stdout.splitlines()
        self.assertEqual(sum(line.startswith('ok ') and ' - indexable ' in line for line in lines), indexable)
        self.assertEqual(sum(line.startswith('ok ') and ' - not indexable on purpose ' in line for line in lines), noindex)
        self.assertIn(f'exactly the {noindex} expected prerendered pages outside the sitemap, all noindex ({noindex} found)', result.stdout)
        self.assertIn('ALL PASSED', result.stdout)


if __name__ == '__main__':
    unittest.main()
