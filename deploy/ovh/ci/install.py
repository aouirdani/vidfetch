#!/usr/bin/python3
"""Administrator-only initial preparation. Does not open the deployment gate."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

assert os.geteuid() == 0
source = Path(__file__).resolve().parent
destination = Path('/usr/local/libexec/vidfetch-ci')
store = Path('/opt/vidfetch-ci-web')
guard = Path('/etc/vidfetch/ci-web-test-guard.json')
dropin = Path('/etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf')
authorized = Path('/var/lib/vidfetch-deploy/.ssh/authorized_keys')
sudoers = Path('/etc/sudoers.d/vidfetch-ci')
assert not destination.exists() and not store.exists() and not guard.exists() and not dropin.exists()
assert not Path('/etc/vidfetch/ci-web-test-ready').exists()
assert authorized.read_text().strip() == '', 'Existing SSH keys require explicit preservation review'
assert '/usr/local/libexec/vidfetch-promote' in sudoers.read_text()
key = (source / 'ci.pub').read_text().strip().split()
assert key[0] == 'ssh-ed25519' and len(key) == 3
user = pwd.getpwnam('vidfetch-deploy')
assert user.pw_dir == '/var/lib/vidfetch-deploy' and user.pw_uid != 0

backup = Path(tempfile.mkdtemp(prefix='vidfetch-cicd-20261013-', dir='/var/backups'))
shutil.copy2(authorized, backup / 'authorized_keys')
shutil.copy2(sudoers, backup / 'vidfetch-ci.sudoers')
shutil.copy2('/etc/systemd/system/vidfetch-caddy.service', backup / 'vidfetch-caddy.service')
units = ['ssh', 'vidfetch', 'vidfetch-gateway', 'vidfetch-web-candidate', 'vidfetch-web-preproduction-20261013', 'vidfetch-caddy']
def pids():
    return {u: subprocess.check_output(['systemctl', 'show', u, '-pMainPID', '--value'], text=True).strip() for u in units}
before = pids()
old = json.loads(Path('/var/backups/vidfetch-public-https-20261013-uNFJxuZ9/before.json').read_text())
files = list(old['protectedFileHashes']) + ['/etc/systemd/system/vidfetch-caddy.service', '/etc/systemd/system/vidfetch-web-preproduction-20261013.service', '/etc/vidfetch/public-https-test/Caddyfile', '/etc/vidfetch/public-https-test/auth.caddy']
hashes = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files}
(backup / 'before.json').write_text(json.dumps({'pids': before, 'files': hashes}, indent=2))
destination.mkdir(mode=0o755)
for name in ['dispatch.py', 'promote.py', 'release-lib.py', 'rollback.py']:
    shutil.copyfile(source / name, destination / name)
    (destination / name).chmod(0o755 if name != 'release-lib.py' else 0o644)
store.mkdir(mode=0o755)
(store / 'releases').mkdir(mode=0o755)
(store / 'staging').mkdir(mode=0o700)
incoming = Path(user.pw_dir) / 'ci-incoming'
incoming.mkdir(mode=0o700)
os.chown(incoming, user.pw_uid, user.pw_gid)
subprocess.run(['visudo', '-cf', str(source / 'sudoers')], check=True)
shutil.copyfile(source / 'sudoers', sudoers)
sudoers.chmod(0o440)
authorized.write_text('restrict,command="/usr/local/libexec/vidfetch-ci/dispatch.py" ' + ' '.join(key) + '\n')
authorized.chmod(0o644)
dropin.parent.mkdir(mode=0o755, exist_ok=True)
shutil.copyfile(source / 'caddy-frontend-dependency.conf', dropin)
dropin.chmod(0o644)
caddy_unit = Path('/etc/systemd/system/vidfetch-caddy.service')
original_dependency = 'Requires=vidfetch-web-preproduction-20261013.service vidfetch-https-test-ingress.service'
assert original_dependency in caddy_unit.read_text()
caddy_unit.write_text(caddy_unit.read_text().replace(original_dependency, 'Requires=vidfetch-https-test-ingress.service'))
subprocess.run(['systemctl', 'daemon-reload'], check=True)
hashes[str(caddy_unit)] = hashlib.sha256(caddy_unit.read_bytes()).hexdigest()
hashes[str(dropin)] = hashlib.sha256(dropin.read_bytes()).hexdigest()
guard.write_text(json.dumps({'files': hashes}, indent=2))
guard.chmod(0o600)
assert pids() == before, 'A running service PID changed'
print(json.dumps({'backup': str(backup), 'pidsUnchanged': True, 'gateOpen': False,
                  'keyInstalled': True, 'rootShellPermission': False, 'filesGuarded': len(hashes)}))
