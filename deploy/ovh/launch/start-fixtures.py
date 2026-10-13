#!/usr/bin/python3
"""New, temporary, loopback-only fixture services. Existing services untouched."""
import base64
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys

assert os.geteuid() == 0 and len(sys.argv) == 2
stage = Path(sys.argv[1]).resolve(strict=True)
assert stage.parent == Path('/home/debian') and re.fullmatch('vidfetch-launch-20261013-[A-Za-z0-9]+', stage.name)
base = Path('/opt/vidfetch-launch-fixture-20261013')
state = Path('/var/lib/vidfetch-launch-fixture-20261013')
for path in [base, state]:
    assert not path.exists(), f'Existing fixture preserved: {path}'
for port in [18888, 18889, 18890, 3443]:
    with socket.socket() as test:
        test.bind(('127.0.0.1', port))
before = {name: subprocess.check_output(['systemctl','show',name,'-pMainPID','--value'],text=True).strip() for name in ['ssh.service','vidfetch.service','vidfetch-gateway.service','vidfetch-web-candidate.service']}
base.mkdir(mode=0o755); state.mkdir(mode=0o700)
gateway = pwd.getpwnam('vidfetch-gateway')
os.chown(state, gateway.pw_uid, gateway.pw_gid)
for role in ['worker', 'gateway']:
    shutil.copyfile(stage / ('fixture-' + role + '.cjs'), base / (role + '.cjs'))
    (base / (role + '.cjs')).chmod(0o644)
secret = base / 'auth.env'
secret.write_text('VIDFETCH_VALIDATION_KEY=' + base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=') + '\nVIDFETCH_FIXTURE_STATE=' + str(state) + '\n')
secret.chmod(0o640); os.chown(secret, 0, gateway.pw_gid)
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(base/'tls.key'),'-out',str(base/'tls.crt'),'-days','2','-subj','/CN=vidfetch.app','-addext','subjectAltName=DNS:vidfetch.app,DNS:www.vidfetch.app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
(base/'tls.key').chmod(0o640); os.chown(base/'tls.key',0,gateway.pw_gid)
text = (stage/'Caddyfile.downloads-approved.example').read_text()
text = text.replace('admin 127.0.0.1:2019','admin off\n    auto_https disable_redirects\n    skip_install_trust')
text = text.replace('127.0.0.1:3000','127.0.0.1:3001').replace('127.0.0.1:8789','127.0.0.1:18889')
text = text.replace('header_up Host vidfetch.app','header_up Host vidfetch.app:33443')
text = text.replace('\nvidfetch.app {\n    import http01', '\nhttps://vidfetch.app:3443 {\n    bind 127.0.0.1\n    tls ' + str(base/'tls.crt') + ' ' + str(base/'tls.key'))
text = text.replace('\nwww.vidfetch.app {\n    import http01', '\nhttps://www.vidfetch.app:3443 {\n    bind 127.0.0.1\n    tls ' + str(base/'tls.crt') + ' ' + str(base/'tls.key'))
# Only the test challenge issuer is substituted. It uses the actual signing and
# admission factories with a separate key/ledger; the public frontend stays off.
old = '''        reverse_proxy 127.0.0.1:3001 {
            header_up Host vidfetch.app:33443'''
assert text.count(old) == 1
text = text.replace(old, '''        reverse_proxy 127.0.0.1:18890 {
            header_up Host vidfetch.app:33443''')
text = text.replace('    @private path', '''    @fixture_ip path /__fixture/ip
    handle @fixture_ip {
        respond "{client_ip}" 200
    }
    @private path''', 1)
config = base/'Caddyfile'; config.write_text(text)
caddy='/opt/vidfetch/tools/caddy-2.11.7/caddy'
subprocess.run([caddy,'adapt','--config',str(config),'--adapter','caddyfile'],stdout=subprocess.DEVNULL,check=True)
node='/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node'
props=['--property=NoNewPrivileges=true','--property=CapabilityBoundingSet=','--property=ProtectSystem=strict','--property=ProtectHome=true','--property=PrivateTmp=true','--property=KillMode=control-group','--property=TasksMax=96']
started=[]
try:
    subprocess.run(['systemd-run','--unit=vidfetch-launch-fixture-worker','--uid=vidfetch-worker','--working-directory=/var/lib/vidfetch-worker','--property=EnvironmentFile=/etc/vidfetch/worker.env','--property=MemoryMax=512M','--property=CPUQuota=100%','--property=BindReadOnlyPaths=/etc/vidfetch/resolv.conf:/etc/resolv.conf',*props,node,'--max-old-space-size=192',str(base/'worker.cjs')],check=True);started.append('vidfetch-launch-fixture-worker.service')
    subprocess.run(['systemd-run','--unit=vidfetch-launch-fixture-gateway','--uid=vidfetch-gateway','--working-directory='+str(state),'--property=EnvironmentFile='+str(secret),'--property=ReadWritePaths='+str(state),'--property=MemoryMax=192M','--property=CPUQuota=50%',*props,node,'--max-old-space-size=96',str(base/'gateway.cjs')],check=True);started.append('vidfetch-launch-fixture-gateway.service')
    subprocess.run(['systemd-run','--unit=vidfetch-launch-fixture-proxy','--uid=vidfetch-gateway','--property=MemoryMax=128M','--property=CPUQuota=50%','--setenv=XDG_CONFIG_HOME='+str(state),'--setenv=XDG_DATA_HOME='+str(state),'--property=ReadWritePaths='+str(state),*props,caddy,'run','--config',str(config),'--adapter','caddyfile'],check=True);started.append('vidfetch-launch-fixture-proxy.service')
    assert before == {name:subprocess.check_output(['systemctl','show',name,'-pMainPID','--value'],text=True).strip() for name in before}
except Exception:
    if started:subprocess.run(['systemctl','stop',*reversed(started)],check=True)
    raise
print(json.dumps({'units':started,'ports':[18888,18889,18890,3443],'challengeSimulated':True,'certificatePubliclyIssued':False,'protectedPids':before,'existingServicesChanged':False}))
