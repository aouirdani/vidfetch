import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


contract = module('public_contract', 'scripts/release/public_contract.py')
promote = module('fast_promote', 'deploy/ovh/ci/promote.py')
dispatch = module('fast_dispatch', 'deploy/ovh/ci/dispatch.py')


class PublicContract(unittest.TestCase):
    def html(self, *, canonical='https://vidfetch.app/', robots='index, follow', review=False):
        author = {'@type': 'Person', 'name': 'Someone else'} if review else {'@type': 'Organization', 'name': 'VidFetch'}
        graph = json.dumps({'@type': 'BlogPosting', 'author': author})
        return f'''<html><head><title>A &amp; B</title><meta name="description" content="Description">
        <meta name="robots" content="{robots}"><link rel="canonical" href="{canonical}">
        <link rel="alternate" hreflang="en" href="https://vidfetch.app/">
        <link rel="alternate" hreflang="x-default" href="https://vidfetch.app/">
        <meta name="google-adsense-account" content="ca-pub-7903460199253248"></head>
        <body><article data-guide-legacy="true" data-guide-reviewed="{str(review).lower()}">
        <h1>Hello<br><span>world &amp; more</span></h1><p data-guide-byline>AI assisted</p>
        <p>Published <time datetime="2026-10-20">20 October</time></p>
        <script type="application/ld+json">{graph}</script></article></body></html>'''.encode()

    def check(self, html=None, headers=None):
        alternates = {'en': 'https://vidfetch.app/', 'x-default': 'https://vidfetch.app/'}
        with patch.object(contract, 'get', return_value=(headers or {}, html or self.html())):
            return contract.page('http://127.0.0.1:1234', '/', alternates)[1]

    def test_parser_keeps_exact_h1_text_and_decodes_entities(self):
        data = self.check()
        self.assertEqual(data['h1'], ['Helloworld & more'])
        self.assertEqual(data['title'], ['A & B'])

    def test_href_serialization_matches_existing_browser_audit(self):
        data = self.check(self.html(canonical='https://vidfetch.app'))
        self.assertEqual(data['canonical'], ['https://vidfetch.app/'])
        with self.assertRaises(AssertionError):
            self.check(self.html(canonical='/'))

    def test_arabic_urls_and_fragment_links_keep_their_real_target(self):
        parser = contract.Page('/fr')
        parser.feed('<a href="/ar/أدلة">Guides</a><a href="#steps">Steps</a>')
        self.assertEqual(parser.data['links'], {'/ar/%D8%A3%D8%AF%D9%84%D8%A9': 1, '/fr': 1})

    def test_noindex_header_and_meta_wrong_canonical_and_unreviewed_person_block(self):
        for html, headers in [(self.html(), {'X-Robots-Tag': 'noindex'}),
                              (self.html(robots='noindex, follow'), {}),
                              (self.html(canonical='https://vidfetch.app/fr'), {}),
                              (self.html(review=True), {})]:
            with self.subTest(html=html[:20], headers=headers), self.assertRaises(AssertionError):
                self.check(html, headers)

    def test_review_date_claim_on_legacy_byline_blocks(self):
        html = self.html().replace(b'<p data-guide-byline>AI assisted</p>', b'<p data-guide-byline>AI <time datetime="2026-11-17">reviewed</time></p>')
        with self.assertRaises(AssertionError):
            self.check(html)

    def test_public_failure_workflow_uses_guarded_rollback_and_no_browser(self):
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn("steps.public.outcome == 'failure'", workflow)
        self.assertIn('DEPLOY_OPERATION: rollback', workflow)
        self.assertNotIn('pull_request:', workflow)
        for slow in ['chromium', 'lighthouse', 'ffmpeg', 'run-load', 'test:i18n']:
            self.assertNotIn(slow, workflow.lower())
        self.assertNotIn('playwright', (ROOT / 'scripts/release/seo-check.mjs').read_text())


class Rollback(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.current = self.root / 'releases' / ('a' * 40)
        self.previous = self.root / 'releases' / ('b' * 40)
        files = {file: hashlib.sha256(b'engine').hexdigest() for file in promote.ENGINE_FILES}
        for target in [self.current, self.previous]:
            (target / 'backend').mkdir(parents=True)
            for file in promote.ENGINE_FILES:
                (target / file).write_bytes(b'engine')
            (target / 'manifest.json').write_text(json.dumps({'release': target.name, 'files': files}))
        (self.root / 'current').symlink_to(self.current)
        (self.root / 'previous.json').write_text(json.dumps({'path': str(self.previous)}))
        values = {'BASE': self.root, 'STORE': self.root, 'trusted': lambda _: None,
                  'guards': lambda: None, 'protected_pids': lambda: {'engine': '1'}, 'origin_health': lambda: None}
        for key, value in values.items():
            mocked = patch.object(promote, key, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        real_switch = promote.switch
        mocked = patch.object(promote, 'switch', lambda target, expected, **kw: real_switch(target, expected, do_restart=lambda: None, check=lambda _: None, **kw))
        mocked.start()
        self.addCleanup(mocked.stop)

    def test_stale_ci_cannot_undo_newer_release(self):
        with self.assertRaisesRegex(ValueError, 'newer or different'):
            promote.rollback('c' * 40)
        self.assertEqual((self.root / 'current').resolve(), self.current)

    def test_rollback_then_return_retains_both_immutable_releases(self):
        promote.rollback(self.current.name)
        self.assertEqual((self.root / 'current').resolve(), self.previous)
        promote.rollback(self.previous.name)
        self.assertEqual((self.root / 'current').resolve(), self.current)
        self.assertTrue(self.previous.is_dir())
        self.assertFalse((self.root / 'pending.json').exists())

    def test_engine_tampering_blocks_rollback_before_switch(self):
        (self.previous / promote.ENGINE_FILES[0]).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'engine/gateway mismatch'):
            promote.rollback(self.current.name)
        self.assertEqual((self.root / 'current').resolve(), self.current)

    def test_forced_ssh_only_allows_full_sha_rollback(self):
        with patch.dict('os.environ', {'SSH_ORIGINAL_COMMAND': 'rollback ' + self.current.name}), patch.object(dispatch, 'helper', return_value=0) as helper:
            self.assertEqual(dispatch.main(), 0)
            helper.assert_called_once_with('rollback', self.current.name)
        with patch.dict('os.environ', {'SSH_ORIGINAL_COMMAND': 'rollback ../../other'}), self.assertRaises(SystemExit):
            dispatch.main()
