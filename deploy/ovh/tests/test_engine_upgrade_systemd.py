"""13-engine.sh, the reviewed engine upgrade (PR B, docs/VIDFETCH-MOTEUR-REVUE-SPEC.md §3 B2).

Written before the implementation: these tests fail until deploy/ovh/media/admin/13-engine.sh exists.
The systemd test is opt-in (about 5 minutes, privileged Debian 13 container with real systemd and Node 22):
VIDFETCH_SLOW_TESTS=1 python3 -m unittest deploy/ovh/tests/test_engine_upgrade_systemd.py
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest

root = Path(__file__).parents[3]
TOOL = root / 'deploy/ovh/media/admin/13-engine.sh'


class EngineUpgrade(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('VIDFETCH_SLOW_TESTS') == '1', 'set VIDFETCH_SLOW_TESTS=1')
    def test_upgrade_and_rollback_with_real_systemd(self):
        if not shutil.which('docker') or not shutil.which('node'):
            self.skipTest('Docker or Node not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/engine-upgrade-systemd.test.sh')], capture_output=True, text=True, timeout=1800)
        if result.returncode == 2:
            self.skipTest('privileged systemd container or gateway build unavailable: ' + result.stdout[-200:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('ok - '), 40)
        self.assertEqual(result.stdout.count('not ok - '), 0, result.stdout)


class Source(unittest.TestCase):
    """What can be checked without a VPS: the script exists, follows the toolkit's conventions, and the CI cannot
    reach it."""

    def setUp(self):
        self.assertTrue(TOOL.is_file(), '13-engine.sh is not implemented yet (PR B: these tests are written first)')
        self.text = TOOL.read_text()

    def test_toolkit_conventions(self):
        self.assertIn('. "$(dirname "$0")/common.sh"; need_root', self.text)
        self.assertIn('take_lock', self.text)                                # the lock 08-gateway.sh, 11-downloads.sh and set-ready.sh hold
        self.assertRegex(self.text, r'usage: \$0 check EXPECTED_SHA256 \| upgrade EXPECTED_SHA256 \| rollback')
        self.assertNotRegex(self.text, r'rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r')   # never rm -rf
        self.assertIn('20-engine-release.conf', self.text)
        self.assertIn('vidfetch-engine-upgrade-latest', self.text)

    def test_only_the_engine_unit(self):
        self.assertIn('this script only manages vidfetch.service', self.text)
        self.assertNotIn('vidfetch-gateway.service.d', self.text)              # never writes the gateway's drop-ins
        for forbidden in ['nft add', 'nft delete', 'nft -f', 'Caddyfile', 'sshd_config', 'guard-update.py accept', 'gateway.env.new']:
            self.assertNotIn(forbidden, self.text, forbidden)

    def test_not_reachable_by_the_ci_account(self):
        for path in [root / 'deploy/ovh/ci/install.py', root / 'deploy/ovh/ci/dispatch.py', root / 'deploy/ovh/ci/promote.py', root / 'deploy/ovh/ci/sudoers']:
            self.assertNotIn('13-engine', path.read_text(), path.name)

    def test_downloads_closed_and_idle_before_any_change(self):
        upgrade = re.search(r'\nupgrade\)(.*?)\n  ;;', self.text, re.S)
        self.assertIsNotNone(upgrade, 'no upgrade) branch')
        before_any_stop = re.split(r'(?:\$SYSTEMCTL|systemctl) stop', upgrade.group(1), maxsplit=1)[0]
        for guard in ['downloads_closed', 'idle', 'take_lock', 'blocker']:
            self.assertIn(guard, before_any_stop, f'{guard} must run before anything stops')


if __name__ == '__main__':
    unittest.main()
