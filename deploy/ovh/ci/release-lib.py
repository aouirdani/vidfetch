"""Archive validation and atomic pointers; never executes release code."""
import hashlib
import json
import os
import re
import tarfile
import uuid

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
