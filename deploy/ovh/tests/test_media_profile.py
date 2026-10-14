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

    def test_public_profile_requires_exact_root_file(self):
        self.write(p.PUBLIC_PROFILE)
        with self.trust():
            self.assertEqual(p.profile(), 'public')
        for bad in ({**p.PUBLIC_PROFILE, 'dl': 'public'}, {**p.PUBLIC_PROFILE, 'apex': 'basic-auth-noindex'},
                    {**p.PUBLIC_PROFILE, 'downloads': 'open'}, {'profile': 'public'}):
            self.write(bad)
            with self.trust(), self.assertRaises(ValueError):
                p.profile()
        self.write(p.PUBLIC_PROFILE)
        self.file.chmod(0o666)
        with self.assertRaises(ValueError):
            p.profile()

    def test_public_profile_still_requires_downloads_closed(self):
        self.write(p.PUBLIC_PROFILE)
        with self.trust():
            self.health(False)
        for value in (True, None, 'false', 0):
            with self.trust(), self.assertRaises(ValueError):
                self.health(value)

    def test_public_checks_cover_every_closed_route(self):
        self.write(p.PUBLIC_PROFILE)
        with self.trust():
            checks = {(m, x): c for m, x, c in p.origin_checks()}
        for page in ('/', '/fr/', '/robots.txt', '/sitemap.xml'):
            self.assertEqual(checks[('GET', page)], 200)
        for path in ('/api/download', '/api/fetch-info', '/api/queue', '/auth/transfer', '/download-helper'):
            self.assertEqual(checks[('GET', path)], 503)
        self.assertEqual(checks[('POST', '/api/download-access')], 503)  # ready=0: the frontend refuses grants
        self.assertEqual(checks[('GET', '/auth/admission')], 404)

    def origin(self, answers):
        """Run origin_health() against canned answers: path -> (status, headers, body)."""
        class Response:
            def __init__(self, status, headers, body):
                self.status, self.headers, self.body = status, headers, body
            def read(self, n):
                return self.body[:n]
        class Conn:
            def __init__(self, host, timeout):
                self.sock = None
            def request(self, method, path, body=None):
                self.key = (method, path)
            def getresponse(self):
                return Response(*answers[self.key])
            def close(self):
                pass
        class Ctx:
            def wrap_socket(self, raw, server_hostname):
                return raw
        with patch.object(p.http.client, 'HTTPSConnection', Conn), patch.object(p.socket, 'create_connection', lambda *a, **k: None), \
             patch.object(p.ssl, 'create_default_context', lambda: Ctx()), self.trust():
            p.origin_health()

    def public_answers(self):
        page = b'<html><head><meta name="robots" content="index, follow"/></head></html>'
        robots = b'User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://vidfetch.app/sitemap.xml\n'
        sitemap = b'<urlset><url><loc>https://vidfetch.app/</loc></url></urlset>'
        closed = {'X-Robots-Tag': 'noindex, nofollow'}
        answers = {('GET', '/'): (200, {}, page), ('GET', '/fr/'): (200, {}, page),
                   ('GET', '/robots.txt'): (200, {}, robots), ('GET', '/sitemap.xml'): (200, {}, sitemap)}
        for m, x, c in p.PUBLIC_CHECKS[len(p.PUBLIC_PAGES):]:
            answers[(m, x)] = (c, closed, b'')
        return answers

    def test_public_origin_accepts_the_public_site(self):
        self.write(p.PUBLIC_PROFILE)
        with patch.object(p, 'ACTIVE', 'public'):
            self.origin(self.public_answers())

    def test_public_origin_refuses_anything_not_indexable_or_not_closed(self):
        self.write(p.PUBLIC_PROFILE)
        cases = {
            'Basic Auth still on': (('GET', '/'), (401, {'WWW-Authenticate': 'Basic realm="x"', 'X-Robots-Tag': 'noindex'}, b'')),
            'noindex header': (('GET', '/fr/'), (200, {'X-Robots-Tag': 'noindex, nofollow'}, b'<html></html>')),
            'noindex meta': (('GET', '/'), (200, {}, b'<meta name="robots" content="noindex, follow"/>')),
            'robots disallows all': (('GET', '/robots.txt'), (200, {}, b'User-agent: *\nDisallow: /\nSitemap: https://vidfetch.app/sitemap.xml\n')),
            'robots without sitemap': (('GET', '/robots.txt'), (200, {}, b'User-agent: *\nAllow: /\n')),
            'sitemap 404': (('GET', '/sitemap.xml'), (404, {}, b'')),
            'sitemap without home': (('GET', '/sitemap.xml'), (200, {}, b'<urlset></urlset>')),
            'media route open': (('GET', '/api/download'), (200, {'X-Robots-Tag': 'noindex'}, b'')),
            'grant issued': (('POST', '/api/download-access'), (200, {'X-Robots-Tag': 'noindex'}, b'{}')),
            'api without noindex': (('GET', '/api/fetch-info'), (503, {}, b'')),
            'auth endpoint exposed': (('GET', '/auth/admission'), (200, {'X-Robots-Tag': 'noindex'}, b'')),
        }
        for label, (key, answer) in cases.items():
            answers = self.public_answers(); answers[key] = answer
            with self.subTest(label), patch.object(p, 'ACTIVE', 'public'), self.assertRaises(ValueError):
                self.origin(answers)

    def test_closed_and_media_profiles_unchanged_by_public(self):
        self.assertEqual(p.ORIGIN_CHECKS, [('GET', '/', 401), ('GET', '/fr/', 401), ('GET', '/api/download', 503),
                                           ('GET', '/api/fetch-info', 503), ('GET', '/sitemap.xml', 404)])
        with patch.object(p, 'ACTIVE', 'closed'):
            self.assertEqual(p.origin_checks(), p.ORIGIN_CHECKS)
        with patch.object(p, 'ACTIVE', 'media-test'):
            self.assertEqual(p.origin_checks(), p.ORIGIN_CHECKS + p.MEDIA_CHECKS)
        # a public site is refused under the closed profile: switching Caddy alone never passes CI
        with patch.object(p, 'ACTIVE', 'closed'), self.assertRaises(ValueError):
            answers = {(m, x): (200, {}, b'') for m, x, c in p.ORIGIN_CHECKS}
            self.origin(answers)

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
