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
        self.nft_calls, self.on_nft = 0, {}   # call number -> action, to act between the switch's check and the final one
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
            self.nft_calls += 1
            if self.nft_calls in self.on_nft:
                self.on_nft.pop(self.nft_calls)()
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
        self.assertEqual((entry['result'], entry['exit_code'], entry['previous_release'], entry['gateway_sha256'], entry['administrator']), ('activated', 0, OLD, GATEWAY_NEW, 'debian'))
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

    def test_every_run_keeps_its_own_record(self):
        self.assertEqual(self.go('check')[0], 0)
        self.assertEqual(self.go('check')[0], 0)
        self.assertEqual(self.go(gateway='c' * 64)[0], 1)
        self.assertEqual([r['result'][:7] for r in self.records()], ['checked', 'checked', 'refused'])

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
        self.assertEqual(self.records()[-1]['exit_code'], 1)

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

    def fails_after_switch(self, expected):
        code, output = self.go()
        self.assertEqual(code, expected, output)
        self.assertEqual(self.records()[-1]['exit_code'], expected)
        return output

    def test_frontend_unhealthy_after_the_switch(self):
        self.health_fails_for = {SHA}
        error = self.fails_after_switch(3)
        self.assertIn('readiness', error)
        self.assert_rolled_back(error)

    def test_network_rules_changed_during_activation(self):
        def change():
            self.rules = RULES.replace('tcp dport 22 accept', 'tcp dport 22 drop') % ''
        self.on_restart = change
        error = self.fails_after_switch(3)
        self.assertIn('nft_rules', error)
        self.assert_rolled_back(error)

    def test_caddy_changed_during_activation(self):
        def change():
            os.remove(Path(self.temp.name) / 'caddy/current')
            (Path(self.temp.name) / 'caddy/Caddyfile.public').write_text('apex only')
            (Path(self.temp.name) / 'caddy/current').symlink_to('Caddyfile.public')
        self.on_restart = change
        error = self.fails_after_switch(3)
        self.assertIn('caddy', error)
        self.assert_rolled_back(error)

    def test_a_protected_service_restarted_during_activation(self):
        def change():
            self.protected['vidfetch-gateway.service'] = '999'
        self.on_restart = change
        error = self.fails_after_switch(3)
        self.assertIn('protected_pids', error)
        self.assert_rolled_back(error)

    def test_downloads_reopened_during_activation(self):
        def reopen():
            self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.on_restart = reopen
        error = self.fails_after_switch(3)
        self.assertIn('downloads must be closed', error)
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.assert_rolled_back(error)

    def test_restoration_that_cannot_be_validated_is_left_to_rollback_py(self):
        self.health_fails_for = {SHA, OLD}   # the previous release does not come back healthy either
        error = self.fails_after_switch(4)
        self.assertIn('readiness', error)
        self.assertEqual(self.current(), self.old)                      # the pointer is back on the previous release
        self.assertTrue((self.store / 'pending.json').exists())          # but the transaction stays open for rollback.py
        self.assertIn('rollback NOT validated', self.records()[-1]['result'])
        code, output = self.go()                                         # and nothing new can start meanwhile
        self.assertEqual(code, 1)
        self.assertIn('run rollback.py first', output)

    # ---- state transitions around the switch
    def test_a_final_recheck_failure_after_a_successful_switch_is_not_called_a_rollback(self):
        def drift():   # 1st nft call: before; 2nd: inside the switch (passes); 3rd: the final re-check
            self.rules = RULES.replace('tcp dport 22 accept', 'tcp dport 22 drop') % ''
        self.on_nft = {3: drift}
        code, output = self.go()
        self.assertEqual(code, 2, output)
        self.assertIn('final re-check failed', output)
        self.assertIn('rollback.py', output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)    # the release stays active: nothing is undone
        self.assertEqual(json.loads((self.store / 'previous.json').read_text())['path'], str(self.old))
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertTrue(self.records()[-1]['result'].startswith('activated; final re-check FAILED'), self.records()[-1])
        self.assertEqual(self.records()[-1]['exit_code'], 2)

    def test_signals_are_ignored_once_switched_then_restored(self):
        import signal
        seen = {}
        self.on_nft = {3: lambda: seen.setdefault('post', signal.getsignal(signal.SIGTERM))}
        self.on_restart = lambda: seen.setdefault('switch', signal.getsignal(signal.SIGTERM))
        original = signal.getsignal(signal.SIGTERM)
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertIs(seen['switch'], self.p.cancelled)        # inside the switch: an interruption is undone
        self.assertEqual(seen['post'], signal.SIG_IGN)         # once switched: nothing left to undo, interruptions ignored
        self.assertEqual(signal.getsignal(signal.SIGTERM), original)

    def test_a_rerun_on_the_active_release_is_refused_and_changes_nothing(self):
        self.assertEqual(self.go()[0], 0)
        restarts = list(self.restarts)
        code, output = self.go()
        self.assertEqual(code, 1, output)
        self.assertIn('already the active one', output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)
        self.assertEqual(self.restarts, restarts)
        self.assertTrue(self.records()[-1]['result'].startswith('refused:'))

    def test_an_interruption_during_the_pre_checks_changes_nothing(self):
        import signal
        def interrupted():
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)   # what the installed handler does on SIGTERM
        self.guards = interrupted
        with patch.object(self.p, 'guards', interrupted):
            code, output = self.go()
        self.assertEqual(code, 1, output)
        self.assertIn('pre-check failed', output)
        self.assert_untouched(output)
        self.assertTrue(self.records()[-1]['result'].startswith('refused: pre-check failed'))

    def test_interrupted_activation(self):
        def interrupt():
            self.p.cancelled(15, None)   # what SIGTERM does during the switch
        self.on_restart = interrupt
        error = self.fails_after_switch(3)
        self.assertIn('Deployment interrupted', error)
        self.assert_rolled_back(error)
        # and the administrator can simply run it again
        self.health_fails_for = set()
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)

    # ---- exit status = the state actually reached, for interruptions and incomplete restorations
    def test_an_interruption_right_after_the_switch_is_reported_as_activated(self):
        switch = self.p.switch
        def switched_then_interrupted(*args, **kwargs):
            switch(*args, **kwargs)
            self.p.cancelled(15, None)   # SIGTERM between the switch's return and the final re-check
        with patch.object(self.p, 'switch', switched_then_interrupted):
            code, output = self.go()
        self.assertEqual(code, 2, output)
        self.assertIn('final re-check did not complete', output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)   # active, not undone, not called a rollback
        self.assertEqual(json.loads((self.store / 'previous.json').read_text())['path'], str(self.old))
        self.assertFalse((self.store / 'pending.json').exists())
        self.assertEqual(self.records()[-1]['exit_code'], 2)
        self.assertTrue(self.records()[-1]['result'].startswith('activated; final re-check FAILED (interrupted)'), self.records()[-1])

    def test_a_restoration_interrupted_by_a_failed_restart_is_not_validated(self):
        def restore_fails():
            raise subprocess.CalledProcessError(1, ['systemctl', 'restart', 'vidfetch-web.service'])
        def first_restart():   # the new release fails; the restart of the previous one fails too
            self.on_restart = restore_fails
        self.health_fails_for, self.on_restart = {SHA}, first_restart
        output = self.fails_after_switch(4)
        self.assertIn('pending.json kept', output)
        self.assertEqual(self.current(), self.old)                       # pointer back, but its restart not validated
        self.assertTrue((self.store / 'pending.json').exists())
        self.assertIn('rollback NOT validated', self.records()[-1]['result'])
        self.assertEqual(self.go()[0], 1)                                 # nothing new before rollback.py

    def test_a_switch_that_cannot_record_its_predecessor_is_not_validated(self):
        (self.store / 'previous.next').mkdir()   # the switch's last step (previous.json) fails after the new release passed
        output = self.fails_after_switch(4)
        self.assertIn('pending.json kept', output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)
        self.assertTrue((self.store / 'pending.json').exists())
        self.assertEqual(self.go()[0], 1)

    def test_another_release_active_after_a_failure_is_not_validated(self):
        other = self.store / 'releases' / ('c' * 40)
        self.release(other, 'c' * 40, OLD_FILES)
        def elsewhere(*args, **kwargs):
            os.remove(self.base / 'current')
            (self.base / 'current').symlink_to(other)
            raise RuntimeError('pointer changed by someone else')
        with patch.object(self.p, 'switch', elsewhere):
            code, output = self.go()
        self.assertEqual(code, 4, output)
        self.assertIn(f'unexpected active release {"c" * 40}', output)

    def test_a_second_run_during_the_switch_is_refused_and_the_first_completes(self):
        seen = {}
        def concurrent():
            seen['second'] = self.go()
        self.on_restart = concurrent
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(seen['second'][0], 'refused-early')   # run() raises Refused: exit status 1 from the command line
        self.assertIn('another operation holds', seen['second'][1])
        self.assertEqual(self.current(), self.store / 'releases' / SHA)
        self.assertEqual([r['exit_code'] for r in self.records()], [0])

    def test_the_record_is_written_with_interruptions_ignored(self):
        import signal
        record, seen = self.tool.record, []
        def recording(p, entry):   # a signal now must not replace the exit status nor lose the record
            seen.append(signal.getsignal(signal.SIGTERM))
            return record(p, entry)
        with patch.object(self.tool, 'record', recording):
            self.assertEqual(self.go()[0], 0)
            self.assertEqual(self.go(gateway='c' * 64)[0], 1)
        self.assertEqual(seen, [signal.SIG_IGN, signal.SIG_IGN])
        self.assertEqual([r['exit_code'] for r in self.records()], [0, 1])


class CommandLine(unittest.TestCase):
    """The exit status seen by the administrator's shell, before anything can change."""
    tool = root / 'deploy/ovh/media/admin/activate-reviewed.py'

    def status(self, *argv):
        done = subprocess.run(['python3', str(self.tool), *argv], capture_output=True, text=True, timeout=30,
                              env={k: v for k, v in os.environ.items() if k != 'SSH_ORIGINAL_COMMAND'})
        return done.returncode, done.stderr

    def test_malformed_arguments_exit_1(self):
        code, err = self.status('activate', 'abc')
        self.assertEqual(code, 1, err)
        self.assertIn('REFUSED: usage', err)

    @unittest.skipIf(os.geteuid() == 0, 'checks the non-root refusal')
    def test_not_root_exits_1(self):
        code, err = self.status('check', SHA, 'a' * 64, 'b' * 64)
        self.assertEqual(code, 1, err)
        self.assertIn('REFUSED: run as root', err)


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
