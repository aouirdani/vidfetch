"""Opt-in end to end: the real Next build behind the real Caddy 2.11.7 running Caddyfile.public, crawled through Caddy.
16 sitemap URLs indexable, the 22 other prerendered pages noindex, downloads closed, one-hop redirects.
Needs a local `VIDFETCH_TARGET=ovh next build` (absent in the CI test step, so it skips there) and Docker.

Run with: VIDFETCH_TARGET=ovh npx next build && python3 -m unittest deploy/ovh/tests/test_public_indexing.py
"""
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class PublicIndexing(unittest.TestCase):
    def test_public_apex_through_real_caddy(self):
        if not (root / '.next' / 'BUILD_ID').exists():
            self.skipTest('no local frontend build')
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/public-indexing.test.sh')], capture_output=True, text=True, timeout=600)
        if result.returncode == 2:
            self.skipTest('environment missing: ' + result.stdout[-200:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('sitemap lists 16 distinct canonical URLs', result.stdout)
        self.assertIn('22 prerendered pages outside the sitemap, all noindex', result.stdout)
        self.assertIn('ALL PASSED', result.stdout)


if __name__ == '__main__':
    unittest.main()
