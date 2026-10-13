#!/usr/bin/python3
# Fixed loopback test harness. Does not replace the installed worker or gateway.
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

stage = Path(sys.argv[1]).resolve(strict=True)
assert os.geteuid() == 0 and stage.parent == Path('/home/debian') and stage.name.startswith('vidfetch-full-20261012-')
base = Path('/opt/vidfetch-full-validation')
assert not base.exists()
base.mkdir(mode=0o755)
for role in ['worker', 'gateway']:
    shutil.copyfile(stage / ('validation-' + role + '.cjs'), base / (role + '.cjs'))
    os.chmod(base / (role + '.cjs'), 0o644)
state = Path('/var/lib/vidfetch-migration-validation'); assert not state.exists(); state.mkdir(mode=0o700); os.chown(state, 995, 995)
secret = base / 'auth.env'; secret.write_text('VIDFETCH_VALIDATION_KEY=' + base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=') + '\n'); os.chmod(secret, 0o600)
subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(base / 'tls.key'), '-out', str(base / 'tls.crt'), '-days', '2', '-subj', '/CN=vidfetch.app', '-addext', 'subjectAltName=DNS:vidfetch.app,DNS:www.vidfetch.app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
os.chown(base / 'tls.key', 995, 995); os.chmod(base / 'tls.key', 0o600)
text = (stage / 'Caddyfile').read_text()
common = text[text.index('(common) {'):text.index('\nvidfetch.app {')]
common = common.replace('127.0.0.1:8789', '127.0.0.1:18889').replace('header_up Host vidfetch.app','header_up Host vidfetch.app:33443').replace('header_up X-Forwarded-For {remote_host}', 'header_up X-Forwarded-For 203.0.113.101')
common = common.replace('\thandle {\n', '\t@issuer path /api/download-access\n\thandle @issuer {\n\t\treverse_proxy 127.0.0.1:18890\n\t}\n\thandle {\n', 1)
config = '{\n admin off\n auto_https disable_redirects\n skip_install_trust\n}\n' + common + '\nhttps://vidfetch.app:3443 {\n bind 127.0.0.1\n tls /opt/vidfetch-full-validation/tls.crt /opt/vidfetch-full-validation/tls.key\n import common\n}\nhttps://www.vidfetch.app:3443 {\n bind 127.0.0.1\n tls /opt/vidfetch-full-validation/tls.crt /opt/vidfetch-full-validation/tls.key\n redir https://vidfetch.app{uri} 301\n}\n'
(base / 'Caddyfile').write_text(config)
node = '/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node'
common_props = ['--property=NoNewPrivileges=true', '--property=CapabilityBoundingSet=', '--property=ProtectSystem=strict', '--property=ProtectHome=true', '--property=PrivateTmp=true', '--property=KillMode=control-group', '--property=TasksMax=96']
subprocess.run(['systemd-run', '--unit=vidfetch-migration-worker', '--uid=vidfetch-worker', '--working-directory=/var/lib/vidfetch-worker', '--property=EnvironmentFile=/etc/vidfetch/worker.env', '--property=MemoryMax=512M', '--property=CPUQuota=100%', '--property=BindReadOnlyPaths=/etc/vidfetch/resolv.conf:/etc/resolv.conf', *common_props, node, '--max-old-space-size=192', str(base / 'worker.cjs')], check=True)
subprocess.run(['systemd-run', '--unit=vidfetch-migration-gateway', '--uid=vidfetch-gateway', '--working-directory=' + str(state), '--property=EnvironmentFile=' + str(secret), '--property=ReadWritePaths=' + str(state), '--property=MemoryMax=192M', '--property=CPUQuota=50%', *common_props, node, '--max-old-space-size=96', str(base / 'gateway.cjs')], check=True)
subprocess.run(['systemd-run', '--unit=vidfetch-migration-proxy', '--uid=vidfetch-gateway', '--property=MemoryMax=128M', '--property=CPUQuota=50%', '--setenv=XDG_CONFIG_HOME=' + str(state), '--setenv=XDG_DATA_HOME=' + str(state), '--property=ReadWritePaths=' + str(state), *common_props, '/opt/vidfetch/tools/caddy-2.11.7/caddy', 'run', '--config', str(base / 'Caddyfile'), '--adapter', 'caddyfile'], check=True)
print(json.dumps({'scope': 'isolated loopback fixtures, real engines, simulated challenge', 'ports': [18888,18889,18890,3443], 'productionServicesChanged': False}))
