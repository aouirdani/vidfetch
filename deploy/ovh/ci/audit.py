#!/usr/bin/python3
"""Read-only final evidence; hashes and status only, never secret contents."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess

assert os.geteuid() == 0
backup = Path('/var/backups/vidfetch-cicd-20261013-z0yl3sf8')
before = json.loads((backup / 'before.json').read_text())
def cmd(args):
    return subprocess.run(args, text=True, capture_output=True, timeout=15)
units = {}
for name in before['pids']:
    fields = cmd(['systemctl', 'show', name, '-pMainPID', '-pActiveState', '-pUnitFileState', '-pMemoryCurrent', '-pMemoryPeak', '-pCPUUsageNSec']).stdout
    units[name] = dict(line.split('=', 1) for line in fields.splitlines())
preserved = {
    'allPids': all(units[name]['MainPID'] == pid for name, pid in before['pids'].items()),
    'allOriginalFileHashesExceptApprovedCaddyDependency': all(hashlib.sha256(Path(name).read_bytes()).hexdigest() == value for name, value in before['files'].items() if name != '/etc/systemd/system/vidfetch-caddy.service'),
    'caddyUnitOnlyApprovedDependencyChanged': Path('/etc/systemd/system/vidfetch-caddy.service').read_text() == (backup / 'vidfetch-caddy.service').read_text().replace('Requires=vidfetch-web-preproduction-20261013.service vidfetch-https-test-ingress.service', 'Requires=vidfetch-https-test-ingress.service'),
    'publicRelease': Path('/opt/vidfetch-web-preproduction-20261013/current').resolve().name == '689c592141287a1ca1e45569a89e5d76f18133ed',
}
assert all(preserved.values())
rights = {}
for path in ['/opt/vidfetch-web-preproduction-20261013', '/etc/vidfetch', '/etc/vidfetch/web.env', '/etc/systemd/system', '/usr/local/libexec/vidfetch-ci', '/var/lib/vidfetch-deploy/.ssh/authorized_keys', '/var/lib/vidfetch-deploy/ci-incoming']:
    rights[path] = cmd(['sudo', '-n', '-u', 'vidfetch-deploy', 'test', '-w', path]).returncode == 0
assert rights['/var/lib/vidfetch-deploy/ci-incoming'] is True
assert sum(rights.values()) == 1
denied = cmd(['sudo', '-n', '-u', 'vidfetch-deploy', 'sudo', '-n', '/usr/bin/id']).returncode != 0
assert denied
requirements = cmd(['systemctl', 'show', 'vidfetch-caddy', '-pRequires', '-pBindsTo', '-pWants']).stdout
requires = next(line for line in requirements.splitlines() if line.startswith('Requires='))
assert 'vidfetch-web-preproduction-20261013' not in requires
assert 'vidfetch-https-test-ingress.service' in requires
helper = runpy.run_path('/usr/local/libexec/vidfetch-ci/promote.py')
helper['guards']()
helper['health']('689c592141287a1ca1e45569a89e5d76f18133ed')
helper['origin_health']()
assert helper['gate_open']() is False
result = {'timestamp': datetime.now(timezone.utc).isoformat(), 'preserved': preserved, 'units': units,
          'writableByCI': rights, 'arbitrarySudoDenied': denied, 'caddyDependencies': requirements,
          'gateClosed': True, 'originStrictTLSAuthNoindexMediaClosed': True,
          'backup': str(backup), 'resources': cmd(['free', '-m']).stdout,
          'disk': cmd(['df', '-h', '/']).stdout,
          'ports': cmd(['ss', '-H', '-lntp']).stdout,
          'fixtureInactive': cmd(['systemctl', 'is-active', '--quiet', 'vidfetch-ci-validation-20261013']).returncode != 0,
          'engineChildrenAbsent': cmd(['pgrep', '-x', 'yt-dlp|ffmpeg|ffprobe']).returncode == 1,
          'helpers': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('/usr/local/libexec/vidfetch-ci').glob('*.py')}}
assert result['fixtureInactive'] and result['engineChildrenAbsent']
print(json.dumps(result, indent=2))
