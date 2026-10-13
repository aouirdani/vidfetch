#!/usr/bin/python3
"""Read-only final comparison; never outputs environment values or log bodies."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

assert os.geteuid() == 0 and len(sys.argv) == 3
source, before_path = map(Path, sys.argv[1:])
captured = io.StringIO()
with contextlib.redirect_stdout(captured):
    namespace = runpy.run_path(str(source))
report = json.loads(captured.getvalue())
before = json.loads(before_path.read_text())
unit, health, command = [namespace[name] for name in ['unit', 'health', 'command']]
new_unit = 'vidfetch-web-preproduction-20261013.service'
report['services'][new_unit] = unit(new_unit)
report['health']['3001'] = health(3001)
report['preproductionCurrent'] = str(Path('/opt/vidfetch-web-preproduction-20261013/current').resolve(strict=True))
fixture_units = ['vidfetch-launch-fixture-' + role + '.service' for role in ['worker', 'gateway', 'proxy', 'frontendonly']]
report['fixtureUnits'] = {name: unit(name) for name in fixture_units}
protected = ['ssh.service', 'vidfetch.service', 'vidfetch-gateway.service', 'vidfetch-web-candidate.service']
report['preservation'] = {
    'protectedPidsEqual': all(report['services'][name]['MainPID'] == before['services'][name]['MainPID'] for name in protected),
    'originalPointerEqual': report['frontendCurrent'] == before['frontendCurrent'],
    'inspectedFilesEqual': report['files'] == before['files'],
    'sshSettingsEqual': report['sshSettings'] == before['sshSettings'],
    'nftablesEqual': json.loads(report['nftables']['output']) == json.loads(before['nftables']['output']),
}
report['engineChildren'] = []
for entry in Path('/proc').iterdir():
    if entry.name.isdecimal():
        try:
            name = (entry / 'comm').read_text().strip()
            if name in ['yt-dlp', 'ffmpeg', 'ffprobe']:
                report['engineChildren'].append({'pid': int(entry.name), 'name': name})
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            pass
report['journalSummary'] = {}
for name in protected + [new_unit]:
    result = command(['journalctl', '-u', name, '--since', '2026-10-13 00:00:00 UTC', '-n', '2000', '--output=json', '--no-pager'])
    rows = [json.loads(line) for line in result['output'].splitlines() if line.startswith('{')]
    report['journalSummary'][name] = {'entries': len(rows), 'priority0to3': sum(int(row.get('PRIORITY', 6)) <= 3 for row in rows)}
assert all(report['preservation'].values()), 'Existing configuration changed; inspect comparison without mutation'
assert report['health']['3001']['json']['release'] == '689c592141287a1ca1e45569a89e5d76f18133ed'
assert report['services'][new_unit]['UnitFileState'] == 'disabled'
assert all(data['ActiveState'] == 'inactive' for data in report['fixtureUnits'].values())
assert report['engineChildren'] == []
ports = [line.split()[3] for line in report['ports']['output'].splitlines()]
assert all(not any(address.endswith(':' + str(port)) for address in ports) for port in [80, 443, 3443, 3444, 18888, 18889, 18890])
assert '127.0.0.1:3001' in ports
report['finalChecksPassed'] = True
print(json.dumps(report, indent=2))
