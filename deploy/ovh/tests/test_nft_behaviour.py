"""Real-kernel behaviour of the rendered ingress rules, in a throwaway container network (needs Docker)."""
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class NftBehaviour(unittest.TestCase):
    def test_testers_other_sources_ssh_internal_ports_and_restore(self):
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/nft-behaviour/run.sh')], capture_output=True, text=True, timeout=400)
        if result.returncode == 2:
            self.skipTest('container network / NET_ADMIN unavailable: ' + result.stdout[-300:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('ok - '), 50)


if __name__ == '__main__':
    unittest.main()
