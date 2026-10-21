"""The observation gate of PR B (docs/VIDFETCH-MOTEUR-REVUE-SPEC.md v3 §3 B4) and what it must leave alone.

Written before the implementation: the gate cases fail until common.sh defines observation_problem and the opening
paths call it. The source checks that protect the closing and emergency paths, and 08-gateway.sh, already pass and
must keep passing."""
import hashlib
from pathlib import Path
import re
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]
ADMIN = root / 'deploy/ovh/media/admin'
GATEWAY_SCRIPT_PR16 = '07d60a69da45b65b77f92c39e013514ac5c44d9602b55d247ecda658847e27d8'   # 08-gateway.sh at 93517d14 (PR #16)


class Gate(unittest.TestCase):
    def test_gate_in_container(self):
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['docker', 'run', '--rm', '-v', f'{root}:/r:ro', 'python:3.12-slim', 'bash', '/r/deploy/ovh/tests/observation-gate.test.sh'],
                                capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stdout[-4000:] + result.stderr[-2000:])
        self.assertNotIn('not ok', result.stdout)


class OpeningPaths(unittest.TestCase):
    """The gate sits on the two ways of setting ready=1, right after release_drift, and nowhere else."""

    def test_set_ready_checks_the_gate_only_when_opening(self):
        text = (ADMIN / 'set-ready.sh').read_text()
        opening = re.search(r'\nif \[ "\$V" = 1 \]; then\n(.*?)\nfi\n', text, re.S)
        self.assertIsNotNone(opening)
        block = opening.group(1)
        self.assertIn('observation_problem', block, 'set-ready.sh 1 must refuse without a valid observation')
        self.assertLess(block.index('release_drift'), block.index('observation_problem'))
        self.assertEqual(text.count('observation_problem'), block.count('observation_problem'), 'the gate must not be reachable with 0')

    def test_open_checks_the_gate_and_close_does_not(self):
        text = (ADMIN / '11-downloads.sh').read_text()
        close = re.search(r'\nif \[ "\$ACTION" = close \]; then\n(.*?)\nfi\n', text, re.S).group(1)
        self.assertNotIn('observation_problem', close)
        self.assertNotIn('observation_problem', re.search(r'\nclose_now\(\) \{(.*?)\n\}', text, re.S).group(1))
        opening = text[text.index('# --- open: everything that must already be true'):text.index('# --- profile first')]
        self.assertIn('observation_problem', opening, '11-downloads.sh open must refuse without a valid observation')
        self.assertLess(opening.index('release_drift'), opening.index('observation_problem'))


class LeftAlone(unittest.TestCase):
    """Decisions of 21/10: no change to 08-gateway.sh without authorization; no change that is not needed to the
    closing and emergency procedures."""

    def test_08_gateway_is_the_reviewed_pr16_script(self):
        self.assertEqual(hashlib.sha256((ADMIN / '08-gateway.sh').read_bytes()).hexdigest(), GATEWAY_SCRIPT_PR16)

    def test_closing_and_emergency_scripts_do_not_know_the_gate(self):
        for name in ['04-cancel.sh', '05-cancel.sh', '07-restore-full.sh', '10-dl-cancel.sh', 'restore-caddy.sh', 'restore-dl.sh',
                     'restore-network.sh', '08-gateway.sh']:
            self.assertNotIn('observation', (ADMIN / name).read_text(), name)
        for path in (root / 'deploy/ovh/ci').glob('*.py'):
            self.assertNotIn('observation_problem', path.read_text(), path.name)

    def test_the_gate_never_lowers_ready(self):
        # the gate only refuses an opening; it never writes web.env, never restarts, never closes on its own
        common = (ADMIN / 'common.sh').read_text()
        body = re.search(r'\nobservation_problem\(\) \{(.*?)\n\}\n', common, re.S)
        self.assertIsNotNone(body, 'observation_problem is not implemented yet')
        for forbidden in ['$SYSTEMCTL restart', '$SYSTEMCTL stop', '$SYSTEMCTL start', 'reset-failed', 'set-ready', 'WEB_ENV"', '> "$', 'rm ']:
            self.assertNotIn(forbidden, body.group(1), forbidden)


if __name__ == '__main__':
    unittest.main()
