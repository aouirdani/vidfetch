"""activate-reviewed.py with the optional fifth argument ENGINE_SHA256 (PR B, docs/VIDFETCH-MOTEUR-REVUE-SPEC.md §3 B1).

Written before the implementation: these tests fail until activate-reviewed.py accepts the five-argument form.
They reuse the harness of test_activate_reviewed.py (the real CI promoter and its release library; only systemctl,
nft, /proc, the frontend health and the origin checks are simulated), so both files describe one tool."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest

root = Path(__file__).parents[3]
_spec = importlib.util.spec_from_file_location('activate_reviewed_harness', Path(__file__).with_name('test_activate_reviewed.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

SHA, OLD, OLD_FILES = base.SHA, base.OLD, base.OLD_FILES
sha256 = lambda data: hashlib.sha256(data).hexdigest()
ENGINE, GATEWAY = 'backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs'
ENGINE_ONLY = {**OLD_FILES, 'app/server.js': b'web-new', ENGINE: b'engine-new'}
BOTH = {'app/server.js': b'web-new', ENGINE: b'engine-new', GATEWAY: b'gateway-new'}
ENGINE_OLD, ENGINE_NEW = sha256(OLD_FILES[ENGINE]), sha256(b'engine-new')
GATEWAY_OLD, GATEWAY_NEW = sha256(OLD_FILES[GATEWAY]), sha256(b'gateway-new')


class ReviewedEngine(unittest.TestCase):
    """The simulated system of test_activate_reviewed.Reviewed, borrowed method by method (not inherited, so that
    its 44 tests are not run a second time here)."""
    setUp = base.Reviewed.setUp
    release, archive, command, guards = base.Reviewed.release, base.Reviewed.archive, base.Reviewed.command, base.Reviewed.guards
    restart, wait_health, current, records = base.Reviewed.restart, base.Reviewed.wait_health, base.Reviewed.current, base.Reviewed.records
    assert_untouched, assert_rolled_back = base.Reviewed.assert_untouched, base.Reviewed.assert_rolled_back

    def go(self, mode='activate', files=ENGINE_ONLY, gateway=GATEWAY_OLD, engine=ENGINE_NEW, archive=None):
        archive = archive or self.archive(files=files)
        argv = [mode, SHA, archive, gateway] + ([engine] if engine is not None else [])
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = self.tool.run(argv, self.p)
            except self.tool.Refused as error:
                code, err = 'refused-early', io.StringIO(str(error))
        return code, out.getvalue() + err.getvalue()

    # ---- the CI promoter's own lock is untouched
    def test_the_ci_promoter_still_refuses_an_engine_change(self):
        with self.assertRaisesRegex(ValueError, 'Engine/gateway artifact changed; separate administrator review required'):
            self.p.verify(SHA, self.archive(files=ENGINE_ONLY))

    # ---- success
    def test_check_an_engine_only_release_without_switching(self):
        code, output = self.go('check')
        self.assertEqual(code, 0, output)
        self.assertIn('CHECKED', output)
        self.assertTrue((self.store / 'releases' / SHA / ENGINE).is_file())
        self.assert_untouched(output)

    def test_check_does_not_require_downloads_closed(self):
        self.web_env.write_text('VIDFETCH_CONNECTION_READY=1\n')
        self.profile = 'public-downloads'
        code, output = self.go('check')
        self.assertEqual(code, 0, output)

    def test_activate_an_engine_only_release(self):
        code, output = self.go()
        self.assertEqual(code, 0, output)
        self.assertEqual(self.current(), self.store / 'releases' / SHA)
        self.assertEqual(json.loads((self.store / 'previous.json').read_text())['path'], str(self.old))   # rollback.py's target
        self.assertIn(f'13-engine.sh upgrade {ENGINE_NEW}', output)
        self.assertNotIn('08-gateway.sh upgrade', output)   # the gateway does not change: nothing to upgrade there
        # the 15-minute observation comes before the reopening (spec v3, decision 1)
        self.assertLess(output.index(f'13-engine.sh upgrade {ENGINE_NEW}'), output.index('13-engine.sh observe'))
        self.assertLess(output.index('13-engine.sh observe'), output.index('11-downloads.sh open'))
        entry = self.records()[-1]
        self.assertEqual((entry['result'], entry['exit_code'], entry['engine_sha256'], entry['engine_in_service'],
                          entry['engine_changed'], entry['gateway_changed']), ('activated', 0, ENGINE_NEW, ENGINE_OLD, True, False))

    def test_activate_a_release_changing_both_names_the_engine_first(self):
        code, output = self.go(files=BOTH, gateway=GATEWAY_NEW)
        self.assertEqual(code, 0, output)
        engine_step, gateway_step = output.find(f'13-engine.sh upgrade {ENGINE_NEW}'), output.find(f'08-gateway.sh upgrade {GATEWAY_NEW}')
        self.assertGreaterEqual(engine_step, 0, output)
        self.assertGreater(gateway_step, engine_step, '08-gateway.sh refuses while the engine is not the release engine (F5)')
        self.assertGreater(output.find('13-engine.sh observe'), gateway_step, 'one observation, after both upgrades')
        self.assertGreater(output.find('11-downloads.sh open'), output.find('13-engine.sh observe'))
        entry = self.records()[-1]
        self.assertEqual((entry['engine_changed'], entry['gateway_changed'], entry['gateway_sha256']), (True, True, GATEWAY_NEW))

    def test_the_frontend_switch_never_restarts_the_engine(self):
        def engine_restarted():
            self.protected['vidfetch.service'] = '4242'
        self.on_restart = engine_restarted
        code, output = self.go()
        self.assertEqual(code, 3, output)
        self.assertIn('protected_pids', output)
        self.assert_rolled_back(output)

    # ---- refusals: nothing changes
    def test_wrong_engine_fingerprint(self):
        code, output = self.go(engine='c' * 64)
        self.assertEqual(code, 1, output)
        self.assertIn('the release engine does not match the independently built fingerprint', output)
        self.assert_untouched(output)
        self.assertEqual(self.records()[-1]['exit_code'], 1)

    def test_tampered_engine_in_the_archive(self):
        # the manifest announces the reviewed engine, the archive carries another file: the promoter's extraction refuses
        tampered = {**ENGINE_ONLY, ENGINE: b'engine-tampered'}
        code, output = self.go(archive=self.archive(files=tampered, manifest_files=ENGINE_ONLY))
        self.assertEqual(code, 1, output)
        self.assertIn('Release file checksum failed', output)
        self.assert_untouched(output)

    def test_gateway_fingerprint_must_be_the_release_gateway_even_when_unchanged(self):
        code, output = self.go(gateway=GATEWAY_NEW)   # the release keeps the old gateway
        self.assertEqual(code, 1, output)
        self.assertIn('the release gateway does not match the independently built fingerprint', output)
        self.assert_untouched(output)

    def test_nothing_changed_goes_through_the_ci_promoter(self):
        same = {**OLD_FILES, 'app/server.js': b'web-new'}
        code, output = self.go(files=same, engine=ENGINE_OLD)
        self.assertEqual(code, 1, output)
        self.assertIn('use the CI promoter', output)
        self.assert_untouched(output)

    def test_engine_drift_before_the_change(self):
        self.bundles['vidfetch.service'].write_bytes(b'some other engine')
        code, output = self.go()
        self.assertEqual(code, 1, output)
        self.assertIn('engine in service is not the active release engine', output)
        self.assert_untouched(output)

    def test_downloads_open(self):
        for ready, profile in [('1', 'public-downloads'), ('0', 'public-downloads'), ('1', 'public'), ('', 'public')]:
            with self.subTest(ready=ready, profile=profile):
                self.web_env.write_text(f'VIDFETCH_CONNECTION_READY={ready}\n' if ready else 'VIDFETCH_TARGET=ovh\n')
                self.profile = profile
                code, output = self.go()
                self.assertEqual(code, 1, output)
                self.assertIn('downloads must be closed', output)
                self.assert_untouched(output)

    def test_malformed_engine_fingerprint(self):
        for engine in ['abc', 'A' * 64, 'g' * 64, 'a' * 63]:
            with self.subTest(engine=engine), self.assertRaises(self.tool.Refused):
                self.tool.run(['activate', SHA, 'a' * 64, GATEWAY_OLD, engine], self.p)
        with self.assertRaises(self.tool.Refused):   # six arguments
            self.tool.run(['activate', SHA, 'a' * 64, GATEWAY_OLD, ENGINE_NEW, 'x'], self.p)
        self.assert_untouched('')

    # ---- the four-argument form is unchanged
    def test_four_arguments_still_refuse_an_engine_change_and_name_the_new_form(self):
        code, output = self.go(engine=None)
        self.assertEqual(code, 1, output)
        self.assertIn('engine bundle changed', output)
        self.assertIn('ENGINE_SHA256', output)
        self.assert_untouched(output)


class CommandLine(unittest.TestCase):
    tool = root / 'deploy/ovh/media/admin/activate-reviewed.py'

    def test_a_malformed_fifth_argument_exits_1(self):
        done = subprocess.run(['python3', str(self.tool), 'activate', SHA, 'a' * 64, 'b' * 64, 'short'], capture_output=True, text=True,
                              timeout=30, env={k: v for k, v in os.environ.items() if k != 'SSH_ORIGINAL_COMMAND'})
        self.assertEqual(done.returncode, 1, done.stderr)
        self.assertIn('REFUSED: usage', done.stderr)
        self.assertIn('ENGINE_SHA256', done.stderr)


class Source(unittest.TestCase):
    def test_the_usage_documents_the_engine_form(self):
        tool = (root / 'deploy/ovh/media/admin/activate-reviewed.py').read_text()
        self.assertTrue('GATEWAY_SHA256 ENGINE_SHA256' in tool, 'the docstring does not document the five-argument form')


if __name__ == '__main__':
    unittest.main()
