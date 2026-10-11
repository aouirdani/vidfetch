#!/usr/bin/env python3
"""Record protected resources before/after the confirmed MagicMirror removal."""
import datetime
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys

WORK = pathlib.Path('/home/user/vidfetch-maintenance-20261011-ALaZGoF9')
phase = sys.argv[1] if len(sys.argv) == 2 else ''
if phase not in ('before', 'after'):
    raise SystemExit('Specify before or after')


def sha256(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    return {'exit': result.returncode, 'stdout': result.stdout.strip()}


data = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'phase': phase,
        'binaries': {}, 'protectedFiles': {}, 'magicMirrorProcesses': []}
for name in ('node', 'npm', 'yt-dlp', 'ffmpeg', 'ffprobe', 'ssh'):
    executable = shutil.which(name)
    if not executable:
        raise SystemExit('Required binary missing: ' + name)
    path = pathlib.Path(executable)
    data['binaries'][name] = {'path': executable, 'resolvedPath': str(path.resolve()), 'sha256': sha256(path)}
for path in [pathlib.Path('/home/user/vidfetch-backend/server.js'),
             pathlib.Path('/home/user/vidfetch-backend-validation-20261011-HvXFBSRJ/vidfetch-backend.cjs'),
             pathlib.Path('/home/user/vidfetch-backend-validation-preproduction-20261011-KUuEA2Kw/vidfetch-backend.cjs')]:
    data['protectedFiles'][str(path)] = sha256(path)
data['nodeVersion'] = command(['node', '--version'])
data['npmVersion'] = command(['npm', '--version'])
data['sshService'] = command(['systemctl', 'is-active', 'ssh'])
data['ports'] = command(['ss', '-ltnp', '( sport = :8787 or sport = :8788 or sport = :8080 )'])
data['disk'] = command(['df', '-k', '/home/user'])
data['memory'] = command(['free', '-m'])
data['targets'] = {str(path): {'exists': path.exists(), 'isSymlink': path.is_symlink()}
                   for path in [pathlib.Path('/home/user/MagicMirror'), pathlib.Path('/home/user/.config/magicmirror')]}
autostart = pathlib.Path('/home/user/.config/labwc/autostart')
data['autostart'] = {'sha256': sha256(autostart), 'mode': oct(autostart.stat().st_mode & 0o777),
                    'uid': autostart.stat().st_uid, 'gid': autostart.stat().st_gid,
                    'magicMirrorLaunchLines': [number for number, line in enumerate(autostart.read_text().splitlines(), 1)
                        if line.strip() and not line.lstrip().startswith('#') and re.search(r'magicmirror|\bmm\.sh\b', line, re.I)]}
for process in pathlib.Path('/proc').iterdir():
    if not process.name.isdigit():
        continue
    try:
        cwd = str((process / 'cwd').resolve())
        args = (process / 'cmdline').read_bytes().decode('utf8', errors='replace')
        if cwd == '/home/user/MagicMirror' or cwd.startswith('/home/user/MagicMirror/') or re.search(r'/home/user/MagicMirror|\bmm\.sh\b', args, re.I):
            data['magicMirrorProcesses'].append({'pid': int(process.name), 'name': (process / 'comm').read_text().strip()})
    except (OSError, RuntimeError):
        pass
if phase == 'after':
    before = json.loads((WORK / 'preservation-before.json').read_text())
    old = (WORK / 'autostart-before-removal').read_bytes().splitlines(keepends=True)
    new = autostart.read_bytes().splitlines(keepends=True)
    data['checks'] = {
        'binariesUnchanged': data['binaries'] == before['binaries'],
        'vidFetchFilesUnchanged': data['protectedFiles'] == before['protectedFiles'],
        'portsUnchanged': data['ports'] == before['ports'],
        'sshActive': data['sshService'] == {'exit': 0, 'stdout': 'active'},
        'targetsAbsent': all(not row['exists'] and not row['isSymlink'] for row in data['targets'].values()),
        'noMagicMirrorProcess': not data['magicMirrorProcesses'],
        'autostartOnlyLine7Changed': len(old) == len(new) and old[:6] == new[:6] and old[7:] == new[7:] and old[6] != new[6],
        'autostartPermissionsPreserved': all(data['autostart'][key] == before['autostart'][key] for key in ('mode', 'uid', 'gid')),
        'noMagicMirrorAutostart': not data['autostart']['magicMirrorLaunchLines'],
        'piBackupPresent': (WORK / 'magicmirror-full.tar').is_file() and (WORK / 'magicmirror-full.tar').stat().st_size == 643256320,
    }
    data['valid'] = all(data['checks'].values())
with (WORK / ('preservation-' + phase + '.json')).open('x') as out:
    json.dump(data, out, indent=2)
print(json.dumps(data))
if phase == 'after' and not data['valid']:
    sys.exit(1)
