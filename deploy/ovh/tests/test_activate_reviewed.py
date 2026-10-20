"""activate-reviewed.py: the administrator-reviewed activation of a release whose gateway changed.

The real CI promoter (deploy/ovh/ci/promote.py) and its release library are used; only the system is simulated
(systemctl, nft, /proc, the frontend health and public origin checks, the protected PIDs)."""
import contextlib
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

root = Path(__file__).parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SHA, OLD = 'a' * 40, 'b' * 40
sha256 = lambda data: hashlib.sha256(data).hexdigest()
OLD_FILES = {'app/server.js': b'web-old', 'backend/vidfetch-ovh.cjs': b'engine', 'backend/vidfetch-gateway.cjs': b'gateway-old'}
NEW_FILES = {'app/server.js': b'web-new', 'backend/vidfetch-ovh.cjs': b'engine', 'backend/vidfetch-gateway.cjs': b'gateway-new'}
GATEWAY_NEW = sha256(NEW_FILES['backend/vidfetch-gateway.cjs'])
SECRET = 'CANARY-TURNSTILE-SECRET-never-printed'
RULES = 'table inet vidfetch_https_test_ingress {\n\tset dl_rate4 {\n\t\ttype ipv4_addr\n%s\t}\n\tchain input { tcp dport 22 accept }\n}'


