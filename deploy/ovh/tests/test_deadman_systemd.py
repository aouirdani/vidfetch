"""Opt-in (2+ minutes, privileged container): the dead-man restore fires from systemd, no session attached.

Run with VIDFETCH_SLOW_TESTS=1 python3 -m unittest deploy/ovh/tests/test_deadman_systemd.py
"""
import os
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class DeadMan(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('VIDFETCH_SLOW_TESTS') == '1', 'set VIDFETCH_SLOW_TESTS=1')
    def test_timer_restores_without_any_ssh_session(self):
        if not shutil.which('docker'):
            self.skipTest('Docker not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/deadman-systemd.test.sh')], capture_output=True, text=True, timeout=600)
        if result.returncode == 2:
            self.skipTest('privileged systemd container unavailable')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
