#!/usr/bin/env python3
"""Install only the reviewed VidFetch release and unit; never overwrite a path."""
import hashlib
import json
import os
import pathlib
import subprocess

STAGE = pathlib.Path('/home/user/vidfetch-systemd-staging-20261011-xG0uZFm0')
RELEASE = pathlib.Path('/opt/vidfetch/releases/20261011-eu3x4mea')
UNIT = pathlib.Path('/etc/systemd/system/vidfetch.service')
FILES = {
    'vidfetch-backend.cjs': 'd370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c',
    'service-preflight.cjs': '752f9ced37ba14a83de97dc8086cad5188bc8524b1442b9c2972139da6b57741',
    'vidfetch.service': '037941b8a2577705dcbd8b87cea219a60ee757d5f129c3b995df54f11e6c8969',
}
if os.geteuid() != 0:
    raise SystemExit('Run with sudo only for authorized VidFetch installation')
os.umask(0o022)
for path in [UNIT, pathlib.Path('/etc/systemd/system/vidfetch.service.d'), RELEASE,
             pathlib.Path('/var/lib/vidfetch'), pathlib.Path('/var/lib/private/vidfetch'), pathlib.Path('/run/vidfetch')]:
    if path.exists() or path.is_symlink():
        raise SystemExit('Existing destination; no overwrite: ' + str(path))
state = subprocess.run(['systemctl', 'show', 'vidfetch.service', '-p', 'LoadState', '--value'],
                       capture_output=True, text=True, check=True).stdout.strip()
if state != 'not-found':
    raise SystemExit('An existing VidFetch unit is already loaded')
ports = subprocess.run(['ss', '-H', '-ltn', 'sport = :8788'], capture_output=True, text=True, check=True).stdout
if ports.strip():
    raise SystemExit('Port 8788 occupied; no process will be stopped')
contents = {}
for name, digest in FILES.items():
    path = STAGE / name
    if path.is_symlink() or not path.is_file():
        raise SystemExit('Invalid staged file: ' + name)
    contents[name] = path.read_bytes()
    if hashlib.sha256(contents[name]).hexdigest() != digest:
        raise SystemExit('Staged digest mismatch: ' + name)
protected = pathlib.Path('/home/user/vidfetch-backend/server.js')
before = hashlib.sha256(protected.read_bytes()).hexdigest()
if before != '3600f54180e7c6ecf41950597dfb6e4bb90d9be6db35a4b3b685b2af09dc1f09':
    raise SystemExit('Pre-existing backend changed; review before installation')
for path in [pathlib.Path('/opt'), pathlib.Path('/opt/vidfetch'), pathlib.Path('/opt/vidfetch/releases')]:
    if path.exists():
        if path.is_symlink() or not path.is_dir() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022:
            raise SystemExit('Unsafe release parent: ' + str(path))
    else:
        path.mkdir(mode=0o755)
RELEASE.mkdir(mode=0o755)
for name in ['vidfetch-backend.cjs', 'service-preflight.cjs']:
    path = RELEASE / name
    with path.open('xb') as out:
        out.write(contents[name])
    path.chmod(0o644)
subprocess.run(['/usr/local/bin/node', '--check', str(RELEASE / 'vidfetch-backend.cjs')], check=True)
subprocess.run(['/usr/local/bin/node', '--check', str(RELEASE / 'service-preflight.cjs')], check=True)
subprocess.run(['systemd-analyze', 'verify', str(STAGE / 'vidfetch.service')], check=True)
with UNIT.open('xb') as out:
    out.write(contents['vidfetch.service'])
UNIT.chmod(0o644)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
result = {'release': str(RELEASE), 'unit': str(UNIT), 'installedSha256': FILES,
          'preexistingBackendBefore': before, 'preexistingBackendAfter': hashlib.sha256(protected.read_bytes()).hexdigest(),
          'started': False, 'enabled': False, 'existingFilesOverwritten': False}
print(json.dumps(result))