class Reviewed(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        t = Path(self.temp.name).resolve()
        self.p = load('promote_under_test', root / 'deploy/ovh/ci/promote.py')
        self.tool = load('activate_reviewed_under_test', root / 'deploy/ovh/media/admin/activate-reviewed.py')
        self.base, self.store = t / 'base', t / 'store'
        for d in [self.base, self.store / 'releases', self.store / 'staging', t / 'incoming', t / 'caddy', t / 'proc/101', t / 'proc/102', t / 'run']:
            d.mkdir(parents=True)
        self.old = self.store / 'releases' / OLD
        self.release(self.old, OLD, OLD_FILES)
        (self.base / 'current').symlink_to(self.old)
        # what the engine and gateway processes run: the active release's bundles
        self.bundles = {'vidfetch.service': t / 'engine.cjs', 'vidfetch-gateway.service': t / 'gateway-old.cjs'}
        self.bundles['vidfetch.service'].write_bytes(OLD_FILES['backend/vidfetch-ovh.cjs'])
        self.bundles['vidfetch-gateway.service'].write_bytes(OLD_FILES['backend/vidfetch-gateway.cjs'])
        for pid, unit in [('101', 'vidfetch.service'), ('102', 'vidfetch-gateway.service')]:
            (t / 'proc' / pid / 'cmdline').write_bytes(b'/usr/bin/node\0' + str(self.bundles[unit]).encode() + b'\0')
        self.pids = {'vidfetch.service': '101', 'vidfetch-gateway.service': '102'}
        (t / 'caddy/Caddyfile.public-dl').write_text('dl public')
        (t / 'caddy/current').symlink_to('Caddyfile.public-dl')
        (t / 'sshd_config').write_text('PasswordAuthentication yes\n')
        self.web_env = t / 'web.env'
        self.web_env.write_text(f'VIDFETCH_TARGET=ovh\nTURNSTILE_SECRET_KEY={SECRET}\nVIDFETCH_CONNECTION_READY=0\n')
        self.rules = RULES % '\t\telements = { 198.51.100.7 limit rate over 120/minute burst 60 packets }\n'
        self.profile, self.protected = 'public', {'ssh.service': '869', 'vidfetch-gateway.service': '102', 'vidfetch.service': '101'}
        self.health_fails_for, self.restarts, self.on_restart, self.guard_error = set(), [], None, None
        for target, name, value in [(self.p, 'BASE', self.base), (self.p, 'STORE', self.store), (self.p, 'INCOMING', t / 'incoming'),
                                    (self.tool, 'WEB_ENV', self.web_env), (self.tool, 'TOOLKIT_LOCK', t / 'run/toolkit.lock'),
                                    (self.tool, 'CADDY_BASE', t / 'caddy'), (self.tool, 'SSHD_CONFIG', t / 'sshd_config'), (self.tool, 'PROC', t / 'proc'),
                                    (self.p, 'command', self.command), (self.p, 'protected_pids', lambda: dict(self.protected)),
                                    (self.p, 'guards', self.guards), (self.p, 'origin_health', lambda: None), (self.p, 'restart', self.restart),
                                    (self.p, 'wait_health', self.wait_health), (self.p, 'profile', lambda: self.profile),
                                    (self.p, 'trusted', lambda path: None)]:
            mock = patch.object(target, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        for mock in [patch.object(self.tool.shutil, 'disk_usage', return_value=SimpleNamespace(free=10 * 1024**3)),
                     patch.object(self.tool.os, 'geteuid', return_value=0),
                     patch.dict(os.environ, {'SUDO_USER': 'debian'}, clear=False)]:
            mock.start()
            self.addCleanup(mock.stop)
        os.environ.pop('SSH_ORIGINAL_COMMAND', None)

    # ---- the simulated system
    def release(self, folder, sha, files):
        folder.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (folder / name).parent.mkdir(parents=True, exist_ok=True)
            (folder / name).write_bytes(data)
        (folder / 'manifest.json').write_text(json.dumps({'schema': 1, 'release': sha, 'platform': 'linux-x64', 'files': {k: sha256(v) for k, v in files.items()}}))

    def archive(self, files=None, manifest_files=None, sha=SHA):
        files = files or NEW_FILES
        manifest = {'schema': 1, 'release': sha, 'platform': 'linux-x64', 'files': {k: sha256(v) for k, v in (manifest_files or files).items()}}
        path = self.p.INCOMING / (sha + '.tgz')
        with tarfile.open(path, 'w:gz') as tar:
            for name, data in {**files, 'manifest.json': json.dumps(manifest).encode()}.items():
                item = tarfile.TarInfo(name)
                item.size = len(data)
                tar.addfile(item, io.BytesIO(data))
        return sha256(path.read_bytes())

    def command(self, args):
        if args[0].endswith('nft'):
            return self.rules
        unit, prop = args[2], args[3]
        if prop == '-pExecStart':
            return f'{{ path=/usr/bin/node ; argv[]=/usr/bin/node {self.bundles[unit]} ; ignore_errors=no }}'
        if prop == '-pMainPID':
            return self.pids[unit]
        raise AssertionError(args)

    def guards(self):
        if self.guard_error:
            raise self.guard_error

    def restart(self):
        self.restarts.append(os.readlink(self.base / 'current'))
        if self.on_restart:
            action, self.on_restart = self.on_restart, None
            action()

    def wait_health(self, sha):
        if sha in self.health_fails_for:
            raise ValueError('Frontend readiness timed out')

    def go(self, mode='activate', archive=None, gateway=GATEWAY_NEW):
        archive = archive or self.archive()
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = self.tool.run([mode, SHA, archive, gateway], self.p)
            except self.tool.Refused as error:
                code, err = 'refused-early', io.StringIO(str(error))
        return code, out.getvalue() + err.getvalue()

    def current(self):
        return (self.base / 'current').resolve()

    def records(self):
        folder = self.store / 'reviewed'
        return [json.loads(f.read_text()) for f in sorted(folder.iterdir())] if folder.exists() else []

    def assert_untouched(self, output):
        self.assertEqual(self.current(), self.old, output)
        self.assertEqual(self.restarts, [], output)
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertFalse((self.store / 'previous.json').exists())

    # ---- the CI promoter's own lock is untouched
    def test_the_ci_promoter_still_refuses_this_release(self):
        checksum = self.archive()
        with self.assertRaisesRegex(ValueError, 'Engine/gateway artifact changed; separate administrator review required'):
            self.p.verify(SHA, checksum)

    # ---- success
    def test_check_verifies_and_extracts_without_switching(self):
        code, output = self.go('check')
        self.assertEqual(code, 0, output)
        self.assertIn('CHECKED', output)
        self.assertTrue((self.store / 'releases' / SHA / 'backend/vidfetch-gateway.cjs').is_file())
        self.assert_untouched(output)
        self.assertEqual(self.records()[-1]['result'], 'checked: ready for activation')

    def test_check_does_not_require_downloads_closed(self):
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.profile = 'public-downloads'
        code, output = self.go('check')
        self.assertEqual(code, 0, output)

    def test_activation_switches_records_and_keeps_the_rollback_path(self):
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)
        self.assertEqual(json.loads((self.store / 'previous.json').read_text())['path'], str(self.old))  # what rollback.py restores
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertIn(f'08-gateway.sh upgrade {GATEWAY_NEW}', output)
        entry = self.records()[-1]
        self.assertEqual((entry['result'], entry['previous_release'], entry['gateway_sha256'], entry['administrator']), ('activated', OLD, GATEWAY_NEW, 'debian'))
        self.assertEqual(entry['gateway_in_service'], sha256(OLD_FILES['backend/vidfetch-gateway.cjs']))
        record = next((self.store / 'reviewed').iterdir())
        self.assertEqual(oct(record.stat().st_mode & 0o777), '0o600')
        self.assertEqual(oct((self.store / 'reviewed').stat().st_mode & 0o777), '0o700')

    def test_a_rerun_reuses_the_identical_extracted_release(self):
        self.assertEqual(self.go('check')[0], 0)
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)

    def test_dynamic_set_elements_are_not_a_network_change(self):
        def traffic():
            self.rules = RULES % '\t\telements = { 203.0.113.50 limit rate over 120/minute burst 60 packets }\n'
        self.on_restart = traffic
        code, output = self.go()
        self.assertEqual(code, 0, output)

    def test_no_secret_in_output_or_record(self):
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertNotIn(SECRET, output)
        self.assertNotIn(SECRET, json.dumps(self.records()))

    # ---- refusals before anything changes
    def test_wrong_gateway_fingerprint(self):
        code, output = self.go(gateway='c' * 64)
        self.assertEqual(code, 1)
        self.assertIn('does not match the independently built fingerprint', output)
        self.assert_untouched(output)
        self.assertTrue(self.records()[-1]['result'].startswith('refused:'))

    def test_modified_manifest(self):
        # the manifest announces the reviewed gateway, the archive carries another file
        tampered = {**NEW_FILES, 'backend/vidfetch-gateway.cjs': b'gateway-tampered'}
        code, output = self.go(archive=self.archive(files=tampered, manifest_files=NEW_FILES))
        self.assertEqual(code, 1)
        self.assertIn('Release file checksum failed', output)
        self.assert_untouched(output)

    def test_archive_without_the_ci_checksum(self):
        self.archive()
        code, output = self.go(archive='d' * 64)
        self.assertEqual(code, 1)
        self.assertIn('does not have the CI checksum', output)
        self.assert_untouched(output)

    def test_release_id_must_be_the_commit(self):
        checksum = self.archive(sha=SHA)
        manifest_other = self.p.INCOMING / (SHA + '.tgz')
        with tarfile.open(manifest_other, 'w:gz') as tar:   # same file name, manifest for another commit
            for name, data in {**NEW_FILES, 'manifest.json': json.dumps({'schema': 1, 'release': 'e' * 40, 'platform': 'linux-x64',
                                                                         'files': {k: sha256(v) for k, v in NEW_FILES.items()}}).encode()}.items():
                item = tarfile.TarInfo(name); item.size = len(data); tar.addfile(item, io.BytesIO(data))
        code, output = self.go(archive=sha256(manifest_other.read_bytes()))
        self.assertEqual(code, 1)
        self.assertIn('Invalid release manifest', output)
        self.assertNotEqual(checksum, None)
        self.assert_untouched(output)

    def test_engine_change(self):
        changed = {**NEW_FILES, 'backend/vidfetch-ovh.cjs': b'engine-modified'}
        code, output = self.go(archive=self.archive(files=changed))
        self.assertEqual(code, 1)
        self.assertIn('engine bundle changed', output)
        self.assert_untouched(output)

    def test_unchanged_gateway_goes_through_the_ci_promoter(self):
        same = {**NEW_FILES, 'backend/vidfetch-gateway.cjs': OLD_FILES['backend/vidfetch-gateway.cjs']}
        code, output = self.go(archive=self.archive(files=same), gateway=sha256(OLD_FILES['backend/vidfetch-gateway.cjs']))
        self.assertEqual(code, 1)
        self.assertIn('use the CI promoter', output)
        self.assert_untouched(output)

    def test_downloads_open(self):
        for ready, profile in [('1', 'public-downloads'), ('0', 'public-downloads'), ('1', 'public'), ('', 'public'), ('0', 'media-test')]:
            with self.subTest(ready=ready, profile=profile):
                self.web_env.write_text(f'VIDFETCH_CONNECTION_READY={ready}\n' if ready else 'VIDFETCH_TARGET=ovh\n')
                self.profile = profile
                code, output = self.go()
                self.assertEqual(code, 1)
                self.assertIn('downloads must be closed', output)
                self.assert_untouched(output)

    def test_gateway_drift_before_the_change(self):
        self.bundles['vidfetch-gateway.service'].write_bytes(b'some other gateway')
        code, output = self.go()
        self.assertEqual(code, 1)
        self.assertIn('gateway in service is not the active release gateway', output)
        self.assert_untouched(output)

    def test_running_process_differs_from_its_unit(self):
        (Path(self.temp.name) / 'proc/101/cmdline').write_bytes(b'/usr/bin/node\0/opt/other/vidfetch-ovh.cjs\0')
        code, output = self.go()
        self.assertEqual(code, 1)
        self.assertIn('does not execute the configured bundle', output)
        self.assert_untouched(output)

    def test_service_unavailable(self):
        self.guard_error = subprocess.CalledProcessError(3, ['systemctl', 'is-active', 'vidfetch-gateway.service'])
        code, output = self.go()
        self.assertEqual(code, 1)
        self.assertIn('pre-check failed', output)
        self.assert_untouched(output)

    def test_unfinished_promotion_then_recovery(self):
        (self.store / 'pending.json').write_text(json.dumps({'previous': str(self.old), 'target': 'x'}))
        code, output = self.go()
        self.assertEqual(code, 1)
        self.assertIn('run rollback.py first', output)
        self.assertEqual(self.current(), self.old)
        # rollback.py renames pending.json once it has restored the previous release; then the activation proceeds
        (self.store / 'pending.json').rename(self.store / 'recovered-1.json')
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)

    def test_existing_release_with_other_content(self):
        self.release(self.store / 'releases' / SHA, SHA, {**NEW_FILES, 'app/server.js': b'something else'})
        code, output = self.go()
        self.assertEqual(code, 1)
        self.assertIn('no overwrite', output)
        self.assert_untouched(output)

    def test_concurrent_operations(self):
        for path in [self.store / 'lock', Path(self.temp.name) / 'run/toolkit.lock']:
            with self.subTest(lock=path.name), open(path, 'a') as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                code, output = self.go()
                self.assertEqual(code, 'refused-early')
                self.assertIn('another operation holds', output)
                self.assert_untouched(output)
                fcntl.flock(held, fcntl.LOCK_UN)

    def test_only_an_administrator(self):
        for label, env, euid in [('not root', {}, 1000), ('CI account', {'SUDO_USER': 'vidfetch-deploy'}, 0),
                                 ('CI forced command', {'SSH_ORIGINAL_COMMAND': 'verify x y'}, 0)]:
            with self.subTest(label), patch.dict(os.environ, env), patch.object(self.tool.os, 'geteuid', return_value=euid):
                code, output = self.go()
                self.assertEqual(code, 'refused-early')
                self.assert_untouched(output)
                os.environ.pop('SSH_ORIGINAL_COMMAND', None)

    def test_arguments(self):
        for argv in [[], ['deploy', SHA, 'a' * 64, 'b' * 64], ['activate', 'abc', 'a' * 64, 'b' * 64],
                     ['activate', SHA, 'A' * 64, 'b' * 64], ['activate', SHA, 'a' * 64]]:
            with self.subTest(argv=argv), self.assertRaises(self.tool.Refused):
                self.tool.run(argv, self.p)
        self.assert_untouched('')

    # ---- failures after the switch: the promoter's switch restores the previous release
    def assert_rolled_back(self, output):
        self.assertEqual(self.current(), self.old, output)
        self.assertEqual(self.restarts[-1], str(self.old), output)   # restarted on the previous release
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertFalse((self.store / 'previous.json').exists())
        self.assertTrue(self.records()[-1]['result'].startswith('failed and rolled back'), self.records()[-1])

    def raises_after_switch(self, label):
        with self.assertRaises(BaseException) as caught:
            self.go()
        return str(caught.exception)

    def test_frontend_unhealthy_after_the_switch(self):
        self.health_fails_for = {SHA}
        error = self.raises_after_switch('health')
        self.assertIn('readiness', error)
        self.assert_rolled_back(error)

    def test_network_rules_changed_during_activation(self):
        def change():
            self.rules = RULES.replace('tcp dport 22 accept', 'tcp dport 22 drop') % ''
        self.on_restart = change
        error = self.raises_after_switch('nft')
        self.assertIn('nft_rules', error)
        self.assert_rolled_back(error)

    def test_caddy_changed_during_activation(self):
        def change():
            os.remove(Path(self.temp.name) / 'caddy/current')
            (Path(self.temp.name) / 'caddy/Caddyfile.public').write_text('apex only')
            (Path(self.temp.name) / 'caddy/current').symlink_to('Caddyfile.public')
        self.on_restart = change
        error = self.raises_after_switch('caddy')
        self.assertIn('caddy', error)
        self.assert_rolled_back(error)

    def test_a_protected_service_restarted_during_activation(self):
        def change():
            self.protected['vidfetch-gateway.service'] = '999'
        self.on_restart = change
        error = self.raises_after_switch('pids')
        self.assertIn('protected_pids', error)
        self.assert_rolled_back(error)

    def test_downloads_reopened_during_activation(self):
        def reopen():
            self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.on_restart = reopen
        error = self.raises_after_switch('ready')
        self.assertIn('downloads must be closed', error)
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.assert_rolled_back(error)

    def test_restoration_that_cannot_be_validated_is_left_to_rollback_py(self):
        self.health_fails_for = {SHA, OLD}   # the previous release does not come back healthy either
        error = self.raises_after_switch('both unhealthy')
        self.assertIn('readiness', error)
        self.assertEqual(self.current(), self.old)                      # the pointer is back on the previous release
        self.assertTrue((self.store / 'pending.json').exists())          # but the transaction stays open for rollback.py
        self.assertIn('rollback NOT validated', self.records()[-1]['result'])
        code, output = self.go()                                         # and nothing new can start meanwhile
        self.assertEqual(code, 1)
        self.assertIn('run rollback.py first', output)

    def test_interrupted_activation(self):
        def interrupt():
            self.p.cancelled(15, None)   # what SIGTERM does during the switch
        self.on_restart = interrupt
        error = self.raises_after_switch('interrupt')
        self.assertIn('Deployment interrupted', error)
        self.assert_rolled_back(error)
        # and the administrator can simply run it again
        self.health_fails_for = set()
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)


class Source(unittest.TestCase):
    def test_not_reachable_by_the_ci_account(self):
        tool = (root / 'deploy/ovh/media/admin/activate-reviewed.py').read_text()
        self.assertIn("CI_ACCOUNT = 'vidfetch-deploy'", tool)
        for path in [root / 'deploy/ovh/ci/install.py', root / 'deploy/ovh/ci/dispatch.py', root / 'deploy/ovh/ci/promote.py']:
            self.assertNotIn('activate-reviewed', path.read_text(), path.name)

    def test_the_promoter_rule_is_unchanged(self):
        promoter = (root / 'deploy/ovh/ci/promote.py').read_text()
        self.assertIn("raise ValueError('Engine/gateway artifact changed; separate administrator review required')", promoter)
        self.assertIn("ENGINE_FILES = ['backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs']", promoter)


if __name__ == '__main__':
    unittest.main()
