import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('reuse_release', ROOT / 'scripts/ovh/reuse-release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
SHA = 'a' * 40


class Reuse(unittest.TestCase):
    def setUp(self):
        self.run = {'id': 123, 'status': 'completed', 'conclusion': 'success', 'head_sha': SHA,
                    'head_branch': 'main', 'repository': {'full_name': r.REPO, 'id': 7},
                    'head_repository': {'full_name': r.REPO}, 'path': r.WORKFLOW,
                    'workflow_id': 11, 'event': 'workflow_dispatch', 'run_attempt': 1}
        self.artifact = {'id': 456, 'name': f'release-{SHA}', 'expired': False,
                         'size_in_bytes': 1024, 'digest': 'sha256:' + 'b' * 64,
                         'workflow_run': {'id': 123, 'head_sha': SHA, 'head_branch': 'main',
                                          'repository_id': 7, 'head_repository_id': 7}}
        self.jobs = [{'name': 'deploy', 'conclusion': 'success'}]
        self.artifacts = [self.artifact]

    def api(self, path):
        return {'actions/runs/123': self.run, 'actions/workflows/deploy.yml': {'id': 11},
                'actions/runs/123/attempts/1/jobs?per_page=100': {'total_count': len(self.jobs), 'jobs': self.jobs},
                'actions/runs/123/artifacts?per_page=100': {'total_count': len(self.artifacts), 'artifacts': self.artifacts}}[path]

    def test_validate_archive_can_be_verified_but_not_deployed(self):
        self.jobs = [{'name': 'deploy', 'conclusion': 'skipped'}]
        self.assertEqual(r.select('123', SHA, 'verify', self.api), self.artifact)
        with self.assertRaisesRegex(ValueError, 'run verify first'):
            r.select('123', SHA, 'deploy', self.api)

    def test_successful_verify_archive_can_be_deployed(self):
        self.assertEqual(r.select('123', SHA, 'deploy', self.api)['id'], 456)

    def test_missing_source_never_falls_back_to_rebuild(self):
        for run in ['', None, '../123', '1;echo bad', '0123']:
            with self.subTest(run=run), self.assertRaises(ValueError):
                r.select(run, SHA, 'verify', self.api)

    def test_failed_fork_pr_other_commit_workflow_and_branch_rejected(self):
        original = copy.deepcopy(self.run)
        for field, value in [('status', 'in_progress'), ('conclusion', 'failure'), ('head_sha', 'c' * 40),
                             ('head_branch', 'feature'), ('repository', {'full_name': 'fork/repo', 'id': 7}),
                             ('head_repository', {'full_name': 'fork/repo'}), ('path', 'other.yml'),
                             ('workflow_id', 99), ('event', 'pull_request')]:
            self.run = {**copy.deepcopy(original), field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                r.select('123', SHA, 'verify', self.api)

    def test_expired_missing_ambiguous_or_unsigned_artifact_rejected(self):
        original = copy.deepcopy(self.artifact)
        for field, value in [('expired', True), ('digest', None), ('digest', 'sha256:bad'),
                             ('size_in_bytes', r.LIMIT + 1024**2 + 1),
                             ('workflow_run', {**original['workflow_run'], 'head_repository_id': 99})]:
            self.artifact = {**copy.deepcopy(original), field: value}
            self.artifacts = [self.artifact]
            with self.subTest(field=field), self.assertRaises(ValueError):
                r.select('123', SHA, 'verify', self.api)
        for artifacts in [[], [original, original]]:
            self.artifacts = artifacts
            with self.assertRaises(ValueError):
                r.select('123', SHA, 'verify', self.api)

    def package(self, folder, manifest_sha=SHA, member=None):
        content = io.BytesIO()
        data = json.dumps({'schema': 1, 'platform': 'linux-x64', 'release': manifest_sha}).encode()
        with tarfile.open(fileobj=content, mode='w:gz') as tar:
            item = tarfile.TarInfo('./manifest.json')
            item.size = len(data)
            tar.addfile(item, io.BytesIO(data))
        archive = folder / 'artifact.zip'
        with zipfile.ZipFile(archive, 'w') as zipped:
            zipped.writestr(member or f'release-{SHA}.tgz', content.getvalue())
        artifact = {**self.artifact, 'size_in_bytes': archive.stat().st_size,
                    'digest': 'sha256:' + hashlib.sha256(archive.read_bytes()).hexdigest()}
        return archive, artifact, content.getvalue()

    def test_unpack_preserves_exact_archive_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            archive, artifact, original = self.package(folder)
            output, checksum = r.unpack(archive, artifact, SHA, folder)
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(checksum, hashlib.sha256(original).hexdigest())
            with self.assertRaises(FileExistsError):
                r.unpack(archive, artifact, SHA, folder)

    def test_zip_tampering_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            archive, artifact, _ = self.package(folder)
            archive.write_bytes(archive.read_bytes() + b'changed')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                r.unpack(archive, artifact, SHA, folder)
            self.assertFalse((folder / f'release-{SHA}.tgz').exists())

    def test_zip_path_and_manifest_commit_mismatch_rejected(self):
        for kwargs in [{'member': '../escape.tgz'}, {'manifest_sha': 'c' * 40}]:
            with tempfile.TemporaryDirectory() as temp, self.subTest(kwargs=kwargs):
                folder = Path(temp)
                archive, artifact, _ = self.package(folder, **kwargs)
                with self.assertRaises(ValueError):
                    r.unpack(archive, artifact, SHA, folder)


if __name__ == '__main__':
    unittest.main()
