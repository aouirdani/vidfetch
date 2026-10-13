#!/usr/bin/python3
"""Install a new isolated frontend release; never rewire installed services."""
import hashlib
import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.request

assert os.geteuid() == 0 and len(sys.argv) == 4
stage = Path(sys.argv[1]).resolve(strict=True)
sha, checksum = sys.argv[2:]
assert stage.parent == Path('/home/debian') and stage.name.startswith('vidfetch-launch-20261013-')
assert re.fullmatch('[a-f0-9]{40}', sha) and re.fullmatch('[a-f0-9]{64}', checksum)
archive = stage / ('release-' + sha[:8] + '.tgz')
assert not archive.is_symlink() and hashlib.file_digest(open(archive, 'rb'), 'sha256').hexdigest() == checksum
base = Path('/opt/vidfetch-web-preproduction-20261013')
target = Path('/opt/vidfetch-web/releases') / sha
unit = Path('/etc/systemd/system/vidfetch-web-preproduction-20261013.service')
for path in [base, target, unit]:
    assert not path.exists() and not path.is_symlink(), f'Existing path preserved: {path}'
with socket.socket() as test:
    test.bind(('127.0.0.1', 3001))
loader = SourceFileLoader('checked_release', '/usr/local/libexec/vidfetch-promote')
spec = importlib.util.spec_from_loader('checked_release', loader)
helper = importlib.util.module_from_spec(spec); loader.exec_module(helper)
protected = ['ssh.service', 'vidfetch.service', 'vidfetch-gateway.service', 'vidfetch-web-candidate.service']
def pids():
    return {name: subprocess.check_output(['systemctl', 'show', name, '-pMainPID', '--value'], text=True).strip() for name in protected}
before = pids()
previous = str(Path('/opt/vidfetch-web/current').resolve(strict=True))
target.mkdir(mode=0o755)
manifest = helper.extract_checked(archive, target, sha)
base.mkdir(mode=0o755)
(base / 'current').symlink_to(target)
(base / 'previous-candidate').symlink_to(previous)
text = (stage / 'vidfetch-web.service').read_text()
assert text.count('/opt/vidfetch-web/current') == 2 and 'Environment=PORT=3000' in text
text = text.replace('VidFetch Next.js frontend (loopback)', 'VidFetch multilingual preproduction (loopback, not enabled at boot)')
text = text.replace('/opt/vidfetch-web/current', str(base / 'current'))
text = text.replace('Environment=PORT=3000', 'Environment=PORT=3001')
text = text.replace('StateDirectory=vidfetch-web\n', 'StateDirectory=vidfetch-web-preproduction-20261013\n')
text = text.replace('CacheDirectory=vidfetch-web\n', 'CacheDirectory=vidfetch-web-preproduction-20261013\n')
unit.write_text(text); unit.chmod(0o644)
subprocess.run(['systemd-analyze', 'verify', str(unit)], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'start', unit.name], check=True)
for attempt in range(40):
    try:
        with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=2) as response:
            health = json.load(response)
        if health.get('ok') and health.get('release') == sha:
            break
    except OSError:
        pass
    time.sleep(.2)
else:
    subprocess.run(['systemctl', 'stop', unit.name], check=True)
    raise RuntimeError('New preproduction health failed; original candidate preserved')
assert pids() == before and str(Path('/opt/vidfetch-web/current').resolve(strict=True)) == previous
assert subprocess.run(['systemctl', 'is-enabled', '--quiet', unit.name]).returncode != 0
result = {'release': sha, 'archiveSha256': checksum, 'manifestFiles': len(manifest['files']), 'port':3001,
          'unit':unit.name,'health':health, 'originalCandidatePreserved': previous, 'protectedPidsBefore':before,
          'protectedPidsAfter':pids(), 'enabledAtBoot':False, 'publicExposure':False}
(stage / 'installation.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
