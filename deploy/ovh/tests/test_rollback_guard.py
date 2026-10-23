"""rollback.py: the administrator recovery, and its guard against restoring a release that cannot run with the
engine and gateway in service while downloads are not confirmed closed.

The real CI promoter's release library is used (pointer switch, digests, release ids); only the system is simulated
(systemctl, /proc, the frontend restart and health checks, file ownership)."""
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).parents[3]
sha256 = lambda data: hashlib.sha256(data).hexdigest()
PREVIOUS, CURRENT = 'b' * 40, 'a' * 40
ENGINE, GATEWAY = 'backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs'
SECRET = 'CANARY-TURNSTILE-SECRET-never-printed'


def load_rollback():
    spec = importlib.util.spec_from_file_location('rollback_under_test', root / 'deploy/ovh/ci/rollback.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Guard(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        t = self.t = Path(self.temp.name).resolve()
        self.store, self.base = t / 'store', t / 'base'
        for d in [self.store / 'releases', self.base, t / 'proc/101', t / 'proc/102']:
            d.mkdir(parents=True)
        # in service: the current release's engine and gateway
        self.bundles = {'vidfetch.service': t / 'engine.cjs', 'vidfetch-gateway.service': t / 'gateway.cjs'}
        self.bundles['vidfetch.service'].write_bytes(b'engine')
        self.bundles['vidfetch-gateway.service'].write_bytes(b'gateway-new')
        self.pids = {'vidfetch.service': '101', 'vidfetch-gateway.service': '102'}
        for pid, unit in [('101', 'vidfetch.service'), ('102', 'vidfetch-gateway.service')]:
            (t / 'proc' / pid / 'cmdline').write_bytes(b'/usr/bin/node\0' + str(self.bundles[unit]).encode() + b'\0')
        self.current = self.release(CURRENT, b'engine', b'gateway-new')
        (self.base / 'current').symlink_to(self.current)
        self.web_env = t / 'web.env'
        self.ready('1')
        self.calls, self.untrusted, self.systemctl_error, self.health_fails = [], set(), None, False
        helper = runpy.run_path(str(root / 'deploy/ovh/ci/promote.py'))
        helper.update(STORE=self.store, BASE=self.base, trusted=self.trusted, command=self.command,
                      guards=lambda: self.calls.append('guards'), restart=self.restart, wait_health=self.wait_health,
                      origin_health=lambda: self.calls.append('origin'))
        self.rollback = load_rollback()
        for mock in [patch.object(self.rollback, 'WEB_ENV', self.web_env), patch.object(self.rollback, 'PROC', t / 'proc'),
                     patch.object(self.rollback.runpy, 'run_path', return_value=helper),
                     patch.object(self.rollback.os, 'geteuid', return_value=0),
                     patch.dict(os.environ, {'SUDO_USER': 'debian'}, clear=False)]:
            mock.start()
            self.addCleanup(mock.stop)

    # ---- the simulated system
    def release(self, sha, engine, gateway, manifest=None):
        folder = self.store / 'releases' / sha
        folder.mkdir()
        files = {'app/server.js': b'web-' + sha.encode(), ENGINE: engine, GATEWAY: gateway}
        for name, data in files.items():
            (folder / name).parent.mkdir(parents=True, exist_ok=True)
            (folder / name).write_bytes(data)
        text = manifest if manifest is not None else json.dumps({'schema': 1, 'release': sha, 'files': {k: sha256(v) for k, v in files.items()}})
        (folder / 'manifest.json').write_text(text)
        return folder

    def previous(self, engine=b'engine', gateway=b'gateway-new', manifest=None, pending=False):
        folder = self.release(PREVIOUS, engine, gateway, manifest)
        if pending:   # an interrupted promotion: the pointer may already be on the target
            (self.store / 'pending.json').write_text(json.dumps({'previous': str(folder), 'target': str(self.current)}))
        else:
            (self.store / 'previous.json').write_text(json.dumps({'path': str(folder), 'release': PREVIOUS}))
        return folder

    def ready(self, value):
        lines = [f'TURNSTILE_SECRET_KEY={SECRET}'] + ([f'VIDFETCH_CONNECTION_READY={value}'] if value is not None else [])
        self.web_env.write_text('\n'.join(lines) + '\n')

    def trusted(self, path):
        info = path.lstat()   # missing: OSError, as the real check
        if not path.is_file() or path.is_symlink() or path in self.untrusted:
            raise ValueError('Unsafe root configuration')
        return info

    def command(self, args):
        if self.systemctl_error:
            raise self.systemctl_error
        unit, prop = args[2], args[3]
        if prop == '-pExecStart':
            return f'{{ path=/usr/bin/node ; argv[]=/usr/bin/node {self.bundles[unit]} ; ignore_errors=no }}'
        if prop == '-pMainPID':
            return self.pids[unit]
        raise AssertionError(args)

    def restart(self):
        self.calls.append('restart:' + os.readlink(self.base / 'current'))

    def wait_health(self, expected):
        self.calls.append('health:' + expected[:4])
        if self.health_fails:
            raise ValueError('Frontend readiness timed out')

    def go(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            try:
                self.rollback.main()
            except SystemExit as stop:
                return 'refused', f'{out.getvalue()}{stop}'
        return 'restored', out.getvalue()

    def assert_restored(self, result, previous):
        self.assertEqual(result[0], 'restored', result[1])
        self.assertEqual((self.base / 'current').resolve(), previous)
        self.assertEqual(self.calls, ['guards', f'restart:{previous}', 'health:bbbb', 'origin'])
        self.assertIn('Frontend rollback validated', result[1])

    def assert_refused(self, result, *reasons):
        self.assertEqual(result[0], 'refused', result[1])
        for reason in reasons:
            self.assertIn(reason, result[1])
        self.assertIn('nothing changed', result[1])
        self.assertIn('11-downloads.sh close', result[1])
        self.assertEqual((self.base / 'current').resolve(), self.current)   # pointer untouched
        self.assertEqual(self.calls, [])                                    # no guard run, no restart
        self.assertNotIn(SECRET, result[1])

    # ---- the five situations
    def test_1_ready_1_compatible_release_is_restored(self):
        """A normal CI rollback: the promoter never changes the bundles, so the previous release has the same ones."""
        previous = self.previous()
        self.assert_restored(self.go(), previous)

    def test_2_ready_1_release_with_another_gateway_is_refused(self):
        """After a reviewed activation and 08-gateway.sh upgrade: the previous release was built with the older gateway."""
        self.previous(gateway=b'gateway-old')
        self.assert_refused(self.go(), 'ready: 1', f'another {GATEWAY} than the one vidfetch-gateway.service runs')
        self.assertTrue((self.store / 'previous.json').exists())

    def test_2b_ready_1_release_with_another_engine_is_refused(self):
        self.previous(engine=b'engine-old')
        self.assert_refused(self.go(), f'another {ENGINE} than the one vidfetch.service runs')

    def test_3_ready_0_emergency_recovery_is_unchanged(self):
        """Downloads closed: any recorded release is restored, as before the guard."""
        self.ready('0')
        previous = self.previous(gateway=b'gateway-old', engine=b'engine-old')
        self.assert_restored(self.go(), previous)

    def test_4_interrupted_promotion_is_recovered_with_ready_1(self):
        previous = self.previous(pending=True)
        result = self.go()
        self.assert_restored(result, previous)
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertEqual(len(list(self.store.glob('recovered-*.json'))), 1)

    def test_4b_interrupted_promotion_with_another_gateway(self):
        self.previous(gateway=b'gateway-old', pending=True)
        self.assert_refused(self.go(), 'ready: 1')
        self.assertTrue((self.store / 'pending.json').exists())          # still there for the recovery after closing
        self.ready('0')
        self.assert_restored(self.go(), self.store / 'releases' / PREVIOUS)
        self.assertFalse((self.store / 'pending.json').exists())

    def test_5_ready_absent_unreadable_or_inconsistent(self):
        situations = {
            'absent': lambda: self.ready(None),
            'unreadable (missing file)': lambda: self.web_env.unlink(),
            'unreadable (symlink)': lambda: (self.web_env.rename(self.t / 'real.env'), self.web_env.symlink_to(self.t / 'real.env')),
            'unreadable (not root-owned)': lambda: self.untrusted.add(self.web_env),
            'unreadable (not text)': lambda: self.web_env.write_bytes(b'VIDFETCH_CONNECTION_READY=0\n\xff\xfe'),
            'inconsistent (0 then 1)': lambda: self.web_env.write_text('VIDFETCH_CONNECTION_READY=0\nVIDFETCH_CONNECTION_READY=1\n'),
            'inconsistent (1 then 0)': lambda: self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\nVIDFETCH_CONNECTION_READY=0\n'),
            'inconsistent (other value)': lambda: self.web_env.write_text('VIDFETCH_CONNECTION_READY=yes\n'),
            'inconsistent (spaces)': lambda: self.web_env.write_text('VIDFETCH_CONNECTION_READY= 0\n'),
        }
        self.previous(gateway=b'gateway-old')
        for label, make in situations.items():
            with self.subTest(label):
                self.ready('1')
                self.untrusted.clear()
                if self.web_env.is_symlink():
                    self.web_env.unlink()
                make()
                self.assert_refused(self.go(), f'ready: {label.split()[0]}')

    def test_5b_unknown_ready_does_not_block_a_compatible_release(self):
        self.ready(None)
        previous = self.previous()
        self.assert_restored(self.go(), previous)

    def test_5c_recovery_after_a_confirmed_close(self):
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\nVIDFETCH_CONNECTION_READY=0\n')
        previous = self.previous(gateway=b'gateway-old')
        self.assert_refused(self.go(), 'ready: inconsistent')
        self.ready('0')   # what 11-downloads.sh close (set-ready.sh 0) leaves: one line, 0
        self.assert_restored(self.go(), previous)

    def test_both_duplicated_zero_lines_count_as_closed(self):
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=0\nVIDFETCH_CONNECTION_READY=0\n')
        previous = self.previous(gateway=b'gateway-old')
        self.assert_restored(self.go(), previous)

    def test_the_installed_helper_restores_it_the_guarded_one_refuses(self):
        """Why the guard: the helper installed on the VPS restores the older-gateway release while downloads are open."""
        installed = root / 'deploy/ovh/tests/fixtures/rollback-76bb56b6.py.fixture'
        self.assertTrue(sha256(installed.read_bytes()).startswith('76bb56b6'))
        previous = self.previous(gateway=b'gateway-old')
        self.assert_refused(self.go(), 'ready: 1')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            exec(compile(installed.read_text(), installed.name, 'exec'), {'__name__': '__main__'})
        self.assertEqual((self.base / 'current').resolve(), previous)   # older frontend next to the newer gateway, ready=1
        self.assertIn('Frontend rollback validated', out.getvalue())

    # ---- metadata that cannot be read: refused while downloads are not closed, never blocking once closed
    def metadata_errors(self):
        def manifest(text):
            return lambda: (self.store / 'releases' / PREVIOUS / 'manifest.json').write_text(text)
        return {
            'manifest not JSON': (manifest('{not json'), 'JSONDecodeError'),
            'manifest without files': (manifest(json.dumps({'release': PREVIOUS})), 'KeyError'),
            'manifest files not a mapping': (manifest(json.dumps({'release': PREVIOUS, 'files': []})), 'AttributeError'),
            'systemctl failing': (lambda: setattr(self, 'systemctl_error', subprocess.CalledProcessError(1, ['systemctl', 'show'])), 'CalledProcessError'),
            'systemctl timing out': (lambda: setattr(self, 'systemctl_error', subprocess.TimeoutExpired(['systemctl', 'show'], 45)), 'TimeoutExpired'),
            'bundle file missing': (lambda: self.bundles['vidfetch-gateway.service'].unlink(), 'FileNotFoundError'),
            'unit with no process': (lambda: self.pids.update({'vidfetch.service': '0'}), 'runs no bundle'),
            'process not inspectable': (lambda: (self.t / 'proc/102/cmdline').unlink(), 'FileNotFoundError'),
            'restart pending': (lambda: (self.t / 'proc/101/cmdline').write_bytes(b'/usr/bin/node\0/opt/other/vidfetch-ovh.cjs\0'), 'restart pending'),
        }

    def test_metadata_errors_refuse_while_downloads_are_not_closed(self):
        for label, (make, reason) in self.metadata_errors().items():
            with self.subTest(label):
                self.setUp()
                self.previous()   # compatible: only the reading error refuses it
                make()
                self.assert_refused(self.go(), 'cannot be checked against the bundles in service', reason)

    def test_metadata_errors_do_not_block_the_emergency_recovery(self):
        for label, (make, _) in self.metadata_errors().items():
            with self.subTest(label):
                self.setUp()
                self.ready('0')
                previous = self.previous()
                make()
                if label == 'manifest not JSON':   # as before the guard: the guard does not step in, the health check fails
                    with self.assertRaises(json.JSONDecodeError):
                        self.go()
                    self.assertEqual(self.calls, ['guards', f'restart:{previous}'])
                else:
                    self.assert_restored(self.go(), previous)

    # ---- unchanged protections
    def test_administrator_only(self):
        self.previous()
        for label, env, euid in [('not root', {}, 1000), ('CI account', {'SUDO_USER': 'vidfetch-deploy'}, 0)]:
            with self.subTest(label), patch.dict(os.environ, env), patch.object(self.rollback.os, 'geteuid', return_value=euid):
                result = self.go()
                self.assertEqual(result, ('refused', 'Administrator access required'))
                self.assertEqual((self.base / 'current').resolve(), self.current)
                self.assertEqual(self.calls, [])

    def test_one_operation_at_a_time(self):
        self.previous()
        with open(self.store / 'lock', 'a') as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.go()
        self.assertEqual((self.base / 'current').resolve(), self.current)
        self.assertEqual(self.calls, [])

    def test_unexpected_release_path_still_refused(self):
        other = self.t / 'elsewhere' / PREVIOUS
        other.mkdir(parents=True)
        (self.store / 'previous.json').write_text(json.dumps({'path': str(other), 'release': PREVIOUS}))
        self.assertEqual(self.go(), ('refused', 'Unexpected recovery release path'))

    def test_failed_restoration_keeps_pending_json(self):
        self.previous(pending=True)
        self.health_fails = True
        with self.assertRaises(ValueError):
            self.go()
        self.assertTrue((self.store / 'pending.json').exists())   # nothing recorded as recovered


class Source(unittest.TestCase):
    def test_the_ci_account_still_cannot_run_it(self):
        sudoers = (root / 'deploy/ovh/ci/sudoers').read_text()
        rules = [line for line in sudoers.splitlines() if line and not line.startswith('#')]
        self.assertEqual(rules, ['vidfetch-deploy ALL=(root) NOPASSWD: /usr/local/libexec/vidfetch-ci/promote.py'])
        for path in [root / 'deploy/ovh/ci/dispatch.py', root / '.github/workflows/deploy.yml']:
            self.assertNotIn('rollback.py', path.read_text(), path.name)

    def test_the_promoter_rule_is_unchanged(self):
        promoter = (root / 'deploy/ovh/ci/promote.py').read_text()
        self.assertIn("raise ValueError('Engine/gateway artifact changed; separate administrator review required')", promoter)
        self.assertIn("ENGINE_FILES = ['backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs']", promoter)

    def test_what_the_installer_checks_is_in_the_helper(self):
        helper = (root / 'deploy/ovh/ci/rollback.py').read_text()
        installer = (root / 'deploy/ovh/media/admin/12-rollback-helper.sh').read_text()
        for line in ["if os.geteuid() != 0 or os.environ.get('SUDO_USER') == 'vidfetch-deploy':",
                     "why = None if ready == '0' else incompatibility(helper, target)"]:
            self.assertIn(line, helper)
            self.assertIn(line, installer)


if __name__ == '__main__':
    unittest.main()
