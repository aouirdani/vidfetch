#!/usr/bin/python3
"""Real local frontend restart and rollback; production engines remain untouched."""
import importlib.util
from importlib.machinery import SourceFileLoader
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

unit = 'vidfetch-web-candidate.service'
base = Path('/opt/vidfetch-web')
loader = SourceFileLoader('promote', '/usr/local/libexec/vidfetch-promote')
spec = importlib.util.spec_from_loader('promote', loader)
module = importlib.util.module_from_spec(spec); loader.exec_module(module)
checks = []
def pid(service): return int(subprocess.check_output(['systemctl','show',service,'-p','MainPID','--value'],text=True))
before = {u:pid(u) for u in ['vidfetch','vidfetch-gateway','ssh']}
previous = (base / 'current').resolve(strict=True)
sha = json.loads((previous / 'manifest.json').read_text())['release']
def ready(expected, attempts=20):
 for attempt in range(attempts):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3000/api/health',timeout=2) as r: health=json.load(r)
   if health['ok'] and health['release']==expected: return
  except OSError: pass
  time.sleep(.2)
 raise ValueError('Candidate health failed')
def restart(units):
 assert units==[unit]
 subprocess.run(['systemctl','reset-failed',unit],check=True)
 subprocess.run(['systemctl','restart',unit],check=True)
subprocess.run(['systemctl','stop',unit],check=True)
assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode != 0
subprocess.run(['systemctl','start',unit],check=True); ready(sha);checks.append('stop/start and readiness')
oldpid=pid(unit); restart([unit]);ready(sha);assert pid(unit)!=oldpid;checks.append('targeted restart and readiness')
oldpid=pid(unit);subprocess.run(['systemctl','kill','--kill-whom=main','--signal=SIGKILL',unit],check=True)
start=time.monotonic()
for attempt in range(50):
 time.sleep(.2)
 if pid(unit) not in [0,oldpid]:
  ready(sha);break
else:raise ValueError('Automatic restart failed')
checks.append({'automaticCrashRestartSeconds':round(time.monotonic()-start,2)})
bad=base/'releases'/'validation-unhealthy';assert not bad.exists();bad.mkdir();(bad/'app').mkdir();(bad/'manifest.json').write_text(json.dumps({'release':'0'*40}))
try:
 module.promote(base,bad,'0'*40,[unit],restart,lambda expected:ready(expected,5))
 raise AssertionError('Unhealthy release unexpectedly accepted')
except ValueError:
 assert (base/'current').resolve()==previous;ready(sha);checks.append('real failed-start rollback restores previous release and readiness')
after={u:pid(u) for u in before};assert before==after
checks.append('installed backend, gateway and SSH PIDs unchanged')
output={'checks':checks,'before':before,'after':after,'release':sha,'candidateEnabled':subprocess.run(['systemctl','is-enabled','--quiet',unit]).returncode==0}
Path(sys.argv[1]).write_text(json.dumps(output,indent=2));print(json.dumps(output))
