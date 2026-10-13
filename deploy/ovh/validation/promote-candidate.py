#!/usr/bin/python3
# Local validation only: switch the candidate frontend, never production engines.
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request

stage = Path(sys.argv[1]).resolve(strict=True); sha, checksum = sys.argv[2:]
assert os.geteuid() == 0 and stage.parent == Path('/home/debian') and stage.name.startswith('vidfetch-full-20261012-')
folder = stage / 'final-helpers'
spec = importlib.util.spec_from_file_location('promotion', folder / 'vidfetch-promote.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
archive = stage / ('release-' + sha + '.tgz'); assert helper.digest(archive) == checksum
base = Path('/opt/vidfetch-web'); target = base / 'releases' / sha; assert not target.exists(); target.mkdir(mode=0o755)
helper.extract_checked(archive, target, sha)
def pid(unit): return subprocess.check_output(['systemctl', 'show', unit, '-p', 'MainPID', '--value'], text=True).strip()
before = {u: pid(u) for u in ['vidfetch.service', 'vidfetch-gateway.service', 'ssh.service']}
def restart(units):
 assert units == ['vidfetch-web-candidate.service']
 subprocess.run(['systemctl', 'reset-failed', *units], check=True)
 subprocess.run(['systemctl', 'restart', *units], check=True)
def health(expected):
 for i in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=2) as r: value = json.load(r)
   if value['ok'] and value['release'] == expected: return
  except OSError: pass
  time.sleep(.2)
 raise ValueError('Candidate health failed')
previous = helper.promote(base, target, sha, ['vidfetch-web-candidate.service'], restart, health)
backup = Path('/etc/vidfetch/full-migration-helper-backup-20261012'); assert not backup.exists(); backup.mkdir(mode=0o700)
for name in ['vidfetch-promote', 'vidfetch-ci-dispatch']:
 current = Path('/usr/local/libexec') / name
 assert current.stat().st_uid == 0
 shutil.copy2(current, backup / name)
 shutil.copyfile(folder / (name + '.py'), current); os.chmod(current, 0o755)
after = {u: pid(u) for u in before}; assert before == after
assert not Path('/etc/vidfetch/full-migration-ready').exists()
output = {'release': sha, 'previousRetained': previous.name, 'before': before, 'after': after, 'publicActivation': False, 'helperBackups': str(backup)}
(stage / 'candidate-final.json').write_text(json.dumps(output, indent=2)); print(json.dumps(output))
