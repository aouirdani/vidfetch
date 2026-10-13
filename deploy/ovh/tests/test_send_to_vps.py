"""Transfer of the administrator toolkit, against a throwaway container running a real OpenSSH server."""
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class SendToVps(unittest.TestCase):
    def test_replaces_an_older_copy_and_verifies_checksums(self):
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        if subprocess.run(['git', '-C', str(root), 'rev-parse', '--git-dir'], capture_output=True).returncode:
            self.skipTest('not a git checkout')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/send-to-vps.test.sh')], capture_output=True, text=True, timeout=600)
        if result.returncode == 2:
            self.skipTest('ssh test container unavailable')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('ok - '), 14)


if __name__ == '__main__':
    unittest.main()
