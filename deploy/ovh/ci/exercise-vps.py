#!/usr/bin/python3
"""Explicit administrator test of the installed helper on an isolated transient unit.

No public pointer, existing unit or production gate is changed. Retains fixtures.
"""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

assert os.geteuid() == 0
base = Path(tempfile.mkdtemp(prefix='vidfetch-ci-validation-20261013-', dir='/opt'))
base.chmod(0o755)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 3012))
spec = importlib.util.spec_from_file_location('ci_promote', '/usr/local/libexec/vidfetch-ci/promote.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
before = p.protected_pids()
public_pointer = str((p.BASE / 'current').resolve())
state = base / 'state'
state.mkdir()
p.BASE = base
p.STORE = state
p.UNIT = 'vidfetch-ci-validation-20261013.service'
p.PORT = 3012
source = """const http = require('http');
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(__dirname + '/manifest.json'));
http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ok: !manifest.unhealthy, release: manifest.release, downloads: {available: false}}));
  } else if (req.url === '/api/download') { res.statusCode = 503; res.end('closed'); }
  else { res.end('isolated CI fixture'); }
}).listen(3012, '127.0.0.1');
"""
for letter in ['b', 'c', 'd']:
    folder = base / (letter * 40)
    folder.mkdir()
    (folder / 'manifest.json').write_text(json.dumps({'release': letter * 40, 'unhealthy': letter == 'd'}))
    (folder / 'server.js').write_text(source)
(base / 'current').symlink_to(base / ('b' * 40))
persistent = state / 'persistent.txt'
persistent.write_text('preserved')
started = time.monotonic()
report = {'fixturePort': p.PORT, 'evidence': str(base), 'tests': [], 'publicDeploymentPerformed': False}
try:
    subprocess.run(['systemd-run', '--unit=' + p.UNIT, '--property=User=vidfetch-web',
                    '--property=Group=vidfetch-web', '--property=MemoryMax=128M',
                    '--property=CPUQuota=25%', '--property=TasksMax=32',
                    '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict',
                    '--property=PrivateTmp=yes', '--property=KillMode=control-group',
                    '/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node',
                    '--max-old-space-size=32', str(base / 'current/server.js')], check=True)
    p.wait_health('b' * 40)
    p.switch(base / ('c' * 40), 'c' * 40)
    assert (base / 'current').resolve().name == 'c' * 40
    report['tests'].append('real systemd restart and healthy atomic promotion')
    try:
        p.switch(base / ('d' * 40), 'd' * 40)
        raise AssertionError('Unhealthy release was accepted')
    except ValueError as error:
        assert str(error) == 'Frontend readiness timed out'
    assert (base / 'current').resolve().name == 'c' * 40
    p.health('c' * 40)
    report['tests'].append('failed HTTP readiness restored previous release and service')
    def interrupted(sha):
        if sha == 'b' * 40:
            raise RuntimeError('simulated SSH interruption after pointer switch')
        p.wait_health(sha)
    try:
        p.switch(base / ('b' * 40), 'b' * 40, check=interrupted)
        raise AssertionError('Interruption was ignored')
    except RuntimeError:
        pass
    p.health('c' * 40)
    assert not (state / 'pending.json').exists()
    report['tests'].append('interrupted transaction rolled back and checked')
    assert persistent.read_text() == 'preserved'
    assert len(list(base.glob('[bcd]' * 40))) == 3
    report['tests'].append('persistent file and all three releases retained')
    report['resources'] = p.command(['systemctl', 'show', p.UNIT, '-pMemoryCurrent', '-pMemoryPeak', '-pCPUUsageNSec'])
finally:
    subprocess.run(['systemctl', 'stop', p.UNIT], check=True)
report['seconds'] = round(time.monotonic() - started, 3)
assert p.protected_pids() == before
assert str(Path('/opt/vidfetch-web-preproduction-20261013/current').resolve()) == public_pointer
assert not Path('/etc/vidfetch/ci-web-test-ready').exists()
with socket.socket() as sock:
    assert sock.connect_ex(('127.0.0.1', 3012)) != 0
report.update({'protectedPidsUnchanged': True, 'publicPointerUnchanged': True,
               'gateClosed': True, 'fixtureStopped': True, 'persistentFilesPreserved': True})
(base / 'result.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
