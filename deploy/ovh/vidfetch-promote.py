#!/usr/bin/python3
"""Privileged file installation only. Never runs repository scripts as root."""
import base64
import fcntl
import hashlib
import hmac
import http.client
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from pathlib import Path

BASE = Path('/opt/vidfetch-web')
INCOMING = Path('/var/lib/vidfetch-deploy/incoming')
UNITS = ['vidfetch.service', 'vidfetch-gateway.service', 'vidfetch-web.service']
DRAIN = Path('/run/vidfetch-deployment/drain')

def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        while chunk := stream.read(65536):
            h.update(chunk)
    return h.hexdigest()

def extract_checked(archive, destination, expected):
    """No symlinks, devices, duplicate paths, traversal or unchecked payload."""
    with tarfile.open(archive, 'r:gz') as tar:
        seen = set(); count = 0; total = 0
        for member in tar:
            count += 1; total += member.size
            if count > 20000 or total > 1200 * 1024**2:
                raise ValueError('Release exceeds its extraction bounds')
            name = member.name.removeprefix('./').rstrip('/')
            if name in ('', '.') and member.isdir():
                continue
            if name.startswith('/') or '..' in name.split('/') or '\\' in name or name in seen:
                raise ValueError('Unsafe or duplicate archive path')
            seen.add(name)
            if not member.isfile() and not member.isdir():
                raise ValueError('Archive links and special files are forbidden')
            if any(p.startswith('.env') for p in name.split('/')) or member.mode & 0o6000:
                raise ValueError('Secret files and privileged modes are forbidden')
            # Python 3.13 data filter also rejects paths escaping the destination.
            tar.extract(member, destination, filter='data')
    manifest = json.loads((destination / 'manifest.json').read_text())
    files = manifest.get('files', {})
    if manifest.get('schema') != 1 or manifest.get('platform') != 'linux-x64' or manifest.get('release') != expected or not files:
        raise ValueError('Invalid release manifest')
    actual = {str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file()}
    if actual != set(files) | {'manifest.json'}:
        raise ValueError('Manifest does not cover all files')
    for name, checksum in files.items():
        if not re.fullmatch(r'[a-f0-9]{64}', checksum) or digest(destination / name) != checksum:
            raise ValueError('Release file checksum failed')
    for name in ['app/server.js', 'backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs']:
        if name not in files:
            raise ValueError('Required release component missing')
    # Root-owned immutable application code, readable by the service accounts.
    for path in sorted(destination.rglob('*'), reverse=True):
        os.chmod(path, 0o755 if path.is_dir() else 0o644)
    return manifest

def pointer(base, target):
    temp = base / ('.current-' + uuid.uuid4().hex)
    temp.symlink_to(target)
    os.replace(temp, base / 'current')

def restart(units):
    subprocess.run(['/usr/bin/systemctl', 'reset-failed', *units], check=True)
    subprocess.run(['/usr/bin/systemctl', 'restart', *units], check=True)

def json_get(port, path, headers=None):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        conn.request('GET', path, headers=headers or {})
        response = conn.getresponse()
        data = response.read(65537)
        if response.status != 200 or len(data) > 65536:
            raise ValueError('Readiness failed')
        return json.loads(data)
    finally:
        conn.close()

def health(expected):
    web = json_get(3000, '/api/health')
    worker = json_get(8788, '/api/health', {'Host': '127.0.0.1:8788'})
    if not web.get('ok') or web.get('release') != expected or not worker.get('ok') or worker.get('engine', {}).get('isolationProfile') != 'vidfetch-uid-nft-v1':
        raise ValueError('Release or isolation readiness failed')
    subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', *UNITS], check=True)
    conn = http.client.HTTPConnection('127.0.0.1', 3000, timeout=3)
    try:
        conn.request('GET', '/'); response = conn.getresponse(); response.read(4096)
        if response.status != 200:
            raise ValueError('Homepage readiness failed')
    finally:
        conn.close()

def wait_health(expected):
    for attempt in range(30):
        try:
            health(expected); return
        except (ValueError, OSError, subprocess.CalledProcessError):
            time.sleep(1)
    raise ValueError('Readiness timed out')

