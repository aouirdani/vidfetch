#!/usr/bin/python3
"""Administrator-only recovery. Not included in the CI account's sudo permissions."""
import fcntl
import json
import os
from pathlib import Path
import runpy
import sys

if os.geteuid() != 0 or os.environ.get('SUDO_USER') == 'vidfetch-deploy':
    sys.exit('Administrator access required')
helper = runpy.run_path('/usr/local/libexec/vidfetch-ci/promote.py')
store, base = helper['STORE'], helper['BASE']
with (store / 'lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    pending = store / 'pending.json'
    record = pending if pending.exists() else store / 'previous.json'
    helper['trusted'](record)
    data = json.loads(record.read_text())
    target = Path(data['previous'] if pending.exists() else data['path']).resolve(strict=True)
    if target.parent not in [store / 'releases', Path('/opt/vidfetch-web/releases')]:
        sys.exit('Unexpected recovery release path')
    manifest = target / 'manifest.json'
    helper['trusted'](manifest)
    helper['guards']()
    helper['core']['pointer'](base, target)
    helper['restart']()
    helper['wait_health'](helper['release_id'](target))
    helper['origin_health']()
    if pending.exists():
        pending.rename(store / ('recovered-' + str(os.stat(pending).st_mtime_ns) + '.json'))
    print('Frontend rollback validated; backend, gateway and previous releases retained')
