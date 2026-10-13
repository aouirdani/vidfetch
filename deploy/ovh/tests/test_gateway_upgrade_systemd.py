"""Opt-in (about 4 minutes, privileged Debian 13 container with real systemd and Node 22): upgrade and rollback of the
gateway from the bundle that runs on the VPS today to the bundle built from this checkout.

Run with VIDFETCH_SLOW_TESTS=1 python3 -m unittest deploy/ovh/tests/test_gateway_upgrade_systemd.py
"""
import os
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class GatewayUpgrade(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('VIDFETCH_SLOW_TESTS') == '1', 'set VIDFETCH_SLOW_TESTS=1')
    def test_upgrade_and_rollback_with_real_systemd(self):
        if not shutil.which('docker') or not shutil.which('node'):
            self.skipTest('Docker or Node not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/gateway-upgrade-systemd.test.sh')], capture_output=True, text=True, timeout=1500)
        if result.returncode == 2:
            self.skipTest('privileged systemd container or gateway build unavailable: ' + result.stdout[-200:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('ok - '), 35)

    def test_fixture_is_the_bundle_recorded_as_live(self):
        import hashlib
        fixture = root / 'deploy/ovh/tests/fixtures/gateway-live-20261012.cjs.fixture'
        self.assertEqual(hashlib.sha256(fixture.read_bytes()).hexdigest(), 'a703f269641fc6c38fce74d4e7ff7f47ef5fe54a64b3e104dbab2082481dc1d5')


if __name__ == '__main__':
    unittest.main()