def drain():
    env = {}
    for line in Path('/etc/vidfetch/gateway.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1); env[key] = value.strip()
    key = base64.urlsafe_b64decode(env['VIDFETCH_ACCESS_SIGNING_KEY'] + '==')
    host = env['VIDFETCH_GATEWAY_ORIGIN'].removeprefix('https://').rstrip('/')
    # A root-private endpoint proves that this gateway supports draining.
    for attempt in range(360):
        timestamp, nonce = str(int(time.time() * 1000)), str(uuid.uuid4())
        body_hash = base64.urlsafe_b64encode(hashlib.sha256(b'').digest()).decode().rstrip('=')
        payload = json.dumps({'timestamp': timestamp, 'nonce': nonce, 'body': body_hash}, separators=(',', ':')).encode()
        mac = base64.urlsafe_b64encode(hmac.new(key, payload, hashlib.sha256).digest()).decode().rstrip('=')
        status = json_get(8789, '/auth/deployment', {'Host': host, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1',
            'X-VidFetch-Service-Time': timestamp, 'X-VidFetch-Service-Nonce': nonce, 'X-VidFetch-Service-MAC': mac})
        if status.get('draining') is not True:
            raise ValueError('Gateway has not enabled safe draining')
        if status.get('active') is False and status.get('waiting') == 0:
            return
        time.sleep(2)
    raise ValueError('Active transfers did not finish; deployment cancelled')

def promote(base, target, expected, changed, do_restart=restart, check=wait_health):
    """The exact pointer/restart/rollback sequence is independently testable."""
    previous = (base / 'current').resolve(strict=True)
    pointer(base, target)
    try:
        do_restart(changed); check(expected)
    except Exception:
        pointer(base, previous)
        try:
            previous_sha = json.loads((previous / 'manifest.json').read_text())['release']
            do_restart(changed); check(previous_sha)
        except Exception:
            print('ROLLBACK FAILED: administrative intervention required', file=sys.stderr)
            raise
        print('ROLLBACK VALIDATED: previous release restored', file=sys.stderr)
        raise
    return previous

def prune_releases(base, current, previous):
    """Only verified, root-owned release directories in this dedicated namespace."""
    folder = base / 'releases'
    releases = []
    for path in folder.iterdir():
        if not re.fullmatch(r'[a-f0-9]{40}', path.name) or path.is_symlink() or not path.is_dir(): continue
        if path.stat().st_uid != os.geteuid() or path.stat().st_mode & 0o022: continue
        try:
            if json.loads((path / 'manifest.json').read_text()).get('release') != path.name: continue
        except (OSError, ValueError): continue
        releases.append(path)
    releases.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    keep = {current.resolve(), previous.resolve(), *(p.resolve() for p in releases[:5])}
    for path in releases:
        if path.resolve() not in keep:
            shutil.rmtree(path)
            print('Pruned old managed release: ' + path.name)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 3:
        sys.exit('Root helper expects release and archive checksum')
    sha, checksum = sys.argv[1:]
    if not re.fullmatch(r'[a-f0-9]{40}', sha) or not re.fullmatch(r'[a-f0-9]{64}', checksum):
        sys.exit('Invalid release identifiers')
    gate = Path('/etc/vidfetch/full-migration-ready')
    info = gate.lstat() if gate.exists() else None
    if not info or not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or gate.read_text().strip() != 'APPROVED':
        sys.exit('Initial deployment has not been approved; activation gate is closed')
    for unit, entry in [('vidfetch.service', 'backend/vidfetch-ovh.cjs'), ('vidfetch-gateway.service', 'backend/vidfetch-gateway.cjs'), ('vidfetch-web.service', 'app/server.js')]:
        command = subprocess.check_output(['/usr/bin/systemctl', 'show', unit, '-p', 'ExecStart', '--value'], text=True)
        if str(BASE / 'current' / entry) not in command:
            sys.exit('Service does not use the approved release pointer: ' + unit)
    DRAIN.parent.mkdir(mode=0o755, exist_ok=True)
    folder = DRAIN.parent.lstat()
    if not stat.S_ISDIR(folder.st_mode) or folder.st_uid != 0 or folder.st_mode & 0o022:
        sys.exit('Unsafe deployment control directory')
    lock_fd = os.open(DRAIN.parent / 'lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if shutil.disk_usage(BASE).free < 3 * 1024**3:
            sys.exit('Less than 3 GiB available; existing releases preserved')
        source = INCOMING / (sha + '.tgz')
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 350 * 1024**2:
            sys.exit('Invalid upload')
        releases = BASE / 'releases'
        stage = Path(tempfile.mkdtemp(prefix='.verify-', dir=releases))
        with os.fdopen(fd, 'rb') as incoming, open(stage / 'upload.tgz', 'xb') as output:
            shutil.copyfileobj(incoming, output, 65536)
        archive = stage / 'upload.tgz'
        if digest(archive) != checksum:
            sys.exit('Copied archive checksum failed; evidence retained')
        app = stage / 'release'; app.mkdir()
        manifest = extract_checked(archive, app, sha)
        target = releases / sha
        if target.exists():
            sys.exit('Release already exists; no existing release overwritten')
        app.rename(target)
        current = (BASE / 'current').resolve(strict=True)
        before = json.loads((current / 'manifest.json').read_text())['files']
        backend_changed = any(before.get(p) != manifest['files'][p] for p in ['backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs'])
        worker_changed = before.get('backend/vidfetch-ovh.cjs') != manifest['files']['backend/vidfetch-ovh.cjs']
        gateway_changed = before.get('backend/vidfetch-gateway.cjs') != manifest['files']['backend/vidfetch-gateway.cjs']
        changed = ['vidfetch-web.service']
        if worker_changed: changed = UNITS
        elif gateway_changed: changed = ['vidfetch-gateway.service', 'vidfetch-web.service']
        drain_created = False
        drain_marker = uuid.uuid4().hex
        try:
            if backend_changed:
                if DRAIN.exists():
                    raise ValueError("Existing maintenance flag preserved; deployment cancelled")
                DRAIN.parent.mkdir(mode=0o755, exist_ok=True)
                fd = os.open(DRAIN, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
                with os.fdopen(fd, "w") as flag: flag.write(drain_marker)
                drain_created = True
                drain()
            old = promote(BASE, target, sha, changed)
            print(f'VALIDATED release {sha}; previous retained: {old.name}; services: {", ".join(changed)}')
        finally:
            # Remove only the root-owned temporary flag created by this operation.
            if drain_created and DRAIN.exists() and DRAIN.read_text() == drain_marker:
                DRAIN.unlink()
        prune_releases(BASE, target, old)
        # This exact upload has been copied, checked and installed. Never unlink a replaced inode.
        uploaded = source.lstat()
        if stat.S_ISREG(uploaded.st_mode) and uploaded.st_ino == info.st_ino and uploaded.st_dev == info.st_dev:
            source.unlink()
        shutil.rmtree(stage) # Root-private directory created by this invocation only.

if __name__ == '__main__':
    main()
