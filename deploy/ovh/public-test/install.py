#!/usr/bin/python3
"""Install an authorized, isolated HTTPS test configuration without starting it.

Credentials arrive on stdin from a private local file, never command arguments.
Only a password hash is retained on the VPS; all output is non-secret metadata.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import urllib.request

assert os.geteuid() == 0 and len(sys.argv) == 2
stage = Path(sys.argv[1]).resolve(strict=True)
assert stage.parent == Path('/home/debian') and re.fullmatch('vidfetch-public-https-20261013-[A-Za-z0-9]+', stage.name)
base = Path('/etc/vidfetch/public-https-test')
backup = Path('/var/backups') / stage.name
targets = [base, backup, Path('/usr/local/libexec/vidfetch-https-test-firewall'),
    Path('/etc/systemd/system/vidfetch-caddy.service'), Path('/etc/systemd/system/vidfetch-https-test-ingress.service')]
for path in targets:
    assert not path.exists() and not path.is_symlink(), 'Existing configuration preserved; inspect before retry'
for port in [80, 443]:
    with socket.socket() as test:
        test.bind(('0.0.0.0', port))
with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=5) as response:
    health = json.load(response)
assert health.get('ok') and health.get('release') == '689c592141287a1ca1e45569a89e5d76f18133ed'
assert health['downloads']['available'] is False
protected = ['ssh.service', 'vidfetch.service', 'vidfetch-gateway.service', 'vidfetch-web-candidate.service', 'vidfetch-web-preproduction-20261013.service']
def run(args):
    return subprocess.check_output(args, text=True).strip()
def units():
    return {name: dict(line.split('=', 1) for line in run(['systemctl', 'show', name, '-pMainPID', '-pUnitFileState', '-pActiveState']).splitlines()) for name in protected}
before = units()
backup.mkdir(mode=0o700)
shutil.copytree('/etc/vidfetch', backup / 'etc-vidfetch', symlinks=True)
(backup / 'systemd').mkdir(mode=0o700)
for name in protected:
    path = Path('/etc/systemd/system') / name
    if path.exists(): shutil.copy2(path, backup / 'systemd' / name)
files = [*Path('/etc/vidfetch').rglob('*'), *[Path('/etc/systemd/system') / name for name in protected]]
hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files if path.is_file() and not path.is_symlink()}
initial = {'timestamp': datetime.now(timezone.utc).isoformat(), 'protectedUnits': before, 'protectedFileHashes': hashes,
    'frontendCurrent': str(Path('/opt/vidfetch-web/current').resolve(strict=True)),
    'nftables': json.loads(run(['nft', '-j', 'list', 'ruleset'])), 'ports': run(['ss', '-H', '-lntu']),
    'createdTargets': [str(p) for p in targets if p != backup]}
(backup / 'before.json').write_text(json.dumps(initial, indent=2) + '\n')
(backup / 'nftables-before.nft').write_text(run(['nft', 'list', 'ruleset']) + '\n')
try:
    account = pwd.getpwnam('vidfetch-proxy')
    raise RuntimeError('Proxy account already exists; inspect instead of repurposing it')
except KeyError:
    subprocess.run(['useradd', '--system', '--user-group', '--home-dir', '/var/lib/vidfetch-proxy', '--no-create-home', '--shell', '/usr/sbin/nologin', 'vidfetch-proxy'], check=True)
account = pwd.getpwnam('vidfetch-proxy')
base.mkdir(mode=0o750); os.chown(base, 0, account.pw_gid)
state = Path('/var/lib/vidfetch-proxy'); assert not state.exists()
state.mkdir(mode=0o700); os.chown(state, account.pw_uid, account.pw_gid)
credentials = json.load(sys.stdin)
assert re.fullmatch('[a-z0-9-]{12,40}', credentials.get('username', ''))
assert re.fullmatch('[A-Za-z0-9_-]{40,80}', credentials.get('password', ''))
caddy = '/opt/vidfetch/tools/caddy-2.11.7/caddy'
hashed = subprocess.run([caddy, 'hash-password', '--algorithm', 'bcrypt', '--bcrypt-cost', '12'],
    input=credentials['password'] + '\n', text=True, capture_output=True, check=True).stdout.strip()
assert re.fullmatch(r'\$2[aby]\$12\$[./A-Za-z0-9]{53}', hashed)
auth = base / 'auth.caddy'
with auth.open('x') as output:
    output.write('basic_auth bcrypt "VidFetch private test" {\n    ' + credentials['username'] + ' ' + hashed + '\n}\n')
auth.chmod(0o640); os.chown(auth, 0, account.pw_gid)
del credentials, hashed
for name in ['Caddyfile', 'Caddyfile.bootstrap', 'ingress.nft']:
    shutil.copyfile(stage / name, base / name); (base / name).chmod(0o644)
(base / 'current').symlink_to('Caddyfile.bootstrap')
for name in ['vidfetch-caddy.service', 'vidfetch-https-test-ingress.service']:
    shutil.copyfile(stage / name, Path('/etc/systemd/system') / name)
shutil.copyfile(stage / 'firewall.py', '/usr/local/libexec/vidfetch-https-test-firewall')
Path('/usr/local/libexec/vidfetch-https-test-firewall').chmod(0o755)
for name in ['Caddyfile', 'Caddyfile.bootstrap']:
    validation = subprocess.run(['runuser', '-u', 'vidfetch-proxy', '--', 'env', 'XDG_CONFIG_HOME=' + str(state), 'XDG_DATA_HOME=' + str(state),
        caddy, 'validate', '--config', str(base / name), '--adapter', 'caddyfile'], text=True, capture_output=True)
    (backup / (name + '.validation.log')).write_text(validation.stdout + validation.stderr)
    assert validation.returncode == 0, 'Caddy validation failed; diagnostic retained in private backup'
subprocess.run(['nft', '--check', '--file', str(base / 'ingress.nft')], check=True)
subprocess.run(['systemd-analyze', 'verify', '/etc/systemd/system/vidfetch-caddy.service', '/etc/systemd/system/vidfetch-https-test-ingress.service'], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
assert units() == before, 'Existing units changed'
result = {'backup': str(backup), 'configDirectory': str(base), 'protectedUnitsUnchanged': True, 'installedNotStarted': True,
    'plaintextCredentialRetainedOnVPS': False, 'passwordHash': 'bcrypt cost 12', 'health': health}
print(json.dumps(result, indent=2))
