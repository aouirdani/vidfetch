#!/usr/bin/python3
"""Exercise the prepared download-disabled proxy over local TLS, then stop it."""
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import sys
import time

assert os.geteuid() == 0 and len(sys.argv) == 2
stage = Path(sys.argv[1]).resolve(strict=True)
assert stage.parent == Path('/home/debian') and stage.name.startswith('vidfetch-launch-20261013-')
base = Path('/opt/vidfetch-launch-fixture-20261013')
config = base / 'Caddyfile.frontend-only-v2'
state = Path('/var/lib/vidfetch-launch-frontendonly-20261013-v2')
unit = 'vidfetch-launch-fixture-frontendonly.service'
assert not config.exists() and not state.exists()
with socket.socket() as test:
    test.bind(('127.0.0.1', 3444))
text = (stage / 'Caddyfile.proxied-v2').read_text()
text = text.replace('admin 127.0.0.1:2019', 'admin off\n    auto_https disable_redirects\n    skip_install_trust')
text = text.replace('127.0.0.1:3000', '127.0.0.1:3001')
for host in ['vidfetch.app', 'www.vidfetch.app']:
    marker = '\n' + host + ' {\n    import http01'
    assert text.count(marker) == 1
    text = text.replace(marker, '\nhttps://' + host + ':3444 {\n    bind 127.0.0.1\n    tls ' + str(base / 'tls.crt') + ' ' + str(base / 'tls.key'))
with config.open('x') as output:
    output.write(text)
state.mkdir(mode=0o700)
account = pwd.getpwnam('vidfetch-gateway')
os.chown(state, account.pw_uid, account.pw_gid)
caddy = '/opt/vidfetch/tools/caddy-2.11.7/caddy'
subprocess.run([caddy, 'adapt', '--config', str(config), '--adapter', 'caddyfile'], stdout=subprocess.DEVNULL, check=True)
checks = []
def request(path, host='vidfetch.app'):
    output = subprocess.check_output(['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '10',
        '--cacert', str(base / 'tls.crt'), '--resolve', host + ':3444:127.0.0.1',
        '--include', 'https://' + host + ':3444' + path], text=True)
    headers, body = output.split('\n\n', 1)
    status = int(headers.splitlines()[0].split()[1])
    fields = dict(line.lower().split(': ', 1) for line in headers.splitlines()[1:] if ': ' in line)
    return status, fields, body
try:
    subprocess.run(['systemd-run', '--unit=' + unit, '--uid=vidfetch-gateway',
        '--property=NoNewPrivileges=true', '--property=CapabilityBoundingSet=',
        '--property=ProtectSystem=strict', '--property=ProtectHome=true', '--property=PrivateTmp=true',
        '--property=KillMode=control-group', '--property=MemoryMax=128M', '--property=CPUQuota=50%',
        '--property=TasksMax=64', '--property=ReadWritePaths=' + str(state),
        '--setenv=XDG_CONFIG_HOME=' + str(state), '--setenv=XDG_DATA_HOME=' + str(state),
        caddy, 'run', '--config', str(config), '--adapter', 'caddyfile'], check=True)
    for attempt in range(30):
        with socket.socket() as test:
            if test.connect_ex(('127.0.0.1', 3444)) == 0:
                break
        time.sleep(.1)
    status, headers, body = request('/ar/')
    assert status == 200 and 'lang="ar"' in body and 'dir="rtl"' in body
    assert 'noindex' in headers['x-robots-tag']
    checks.append('Arabic frontend via local TLS with staging noindex')
    for path in ['/api/fetch-info', '/api/download?ticket=synthetic', '/api/queue', '/auth/transfer', '/download-helper']:
        status, headers, body = request(path)
        assert status == 503 and json.loads(body)['code'] == 'BACKEND_UNAVAILABLE'
        assert headers['cache-control'] == 'no-store'
    checks.append('Five sensitive media paths return 503 BACKEND_UNAVAILABLE, no-store')
    for path in ['/auth/admission', '/auth/deployment', '/internal/test']:
        assert request(path)[0] == 404
    checks.append('Service-only routes return 404')
    status, headers, body = request('/fr/?probe=1', 'www.vidfetch.app')
    assert status == 301 and headers['location'] == 'https://vidfetch.app/fr/?probe=1'
    checks.append('www redirects 301 to canonical origin, preserving path and query')
    status, headers, body = request('/api/health')
    assert status == 200 and json.loads(body)['release'] == '689c592141287a1ca1e45569a89e5d76f18133ed'
    checks.append('Frontend health reaches multilingual release')
finally:
    subprocess.run(['systemctl', 'stop', unit], check=True)
assert subprocess.run(['systemctl', 'is-active', '--quiet', unit]).returncode != 0
print(json.dumps({'checks': checks, 'port': 3444, 'loopbackOnly': True, 'stopped': True, 'publicCertificate': False}, indent=2))
