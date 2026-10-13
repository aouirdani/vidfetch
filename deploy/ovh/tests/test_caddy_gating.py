"""Behavioural test of the dl/apex gating in the candidate Caddyfile (needs Docker)."""
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class CaddyGating(unittest.TestCase):
    def test_non_testers_never_reach_the_gateway(self):
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(
            ['docker', 'run', '--rm', '-v', f'{root / "deploy/ovh/tests/caddy-gating"}:/c:ro',
             '-v', f'{root / "deploy/ovh/media"}:/src:ro', 'caddy:2.11.7@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772', 'sh', '/c/run.sh'],
            capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('ok - '), 25)


if __name__ == '__main__':
    unittest.main()
