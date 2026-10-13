"""CI 'media-test' profile: opt-in, root-controlled, never weakens the guard."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

folder = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('ci_promote', folder / 'ci' / 'promote.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class Profile(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file = Path(self.temp.name) / 'profile.json'
        patcher = patch.object(p, 'PROFILE', self.file)
        patcher.start()
        self.addCleanup(patcher.stop)
        # Fake root ownership so trusted() can be exercised without being root.

    def trust(self):
        return patch.object(p, 'trusted', lambda path: None)

    def write(self, data):
        self.file.write_text(json.dumps(data))

    def health(self, available, profile=None):
        body = json.dumps({'ok': True, 'release': 'r', 'downloads': {'available': available}}).encode()
        def fake(port, path):
            return {'/api/health': (200, body), '/': (200, b''), '/api/download': (503, b'')}[path]
        with patch.object(p, 'response', fake), self.trust():
            p.health('r')

    def test_default_is_closed_and_unchanged(self):
        self.assertEqual(p.profile(), 'closed')
        self.assertEqual(p.origin_checks(), p.ORIGIN_CHECKS)
        self.health(False)
        for value in (True, None, 'yes', 1):
            with self.assertRaises(ValueError):
                self.health(value)

    def test_media_profile_requires_exact_root_file(self):
        self.write(p.MEDIA_PROFILE)
        with self.trust():
            self.assertEqual(p.profile(), 'media-test')
        for bad in ({}, {**p.MEDIA_PROFILE, 'dl': 'public'}, {**p.MEDIA_PROFILE, 'extra': 1}, [], 'media-test'):
            self.write(bad)
            with self.trust(), self.assertRaises(ValueError):
                p.profile()

    def test_unsafe_profile_file_is_refused(self):
        self.write(p.MEDIA_PROFILE)
        self.file.chmod(0o666)
        with self.assertRaises(ValueError):  # not root-owned / group-world writable
            p.profile()

    def test_media_profile_accepts_boolean_only(self):
        self.write(p.MEDIA_PROFILE)
        with self.trust():
            self.health(True)
            self.health(False)
        for value in (None, 'true', 1):
            with self.trust(), self.assertRaises(ValueError):
                self.health(value)

    def test_media_profile_keeps_every_closed_check_and_adds_more(self):
        self.write(p.MEDIA_PROFILE)
        with self.trust():
            checks = p.origin_checks()
        self.assertEqual(checks[:len(p.ORIGIN_CHECKS)], p.ORIGIN_CHECKS)
        added = {(m, path): code for m, path, code in checks[len(p.ORIGIN_CHECKS):]}
        self.assertEqual(added[('POST', '/api/download-access')], 401)  # Basic Auth still first
        for path in ('/api/queue', '/auth/transfer', '/download-helper'):
            self.assertEqual(added[('GET', path)], 503)
        self.assertEqual(dict(((m, x), c) for m, x, c in checks)[('GET', '/api/download')], 503)

    def test_profile_does_not_touch_guard_or_protected_services(self):
        source = (folder / 'ci' / 'promote.py').read_text()
        guards = source[source.index('def guards'):source.index('def response')]
        self.assertNotIn('profile', guards)
        self.assertIn("'vidfetch-gateway.service'", source)
        self.assertIn('Engine/gateway artifact changed', source)
        self.assertIn('Protected configuration changed', source)

    def test_profile_is_selected_once_per_run(self):
        self.write(p.MEDIA_PROFILE)
        with self.trust(), patch.object(p, 'ACTIVE', p.profile()):
            self.file.write_text('corrupt')  # changed or damaged mid-run
            self.assertEqual(p.active_profile(), 'media-test')
            self.assertIn(('POST', '/api/download-access', 401), p.origin_checks())
        with patch.object(p, 'ACTIVE', 'closed'):
            self.write(p.MEDIA_PROFILE)
            with self.trust():
                self.assertEqual(p.origin_checks(), p.ORIGIN_CHECKS)  # cannot be upgraded mid-run
        self.file.write_text('corrupt')
        with self.trust(), self.assertRaises(ValueError):
            p.profile()  # main() calls this first, so nothing is changed

    def test_installer_script(self):
        script = Path(__file__).with_name('install-web-secrets.test.sh')
        prefix = [] if os.geteuid() == 0 else ['sudo', '-n']
        if prefix and subprocess.run(['sudo', '-n', 'true'], capture_output=True).returncode:
            self.skipTest('root required')
        if subprocess.run(['uname'], capture_output=True, text=True).stdout.strip() != 'Linux':
            self.skipTest('GNU/Linux required')
        result = subprocess.run([*prefix, 'bash', str(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
