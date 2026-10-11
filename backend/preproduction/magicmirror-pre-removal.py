#!/usr/bin/env python3
"""Recheck source/backup integrity and protected resources; never remove anything."""
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time

HOME = pathlib.Path('/home/user')
WORK = HOME / 'vidfetch-maintenance-20261011-ALaZGoF9'
EXPECTED = '1582132120467a95cc57af1246214c0088bf88ff4164b65d68f8cc364baa4b3f'
started = time.monotonic()
os.umask(0o077)


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    return {'exit': result.returncode, 'stdout': result.stdout.strip()}


manifest = json.loads((WORK / 'magicmirror-manifest.json').read_text())
archive = WORK / 'magicmirror-full.tar'
result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'archive': {'path': str(archive), 'bytes': archive.stat().st_size,
                'permissions': oct(archive.stat().st_mode & 0o777), 'sha256': sha256(archive)},
    'mismatchedSources': [],
    'unarchivedSources': [],
    'incomingSymlinks': [],
    'externalReferences': [],
    'processes': [],
}
result['archive']['valid'] = result['archive']['bytes'] == 643256320 and result['archive']['sha256'] == EXPECTED
regular_files = 0
for relative, expected in manifest.items():
    path = HOME / relative
    if not (relative == '.config/labwc/autostart' or relative.startswith('MagicMirror/') or
            relative.startswith('.config/magicmirror/')):
        raise SystemExit('Unexpected manifest source path')
    if 'sha256' in expected:
        regular_files += 1
        valid = (not path.is_symlink() and path.is_file() and path.stat().st_size == expected['size']
                 and sha256(path) == expected['sha256'])
    elif path.is_symlink():
        valid = os.readlink(path) == expected['link']
    else:
        # tar may encode a regular file as a hard link to an earlier archive entry.
        target = manifest.get(expected['link'], {})
        valid = (path.is_file() and 'sha256' in target and path.stat().st_size == target['size']
                 and sha256(path) == target['sha256'])
    if not valid:
        result['mismatchedSources'].append(relative)
for root in [HOME / 'MagicMirror', HOME / '.config/magicmirror']:
    if root.is_symlink() or not root.is_dir():
        raise SystemExit('Unexpected installation target')
    for current, directories, names in os.walk(root, followlinks=False):
        for name in names + [name for name in directories if (pathlib.Path(current) / name).is_symlink()]:
            relative = str((pathlib.Path(current) / name).relative_to(HOME))
            if relative not in manifest:
                result['unarchivedSources'].append(relative)
result['verifiedRegularFiles'] = regular_files

# Inspect readable external launchers and incoming symlinks, excluding generated
# validation/maintenance evidence and shared dependency/cache trees.
needle = re.compile(r'/home/user/MagicMirror|\bMagicMirror\b|\bmm\.sh\b', re.I)
for root in [HOME, pathlib.Path('/opt'), pathlib.Path('/usr/local/bin'), pathlib.Path('/etc/profile.d')]:
    for current, directories, names in os.walk(root, followlinks=False):
        directories[:] = [name for name in directories if name not in
            ('MagicMirror', 'node_modules', '.git', '.cache', '.npm', '.ssh') and not name.startswith('vidfetch-')]
        for name in directories + names:
            path = pathlib.Path(current) / name
            if path.is_symlink():
                try:
                    destination = str(path.resolve())
                    if destination == str(HOME / 'MagicMirror') or destination.startswith(str(HOME / 'MagicMirror') + '/'):
                        result['incomingSymlinks'].append(str(path))
                except (OSError, RuntimeError):
                    pass
            if path.name in names and path.suffix in ('.sh', '.service', '.desktop'):
                try:
                    if path.stat().st_size <= 1024 * 1024 and needle.search(path.read_text(errors='replace')):
                        result['externalReferences'].append(str(path))
                except OSError:
                    pass
for process in pathlib.Path('/proc').iterdir():
    if not process.name.isdigit():
        continue
    try:
        cwd = str((process / 'cwd').resolve())
        args = (process / 'cmdline').read_bytes().decode('utf8', errors='replace')
        if cwd == str(HOME / 'MagicMirror') or cwd.startswith(str(HOME / 'MagicMirror') + '/') or re.search(r'/home/user/MagicMirror|\bmm\.sh\b', args, re.I):
            result['processes'].append({'pid': int(process.name), 'name': (process / 'comm').read_text().strip()})
    except (OSError, RuntimeError):
        pass
result['protectedFiles'] = {
    str(path): sha256(path) for path in
    [HOME / 'vidfetch-backend/server.js', HOME / 'vidfetch-backend-validation-20261011-HvXFBSRJ/vidfetch-backend.cjs',
     HOME / 'vidfetch-backend-validation-preproduction-20261011-KUuEA2Kw/vidfetch-backend.cjs']
}
result['baseline'] = {name: command(args) for name, args in [
    ('disk', ['df', '-k', str(HOME)]), ('memory', ['free', '-m']),
    ('ports', ['ss', '-ltnp', '( sport = :8787 or sport = :8788 or sport = :8080 )']),
    ('sizes', ['du', '-sk', str(HOME / 'MagicMirror'), str(HOME / '.config/magicmirror')]),
]}
result['elapsedSeconds'] = round(time.monotonic() - started, 2)
result['valid'] = (result['archive']['valid'] and regular_files == 21648 and
                   not any(result[key] for key in ['mismatchedSources', 'unarchivedSources', 'incomingSymlinks', 'processes']) and
                   set(result['externalReferences']) <= {str(HOME / '.config/labwc/autostart')})
with (WORK / 'pre-removal-verification.json').open('x') as out:
    json.dump(result, out, indent=2)
print(json.dumps(result))
sys.exit(0 if result['valid'] else 1)
