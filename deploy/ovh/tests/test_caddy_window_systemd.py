"""Opt-in (about 8 minutes, privileged Debian 13 container with real systemd, journald, OpenSSH and Caddy 2.11.7 under the
production unit): the Caddy window after a confirmed network window, its rollback timer firing with no session, the
systemd retry after a failed first attempt, and 05-confirm.sh against the real origin with strict TLS.

Run with VIDFETCH_SLOW_TESTS=1 python3 -m unittest deploy/ovh/tests/test_caddy_window_systemd.py
"""
import os
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class CaddyWindow(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('VIDFETCH_SLOW_TESTS') == '1', 'set VIDFETCH_SLOW_TESTS=1')
    def test_caddy_window_on_real_systemd_and_caddy(self):
        if not shutil.which('docker'):
            self.skipTest('Docker not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/caddy-window-systemd.test.sh')], capture_output=True, text=True, timeout=1500)
        if result.returncode == 2:
            self.skipTest('privileged systemd container unavailable')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
