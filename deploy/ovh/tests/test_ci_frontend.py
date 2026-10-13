import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

folder = Path(__file__).parents[1] / 'ci'
spec = importlib.util.spec_from_file_location('ci_promote', folder / 'promote.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
SHA = 'a' * 40
OLD = 'b' * 40


class Frontend(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.old = self.base / 'old'
        self.new = self.base / 'new'
        self.old.mkdir()
        self.new.mkdir()
        self.files = {'app/server.js': b'web', 'backend/vidfetch-ovh.cjs': b'engine', 'backend/vidfetch-gateway.cjs': b'gateway'}
        self.manifest = {'schema': 1, 'release': SHA, 'platform': 'linux-x64', 'files': {k: hashlib.sha256(v).hexdigest() for k, v in self.files.items()}}
        (self.old / 'manifest.json').write_text(json.dumps({**self.manifest, 'release': OLD}))
        (self.base / 'current').symlink_to(self.old)
        (self.base / 'persisted').write_text('persistent data')
        for name in ['releases', 'staging', 'incoming']:
            (self.base / name).mkdir()
        for name, value in [('BASE', self.base), ('STORE', self.base), ('INCOMING', self.base / 'incoming'), ('GATE', self.base / 'gate')]:
            mock = patch.object(p, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        space = patch.object(p.shutil, 'disk_usage', return_value=SimpleNamespace(free=10 * 1024**3))
        space.start()
        self.addCleanup(space.stop)

    def archive(self, members=None, manifest=None):
        file = p.INCOMING / (SHA + '.tgz')
        with tarfile.open(file, 'w:gz') as tar:
            for name, data in (members or {**self.files, 'manifest.json': json.dumps(manifest or self.manifest).encode()}).items():
                item = tarfile.TarInfo(name)
                item.size = len(data)
                tar.addfile(item, io.BytesIO(data))
        return file, hashlib.sha256(file.read_bytes()).hexdigest()

    def test_success_retains_predecessor_and_persistent_data(self):
        self.assertEqual(p.switch(self.new, SHA, lambda: None, lambda sha: self.assertEqual(sha, SHA), lambda: None), self.old)
        self.assertEqual((self.base / 'current').resolve(), self.new)
        self.assertEqual(json.loads((self.base / 'previous.json').read_text())['path'], str(self.old))
        self.assertEqual((self.base / 'persisted').read_text(), 'persistent data')
        self.assertTrue(self.old.is_dir())
        self.assertFalse((self.base / 'pending.json').exists())

    def test_failed_local_health_rolls_back(self):
        checked = []
        def check(sha):
            checked.append(sha)
            if sha == SHA:
                raise ValueError('synthetic readiness failure')
        with self.assertRaises(ValueError):
            p.switch(self.new, SHA, lambda: None, check, lambda: None)
        self.assertEqual(checked, [SHA, OLD])
        self.assertEqual((self.base / 'current').resolve(), self.old)
        self.assertTrue(self.new.is_dir())

    def test_public_protection_failure_rolls_back(self):
        calls = []
        def public():
            calls.append(1)
            if len(calls) == 1:
                raise ValueError('authentication unexpectedly missing')
        with self.assertRaises(ValueError):
            p.switch(self.new, SHA, lambda: None, lambda sha: None, public)
        self.assertEqual(len(calls), 2)
        self.assertEqual((self.base / 'current').resolve(), self.old)

    def test_restart_failure_rolls_back(self):
        calls = []
        def restart():
            calls.append(1)
            if len(calls) == 1:
                raise OSError('service failed')
        with self.assertRaises(OSError):
            p.switch(self.new, SHA, restart, lambda sha: None, lambda: None)
        self.assertEqual(len(calls), 2)
        self.assertEqual((self.base / 'current').resolve(), self.old)

    def test_failed_rollback_leaves_recovery_record(self):
        with self.assertRaises(OSError):
            p.switch(self.new, SHA, lambda: (_ for _ in ()).throw(OSError()), lambda sha: None, lambda: None)
        self.assertTrue((self.base / 'pending.json').exists())
        self.assertEqual((self.base / 'current').resolve(), self.old)

    def test_unfinished_transaction_refuses_new_switch(self):
        (self.base / 'pending.json').write_text('{}')
        with self.assertRaises(FileExistsError):
            p.switch(self.new, SHA, lambda: None, lambda sha: None, lambda: None)
        self.assertEqual((self.base / 'current').resolve(), self.old)

    def test_verify_never_switches_and_identical_retry_is_safe(self):
        _, checksum = self.archive()
        target = p.verify(SHA, checksum)
        self.assertEqual(p.verify(SHA, checksum), target)
        self.assertEqual((self.base / 'current').resolve(), self.old)
        self.assertTrue((p.INCOMING / (SHA + '.tgz')).exists())

    def test_changed_engine_rejected(self):
        self.files['backend/vidfetch-ovh.cjs'] = b'changed'
        self.manifest['files']['backend/vidfetch-ovh.cjs'] = hashlib.sha256(b'changed').hexdigest()
        _, checksum = self.archive()
        with self.assertRaisesRegex(ValueError, 'Engine/gateway'):
            p.verify(SHA, checksum)

    def test_low_disk_refuses_without_switch_or_removal(self):
        archive, checksum = self.archive()
        with patch.object(p.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024**3)):
            with self.assertRaisesRegex(ValueError, '3 GiB'):
                p.verify(SHA, checksum)
        self.assertTrue(archive.exists())
        self.assertEqual((self.base / 'current').resolve(), self.old)

    def test_checksum_and_existing_release_corruption_rejected(self):
        _, checksum = self.archive()
        with self.assertRaisesRegex(ValueError, 'checksum'):
            p.verify(SHA, '0' * 64)
        target = p.verify(SHA, checksum)
        (target / 'app/server.js').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'differs'):
            p.verify(SHA, checksum)

    def test_traversal_secret_link_duplicate_and_missing_manifest(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('app/.env', tarfile.REGTYPE), ('app/link', tarfile.SYMTYPE), ('app/device', tarfile.CHRTYPE)]:
            file = self.base / 'unsafe.tgz'
            with tarfile.open(file, 'w:gz') as tar:
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = '/etc/passwd'
                tar.addfile(item)
            with tempfile.TemporaryDirectory() as out, self.assertRaises(ValueError):
                p.core['extract_checked'](file, Path(out), SHA)
        self.assertFalse((self.base.parent / 'escape').exists())

    def test_gate_absent_closed_and_non_root_owned_rejected(self):
        self.assertFalse(p.gate_open())
        p.GATE.write_text('APPROVED_FRONTEND_TEST')
        with patch.object(p, 'trusted', side_effect=ValueError('Unsafe root configuration')):
            with self.assertRaises(ValueError):
                p.gate_open()

    def test_media_ready_health_rejected(self):
        with patch.object(p, 'response', return_value=(200, json.dumps({'ok': True, 'release': SHA, 'downloads': {'available': True}}))):
            with self.assertRaises(ValueError):
                p.health(SHA)


if __name__ == '__main__':
    unittest.main()
