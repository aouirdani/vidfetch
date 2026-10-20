#!/usr/bin/python3
"""Administrator-only recovery. Not included in the CI account's sudo permissions.

Restores the frontend release named by pending.json (an interrupted promotion) or previous.json. It never changes
the engine or the gateway, and downloads must only be open while the frontend, engine and gateway in service come
from one release. So, unless downloads are confirmed closed, the release to restore must have been built with the
engine and gateway bundles in service:
  ready=0                                  emergency recovery, unchanged: the recorded release, whatever its bundles
  ready=1                                  only a release whose engine and gateway are the ones in service
  ready absent, unreadable or inconsistent the same: what cannot be shown compatible is refused, nothing changed
For an incompatible release: 11-downloads.sh close, run this again, then 08-gateway.sh rollback (11-downloads.sh
open refuses until the three match again).
"""
import fcntl
import json
import os
from pathlib import Path
import re
import runpy
import sys

HELPER = '/usr/local/libexec/vidfetch-ci/promote.py'
WEB_ENV = Path('/etc/vidfetch/web.env')
PROC = Path('/proc')
SYSTEMCTL = '/usr/bin/systemctl'
BUNDLES = {'vidfetch.service': 'backend/vidfetch-ovh.cjs', 'vidfetch-gateway.service': 'backend/vidfetch-gateway.cjs'}


def ready_state(helper):
    """'0' or '1' when every VIDFETCH_CONNECTION_READY line of web.env says so; otherwise why it is not known."""
    try:
        helper['trusted'](WEB_ENV)   # a root-owned regular file, as set-ready.sh requires; only that key is read
        values = {line.split('=', 1)[1] for line in WEB_ENV.read_text().splitlines() if line.startswith('VIDFETCH_CONNECTION_READY=')}
    except (OSError, ValueError):
        return 'unreadable'
    if not values:
        return 'absent'
    return values.pop() if len(values) == 1 and values <= {'0', '1'} else 'inconsistent'


def running_bundle(helper, unit):
    """sha256 of the bundle the unit's main process executes, which must be the one its ExecStart names."""
    configured = re.findall(r'/[^ ;]*\.cjs', helper['command']([SYSTEMCTL, 'show', unit, '-pExecStart', '--value']))
    pid = helper['command']([SYSTEMCTL, 'show', unit, '-pMainPID', '--value'])
    if not configured or not pid.isdigit() or pid == '0':
        raise ValueError(f'{unit} runs no bundle')
    executed = [a.decode() for a in (PROC / pid / 'cmdline').read_bytes().split(b'\0') if a.endswith(b'.cjs')]
    if executed[:1] != configured[:1]:
        raise ValueError(f'{unit} does not run the bundle its unit names (restart pending?)')
    return helper['core']['digest'](Path(configured[0]))


def incompatibility(helper, target):
    """Why TARGET cannot run next to the engine and gateway in service, or None. Anything unreadable is a reason."""
    try:
        files = json.loads((target / 'manifest.json').read_text())['files']
        for unit, name in BUNDLES.items():
            if files.get(name) != running_bundle(helper, unit):
                return f'was built with another {name} than the one {unit} runs'
    except Exception as error:   # malformed manifest, systemctl or /proc unreadable, bundle missing
        return f'cannot be checked against the bundles in service ({type(error).__name__}: {error})'
    return None


def main():
    if os.geteuid() != 0 or os.environ.get('SUDO_USER') == 'vidfetch-deploy':
        sys.exit('Administrator access required')
    helper = runpy.run_path(HELPER)
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
        ready = ready_state(helper)
        why = None if ready == '0' else incompatibility(helper, target)
        if why:
            sys.exit(f'Refused, nothing changed: downloads are not confirmed closed (ready: {ready}) and the release to restore {why}.\n'
                     'Close downloads first (11-downloads.sh close), run this again, then 08-gateway.sh rollback.')
        helper['guards']()
        helper['core']['pointer'](base, target)
        helper['restart']()
        helper['wait_health'](helper['release_id'](target))
        helper['origin_health']()
        if pending.exists():
            pending.rename(store / ('recovered-' + str(os.stat(pending).st_mtime_ns) + '.json'))
        print('Frontend rollback validated; backend, gateway and previous releases retained')


if __name__ == '__main__':
    main()
