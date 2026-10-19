"""verify-outsider.sh against a modelled production, in a throwaway container (curl, nc and openssl are stand-ins)."""
from pathlib import Path
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]


class VerifyOutsider(unittest.TestCase):
    def test_checks_and_faults_in_container(self):
        """Real gateway answers pass (JSON POST 401 INVALID_ACCESS, POST without a body 400 INVALID_JSON); every broken
        security property, one at a time, fails the run; --public is unchanged; a missing tool never passes."""
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['docker', 'run', '--rm', '-v', f'{root}:/r:ro', 'python:3.12-slim', 'bash', '/r/deploy/ovh/tests/verify-outsider.test.sh'],
                                capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('not ok', result.stdout)
        self.assertGreaterEqual(result.stdout.count('ok - '), 28)
        self.assertIn('ALL 40 CHECKS PASSED', result.stdout)
        self.assertIn('fault engine_reached_fetch_info: run fails', result.stdout)
        self.assertIn('fault empty_post_401: run fails', result.stdout)

    def test_script_sends_json_to_the_gateway_routes(self):
        """The --public-dl POST checks carry Content-Type: application/json and a JSON body, and expect the gateway's codes."""
        text = (root / 'deploy/ovh/media/admin/verify-outsider.sh').read_text()
        self.assertIn("-X POST -H 'Content-Type: application/json' --data \"$body\" \"https://dl.vidfetch.app$p\"", text)
        self.assertIn('[ "$c" = 401 ] && grep -q \'"code":"INVALID_ACCESS"\'', text)
        self.assertIn('[ "$c" = 400 ] && grep -q \'"code":"INVALID_JSON"\'', text)
        self.assertNotIn('POST:/api/fetch-info:401', text)


if __name__ == '__main__':
    unittest.main()
