"""13-engine.sh, the reviewed engine upgrade and its observation (PR B, docs/VIDFETCH-MOTEUR-REVUE-SPEC.md v3 §3 B2, B3).

Written before the implementation: these tests fail until deploy/ovh/media/admin/13-engine.sh exists.
The systemd test is opt-in (about 8 minutes, privileged Debian 13 container with real systemd and Node 22):
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
    def test_upgrade_observe_and_rollback_with_real_systemd(self):
        if not shutil.which('docker') or not shutil.which('node'):
            self.skipTest('Docker or Node not available')
        result = subprocess.run(['sh', str(root / 'deploy/ovh/tests/engine-upgrade-systemd.test.sh')], capture_output=True, text=True, timeout=2400)
        if result.returncode == 2:
            self.skipTest('privileged systemd container or gateway build unavailable: ' + result.stdout[-200:])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.count('not ok - '), 0, result.stdout)
        self.assertGreaterEqual(result.stdout.count('ok - '), 70)


def branch(text, name):
    """The body of one case branch of the script's main dispatch (`name)` ... `;;`)."""
    found = re.search(r'\n' + name + r'\)\n(.*?)\n  ;;', text, re.S)
    return found.group(1) if found else None


class Source(unittest.TestCase):
    """What can be checked without a VPS: conventions, what the script may touch, and the order of its steps."""

    def setUp(self):
        self.assertTrue(TOOL.is_file(), '13-engine.sh is not implemented yet (PR B: these tests are written first)')
        self.text = TOOL.read_text()

    def test_toolkit_conventions(self):
        self.assertIn('. "$(dirname "$0")/common.sh"; need_root', self.text)
        self.assertRegex(self.text, r'usage: \$0 check EXPECTED_SHA256 \| upgrade EXPECTED_SHA256 \| rollback \| observe \[SECONDS\]')
        self.assertNotRegex(self.text, r'rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r')   # never rm -rf
        self.assertIn('20-engine-release.conf', self.text)
        self.assertIn('vidfetch-engine-upgrade-latest', self.text)
        self.assertIn('this script only manages vidfetch.service', self.text)

    def test_the_egress_unit_is_only_ever_read(self):
        # vidfetch-egress.service's ExecStop removes the worker's egress policy (F9): never stop, restart or reload it
        for line in self.text.splitlines():
            if 'vidfetch-egress' in line and not line.lstrip().startswith('#'):
                self.assertRegex(line, r'(is-active|show)\b', 'vidfetch-egress may only be read: ' + line.strip())
        self.assertNotRegex(self.text, r'(stop|restart|reload|kill|reset-failed)[^\n]*\$EGRESS_UNIT')
        self.assertNotRegex(self.text, r'nft (add|delete|insert|replace|flush|-f)')

    def test_reset_failed_is_targeted_and_logged(self):
        # only the two units this script starts, each time right after logging the unit's state to events.log
        calls = re.findall(r'reset-failed[^\n]*', self.text)
        self.assertTrue(calls, 'reset-failed is needed before each start (StartLimitBurst=3 in 300 s, F10)')
        for call in calls:
            self.assertRegex(call, r'reset-failed "\$(ENGINE_UNIT|GW_UNIT)"', call)
        self.assertEqual(len(re.findall(r'^\s*reset_and_start\(\)', self.text, re.M)), 1, 'one helper: log, reset-failed, start')
        helper = re.search(r'\nreset_and_start\(\) \{(.*?)\n\}', self.text, re.S).group(1)
        self.assertLess(helper.index('events.log'), helper.index('reset-failed'))
        self.assertLess(helper.index('reset-failed'), helper.index('start'))

    def test_downloads_closed_and_idle_before_any_change(self):
        upgrade = branch(self.text, 'upgrade')
        self.assertIsNotNone(upgrade, 'no upgrade) branch')
        before_any_stop = re.split(r'(?:\$SYSTEMCTL|systemctl) stop', upgrade, maxsplit=1)[0]
        for guard in ['downloads_closed', 'idle', 'take_lock', 'blocker', 'failed_units']:
            self.assertIn(guard, before_any_stop, f'{guard} must run before anything stops')

    def test_observe_is_read_only(self):
        observe = branch(self.text, 'observe')
        self.assertIsNotNone(observe, 'no observe) branch')
        for forbidden in ['$SYSTEMCTL stop', '$SYSTEMCTL start', '$SYSTEMCTL restart', 'daemon-reload', 'reset-failed', 'take_lock',
                          'reset_and_start', 'restore_from', 'set-ready', 'install ', 'mv ', 'WEB_ENV']:
            self.assertNotIn(forbidden, observe, f'observe must not {forbidden}')
        self.assertIn('900', self.text)                     # the production minimum
        self.assertIn('VM_OBSERVE_MIN', self.text)          # the test-only override

    def test_old_bundles_are_never_removed(self):
        for line in self.text.splitlines():
            if re.search(r'\brm\b|\brmdir\b|\bunlink\b', line) and not line.lstrip().startswith('#'):
                self.assertNotIn('RELEASES', line, 'nothing is ever removed under /opt/vidfetch/releases: ' + line.strip())
                self.assertNotIn('/opt/vidfetch/releases', line, line.strip())

    def test_not_reachable_by_the_ci_account(self):
        for path in [root / 'deploy/ovh/ci/install.py', root / 'deploy/ovh/ci/dispatch.py', root / 'deploy/ovh/ci/promote.py', root / 'deploy/ovh/ci/sudoers']:
            self.assertNotIn('13-engine', path.read_text(), path.name)


if __name__ == '__main__':
    unittest.main()
