#!/usr/bin/python3
"""Lifecycle and rollback tests on the new preproduction service only."""
import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

assert os.geteuid()==0 and len(sys.argv)==2
stage=Path(sys.argv[1]).resolve(strict=True)
assert stage.parent==Path('/home/debian') and stage.name.startswith('vidfetch-launch-20261013-')
base=Path('/opt/vidfetch-web-preproduction-20261013');unit='vidfetch-web-preproduction-20261013.service'
sha='689c592141287a1ca1e45569a89e5d76f18133ed';target=(base/'current').resolve(strict=True)
original=(Path('/opt/vidfetch-web/current')).resolve(strict=True)
protected=['ssh.service','vidfetch.service','vidfetch-gateway.service','vidfetch-web-candidate.service']
def pids():return {name:subprocess.check_output(['systemctl','show',name,'-pMainPID','--value'],text=True).strip() for name in protected}
before=pids();checks=[]
def ready(expected, attempts=40):
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health',timeout=2) as response:health=json.load(response)
            if health.get('ok') and health.get('release')==expected:return
        except OSError:pass
        time.sleep(.2)
    raise ValueError('Preproduction health failed')
def restart(units):
    assert units==[unit]
    subprocess.run(['systemctl','reset-failed',unit],check=True);subprocess.run(['systemctl','restart',unit],check=True)
subprocess.run(['systemctl','stop',unit],check=True)
assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
subprocess.run(['systemctl','start',unit],check=True);ready(sha);checks.append('stop/start on preproduction only')
restart([unit]);ready(sha);checks.append('targeted restart')
oldpid=subprocess.check_output(['systemctl','show',unit,'-pMainPID','--value'],text=True).strip()
start=time.monotonic();subprocess.run(['systemctl','kill','--kill-whom=main','--signal=SIGKILL',unit],check=True)
for attempt in range(70):
    time.sleep(.2);pid=subprocess.check_output(['systemctl','show',unit,'-pMainPID','--value'],text=True).strip()
    if pid not in ['0',oldpid]:ready(sha);break
else:raise RuntimeError('Preproduction crash restart failed')
recovery=round(time.monotonic()-start,3);checks.append('controlled crash automatically restarted')
loader=SourceFileLoader('safe_promote','/usr/local/libexec/vidfetch-promote');spec=importlib.util.spec_from_loader('safe_promote',loader)
helper=importlib.util.module_from_spec(spec);loader.exec_module(helper)
unhealthy=base/'rollback-fixture-unhealthy';assert not unhealthy.exists()
unhealthy.mkdir();(unhealthy/'app').mkdir();(unhealthy/'manifest.json').write_text(json.dumps({'release':'0'*40}))
try:
    helper.promote(base,unhealthy,'0'*40,[unit],restart,lambda expected:ready(expected,5))
    raise AssertionError('Unhealthy target unexpectedly passed')
except ValueError:
    assert (base/'current').resolve()==target;ready(sha);checks.append('failed-start rollback restored multilingual release')
oldsha=json.loads((original/'manifest.json').read_text())['release']
helper.promote(base,original,oldsha,[unit],restart,ready)
try:ready(oldsha);checks.append('previous English release can still start in preproduction')
finally:helper.promote(base,target,sha,[unit],restart,ready)
assert before==pids() and (Path('/opt/vidfetch-web/current')).resolve()==original
assert subprocess.run(['systemctl','is-enabled','--quiet',unit]).returncode!=0
checks.append('original frontend, backend, gateway, SSH and production pointer preserved')
result={'checks':checks,'crashRecoverySeconds':recovery,'restoredRelease':sha,'previousReleaseTested':oldsha,'protectedPidsBefore':before,'protectedPidsAfter':pids(),'enabledAtBoot':False}
(stage/'lifecycle.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
