#!/usr/bin/env python3
"""Fetch one immutable, successful main artifact. No SSH or release execution."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import zipfile

REPO = 'aouirdani/vidfetch'
WORKFLOW = '.github/workflows/deploy.yml'
LIMIT = 350 * 1024**2


def api(path):
    # gh handles its authentication internally; credentials never appear in argv.
    result = subprocess.run(['gh', 'api', f'repos/{REPO}/{path}'],
                            capture_output=True, check=True, timeout=60)
    return json.loads(result.stdout)


def select(run_id, sha, operation, get=api):
    if not re.fullmatch(r'[1-9][0-9]{0,19}', run_id or ''):
        raise ValueError('artifact_run_id must name a successful source run; no rebuild fallback')
    if not re.fullmatch(r'[a-f0-9]{40}', sha or '') or operation not in ('verify', 'deploy'):
        raise ValueError('Invalid commit or operation')
    run = get(f'actions/runs/{run_id}')
    workflow = get('actions/workflows/deploy.yml')
    if (run['id'] != int(run_id) or run['status'] != 'completed' or run['conclusion'] != 'success'
            or run['head_sha'] != sha or run['head_branch'] != 'main'
            or run['repository']['full_name'] != REPO or run['head_repository']['full_name'] != REPO
            or run['path'] != WORKFLOW or run['workflow_id'] != workflow['id']
            or run['event'] not in ('push', 'workflow_dispatch')):
        raise ValueError('Source must be a successful trusted workflow on this exact main commit')
    if operation == 'deploy':
        # A validate-only run is not evidence of a successful VPS verification.
        jobs = get(f'actions/runs/{run_id}/attempts/{run["run_attempt"]}/jobs?per_page=100')
        if jobs['total_count'] > 100 or not any(
                j['name'] == 'deploy' and j['conclusion'] == 'success' for j in jobs['jobs']):
            raise ValueError('Deploy requires a source run with a successful VPS transfer; run verify first')
    listing = get(f'actions/runs/{run_id}/artifacts?per_page=100')
    matches = [a for a in listing['artifacts'] if a['name'] == f'release-{sha}']
    if listing['total_count'] > 100 or len(matches) != 1:
        raise ValueError('Exactly one source release artifact is required')
    artifact = matches[0]
    origin = artifact['workflow_run']
    if (artifact['expired'] or not 0 < artifact['size_in_bytes'] <= LIMIT + 1024**2
            or origin['id'] != int(run_id) or origin['head_sha'] != sha
            or origin['head_branch'] != 'main'
            or origin['repository_id'] != run['repository']['id']
            or origin['head_repository_id'] != run['repository']['id']
            or not isinstance(artifact['id'], int) or artifact['id'] <= 0
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', artifact.get('digest') or '')):
        raise ValueError('Expired, oversized or untrusted artifact; no fallback rebuild')
    return artifact


def download(artifact, target):
    # Binary response is streamed with a hard limit. Never print redirected URLs.
    with tempfile.TemporaryFile() as errors, target.open('xb') as output:
        child = subprocess.Popen(['gh', 'api', f'repos/{REPO}/actions/artifacts/{artifact["id"]}/zip'],
                                 stdout=subprocess.PIPE, stderr=errors)
        try:
            size = 0
            while chunk := child.stdout.read(65536):
                size += len(chunk)
                if size > LIMIT + 1024**2:
                    raise ValueError('Downloaded artifact exceeds bound')
                output.write(chunk)
            if child.wait(timeout=60) != 0:
                raise ValueError('Artifact download failed; no rebuild fallback')
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
            child.stdout.close()


def unpack(archive, artifact, sha, destination):
    with archive.open('rb') as stream:
        if 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest() != artifact['digest']:
            raise ValueError('GitHub artifact SHA-256 mismatch')
    if archive.stat().st_size != artifact['size_in_bytes']:
        raise ValueError('GitHub artifact size mismatch')
    name = f'release-{sha}.tgz'
    with zipfile.ZipFile(archive) as zipped:
        members = zipped.infolist()
        if (len(members) != 1 or members[0].filename != name
                or not 0 < members[0].file_size <= LIMIT
                or stat.S_ISLNK(members[0].external_attr >> 16)):
            raise ValueError('Artifact must contain only the expected bounded release archive')
        target = destination / name
        with zipped.open(members[0]) as source, target.open('xb') as output:
            shutil.copyfileobj(source, output, 65536)
    # Check identity without executing or extracting application code.
    with tarfile.open(target, 'r:gz') as tar:
        manifest = None
        total = 0
        for count, member in enumerate(tar, 1):
            total += member.size
            if count > 20000 or total > 1200 * 1024**2:
                raise ValueError('Release exceeds inspection bounds')
            if member.name.removeprefix('./') == 'manifest.json':
                if manifest is not None or not member.isfile() or member.size > 4 * 1024**2:
                    raise ValueError('Invalid release manifest entry')
                manifest = json.load(tar.extractfile(member))
        if not manifest or manifest.get('release') != sha or manifest.get('schema') != 1 or manifest.get('platform') != 'linux-x64':
            raise ValueError('Release manifest identity mismatch')
    with target.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    return target, checksum


def main():
    if os.environ.get('GITHUB_REPOSITORY') != REPO or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Only the trusted main workflow may reuse releases')
    run_id, sha = os.environ.get('ARTIFACT_RUN_ID'), os.environ.get('GITHUB_SHA')
    if run_id == os.environ.get('GITHUB_RUN_ID'):
        raise ValueError('A completed earlier source run is required')
    artifact = select(run_id, sha, os.environ.get('RELEASE_OPERATION'))
    # All partial files belong to this local runner; existing uploads remain untouched.
    with tempfile.TemporaryDirectory() as work:
        folder = Path(work)
        download(artifact, folder / 'artifact.zip')
        archive, checksum = unpack(folder / 'artifact.zip', artifact, sha, folder)
        with archive.open('rb') as source, Path(archive.name).open('xb') as target:
            shutil.copyfileobj(source, target, 65536)
    proof = {'sourceRun': int(run_id), 'artifactId': artifact['id'], 'release': sha,
             'artifactDigest': artifact['digest'], 'archiveSha256': checksum, 'rebuilt': False}
    print(json.dumps(proof))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('\nExact release reuse\n```json\n' + json.dumps(proof, indent=2) + '\n```\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No subprocess stderr, tokens or signed artifact URLs in output.
        print('Release reuse refused: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
