#!/usr/bin/python3
"""Install an isolated, loopback-only frontend. Never rewires existing engines."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys

if os.geteuid() != 0 or len(sys.argv) != 4:
    sys.exit('Expect root, staging directory, release SHA and archive SHA256')
stage = Path(sys.argv[1]).resolve(strict=True)
sha, checksum = sys.argv[2:]
if stage.parent != Path('/home/debian') or not stage.name.startswith('vidfetch-full-20261012-'):
    sys.exit('Unexpected staging directory')
for path in ['/opt/vidfetch-web', '/etc/vidfetch/web.env', '/etc/systemd/system/vidfetch-web-candidate.service', '/usr/local/libexec/vidfetch-promote', '/usr/local/libexec/vidfetch-ci-dispatch', '/etc/sudoers.d/vidfetch-ci']:
    if Path(path).exists():
        sys.exit('Existing installation preserved: ' + path)
for account in ['vidfetch-web', 'vidfetch-deploy']:
    try:
        pwd.getpwnam(account)
        sys.exit('Existing account preserved: ' + account)
    except KeyError:
        pass
archive = stage / 'release.tgz'
if hashlib.file_digest(open(archive, 'rb'), 'sha256').hexdigest() != checksum:
    sys.exit('Transferred release checksum failed')
spec = importlib.util.spec_from_file_location('promote', stage / 'vidfetch-promote.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
base = Path('/opt/vidfetch-web'); base.mkdir(mode=0o755)
(base / 'releases').mkdir(mode=0o755)
target = base / 'releases' / sha; target.mkdir(mode=0o755)
manifest = helper.extract_checked(archive, target, sha)
(base / 'current').symlink_to(target)
# Caddy remains an unused tool until a separate loopback-only test is requested.
tool = Path('/opt/vidfetch/tools/caddy-2.11.7')
if tool.exists():
    sys.exit('Existing Caddy tool preserved')
tool.mkdir(mode=0o755)
shutil.copyfile(stage / 'caddy', tool / 'caddy'); os.chmod(tool / 'caddy', 0o755)
for account, shell in [('vidfetch-web', '/usr/sbin/nologin'), ('vidfetch-deploy', '/bin/sh')]:
    subprocess.run(['useradd', '--system', '--user-group', '--home-dir', '/var/lib/' + account, '--shell', shell, account], check=True)
home = Path('/var/lib/vidfetch-deploy'); home.mkdir(mode=0o755)
(home / '.ssh').mkdir(mode=0o755)
(home / '.ssh/authorized_keys').touch(mode=0o644) # No CI key installed or generated automatically.
incoming = home / 'incoming'; incoming.mkdir(mode=0o700)
account = pwd.getpwnam('vidfetch-deploy'); os.chown(incoming, account.pw_uid, account.pw_gid)
Path('/etc/vidfetch/web.env').write_text('VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\nNEXT_PUBLIC_SITE_URL=https://vidfetch.app\n')
os.chmod('/etc/vidfetch/web.env', 0o600)
unit = Path('/etc/systemd/system/vidfetch-web-candidate.service')
unit.write_text((stage / 'vidfetch-web.service').read_text().replace('VidFetch Next.js frontend', 'VidFetch validation frontend (not publicly activated)'))
Path("/usr/local/libexec").mkdir(mode=0o755, exist_ok=True)
for source, name in [('vidfetch-promote.py', 'vidfetch-promote'), ('vidfetch-ci-dispatch.py', 'vidfetch-ci-dispatch')]:
    shutil.copyfile(stage / source, '/usr/local/libexec/' + name); os.chmod('/usr/local/libexec/' + name, 0o755)
subprocess.run(['visudo', '-cf', str(stage / 'vidfetch-ci.sudoers')], check=True)
shutil.copyfile(stage / 'vidfetch-ci.sudoers', '/etc/sudoers.d/vidfetch-ci'); os.chmod('/etc/sudoers.d/vidfetch-ci', 0o440)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'start', 'vidfetch-web-candidate.service'], check=True)
print(json.dumps({'candidateRelease': sha, 'files': len(manifest['files']), 'publicActivation': False, 'ciKeyInstalled': False, 'backendServicesChanged': False}))
