"""Administrator scripts, tested in a throwaway Debian container with stubbed system tools."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

root = Path(__file__).parents[3]
spec = importlib.util.spec_from_file_location('guard_update', root / 'deploy/ovh/media/admin/guard-update.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class Scripts(unittest.TestCase):
    def test_shell_scripts_in_container(self):
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['docker', 'run', '--rm', '-v', f'{root}:/r:ro', 'python:3.12-slim', 'bash', '/r/deploy/ovh/tests/admin-scripts.test.sh'],
                                capture_output=True, text=True, timeout=300)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('\nok ') + result.stdout.startswith('ok '), 30)

    def test_hardening_scenarios_in_container(self):
        """Confirm proof (tester IP, public key, margin), restore under partial failure, locking, backup round-trip."""
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['docker', 'run', '--rm', '-v', f'{root}:/r:ro', 'python:3.12-slim', 'bash', '/r/deploy/ovh/tests/admin-hardening.test.sh'],
                                capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('\nok '), 70)

    def test_path_safety_in_container(self):
        """Empty variables and invalid paths stop the scripts; canary files prove nothing else is created or removed."""
        if not shutil.which('docker') or subprocess.run(['docker', 'info'], capture_output=True).returncode:
            self.skipTest('Docker not available')
        result = subprocess.run(['docker', 'run', '--rm', '-v', f'{root}:/r:ro', 'python:3.12-slim', 'bash', '/r/deploy/ovh/tests/path-safety.test.sh'],
                                capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertGreaterEqual(result.stdout.count('\nok '), 65)

    def test_no_recursive_removal_in_administrator_scripts(self):
        import re
        for script in sorted((root / 'deploy/ovh/media/admin').glob('*.sh')) + [root / 'deploy/ovh/media/install-web-secrets.sh']:
            text = script.read_text()
            self.assertIsNone(re.search(r'\brm +(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)', text), script.name)
            self.assertIsNone(re.search(r'-delete\b|-exec +rm\b|xargs +(-\S+ +)*rm\b', text), script.name)
            self.assertTrue(os.access(script, os.X_OK), f'{script.name} is not executable')
            self.assertIsNone(re.search(r'"\$SYSD/\$[A-Z_]', text), script.name)

    def test_scripts_parse(self):
        for script in (root / 'deploy/ovh/media/admin').glob('*.sh'):
            self.assertEqual(subprocess.run(['bash', '-n', str(script)], capture_output=True).returncode, 0, script.name)


class Guard(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.a, self.b, self.c = (self.dir / n for n in 'abc')
        for f in (self.a, self.b, self.c):
            f.write_text(f.name)
            f.chmod(0o644)
        self.guard = self.dir / 'guard.json'
        self.guard.write_text(json.dumps({'files': {str(self.a): g.digest(self.a), str(self.b): g.digest(self.b)}}))
        self.guard.chmod(0o600)

    def run_guard(self, *args):
        return g.main(['--guard', str(self.guard), '--no-root-check', *args])

    def files(self):
        return json.loads(self.guard.read_text())['files']

    def test_list_and_accept_only_changed_named_files(self):
        self.b.write_text('changed')
        self.run_guard('list')
        with self.assertRaises(SystemExit):
            self.run_guard('accept', str(self.a))  # unchanged
        with self.assertRaises(SystemExit):
            self.run_guard('accept', str(self.c))  # not guarded
        with self.assertRaises(SystemExit):
            self.run_guard('accept')  # nothing implicit
        self.run_guard('accept', str(self.b))
        self.assertEqual(self.files()[str(self.b)], g.digest(self.b))
        self.assertTrue(list(self.dir.glob('guard.json.bak.*')))

    def test_add_only_strengthens_and_never_removes(self):
        before = set(self.files())
        self.run_guard('add', str(self.c))
        self.assertEqual(set(self.files()), before | {str(self.c)})
        with self.assertRaises(SystemExit):
            self.run_guard('add', str(self.c))
        with self.assertRaises(SystemExit):
            self.run_guard('add', str(self.dir / 'missing'))

    def test_refuses_writable_symlink_and_unsafe_guard(self):
        self.c.chmod(0o666)
        with self.assertRaises(SystemExit):
            self.run_guard('add', str(self.c))
        link = self.dir / 'link'
        link.symlink_to(self.a)
        with self.assertRaises(SystemExit):
            self.run_guard('add', str(link))
        self.guard.chmod(0o666)
        with self.assertRaises(SystemExit):
            self.run_guard('list')

    def test_requires_root_by_default(self):
        if os.geteuid() != 0:
            with self.assertRaises(SystemExit):
                g.main(['--guard', str(self.guard), 'list'])


if __name__ == '__main__':
    unittest.main()
