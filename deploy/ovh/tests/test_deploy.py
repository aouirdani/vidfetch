import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('promote', Path(__file__).parents[1] / 'vidfetch-promote.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
SHA = 'a' * 40

class Releases(unittest.TestCase):
    def test_rejects_traversal_links_duplicate_and_secrets(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('app/link', tarfile.SYMTYPE), ('app/.env', tarfile.REGTYPE), ('app/device', tarfile.CHRTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                base = Path(folder).resolve(); archive = base / 'input.tgz'; out = base / 'out'; out.mkdir()
                with tarfile.open(archive, 'w:gz') as t:
                    item = tarfile.TarInfo(name); item.type = kind; item.linkname = '/etc/passwd'; t.addfile(item, io.BytesIO())
                with self.assertRaises(ValueError): p.extract_checked(archive, out, SHA)
                self.assertFalse((base / 'escape').exists())

    def test_checksum_manifest_covers_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve(); out = base / 'out'; out.mkdir(); archive = base / 'input.tgz'
            files = {'app/server.js': b'web', 'backend/vidfetch-ovh.cjs': b'worker', 'backend/vidfetch-gateway.cjs': b'gateway'}
            metadata = {'schema': 1, 'release': SHA, 'platform': 'linux-x64', 'files': {n: hashlib.sha256(v).hexdigest() for n, v in files.items()}}
            with tarfile.open(archive, 'w:gz') as t:
                for name, data in {**files, 'manifest.json': json.dumps(metadata).encode()}.items():
                    item = tarfile.TarInfo(name); item.size = len(data); t.addfile(item, io.BytesIO(data))
            self.assertEqual(p.extract_checked(archive, out, SHA)['release'], SHA)

    def test_atomic_success_keeps_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve(); old = base / 'old'; new = base / 'new'; old.mkdir(); new.mkdir()
            (old / 'manifest.json').write_text(json.dumps({'release': 'b'*40})); (base / 'current').symlink_to(old)
            calls = []
            previous = p.promote(base, new, SHA, ['web'], lambda u: calls.append(u), lambda sha: self.assertEqual(sha, SHA))
            self.assertEqual(previous, old); self.assertEqual((base / 'current').resolve(), new); self.assertTrue(old.exists())
            self.assertEqual(calls, [['web']])

    def test_failed_health_restores_and_checks_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve(); old = base / 'old'; new = base / 'new'; old.mkdir(); new.mkdir()
            (old / 'manifest.json').write_text(json.dumps({'release': 'b'*40})); (base / 'current').symlink_to(old)
            checked = []; restarted = []
            def check(sha):
                checked.append(sha)
                if sha == SHA: raise ValueError('Synthetic unhealthy candidate')
            with self.assertRaises(ValueError): p.promote(base, new, SHA, ['web'], lambda units: restarted.append(units), check)
            self.assertEqual((base / 'current').resolve(), old); self.assertEqual(checked, [SHA, 'b'*40]); self.assertEqual(len(restarted), 2)
            self.assertTrue(new.exists())

if __name__ == '__main__': unittest.main()
