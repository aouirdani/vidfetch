#!/usr/bin/env python3
"""Read-only evidence for this VidFetch unit; omit environments and URL-bearing argv."""
import datetime
import hashlib
import json
import pathlib
import subprocess

def run(args):
    r = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return {'exit': r.returncode, 'stdout': r.stdout.strip()}

names = ['ActiveState', 'SubState', 'UnitFileState', 'MainPID', 'ControlGroup', 'User', 'DynamicUser',
         'Result', 'NRestarts', 'TasksMax', 'TasksCurrent', 'CPUQuotaPerSecUSec', 'CPUWeight', 'Nice',
         'MemoryAccounting', 'MemoryMax', 'MemoryHigh', 'MemorySwapMax', 'NoNewPrivileges', 'PrivateTmp',
         'PrivateDevices', 'ProtectSystem', 'ProtectHome', 'ProtectControlGroups', 'KillMode', 'Restart',
         'RestartUSec', 'LimitCORE', 'LimitNOFILE', 'CapabilityBoundingSet', 'AmbientCapabilities', 'FragmentPath',
         'WorkingDirectory', 'StateDirectory', 'RuntimeDirectory']
args = ['systemctl', 'show', 'vidfetch.service']
for name in names:
    args += ['-p', name]
unit = dict(line.split('=', 1) for line in run(args)['stdout'].splitlines() if '=' in line)
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'unit': unit,
          'bootId': pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
          'kernelCommandLineSha256': hashlib.sha256(pathlib.Path('/proc/cmdline').read_bytes()).hexdigest(),
          'rootControllers': pathlib.Path('/sys/fs/cgroup/cgroup.controllers').read_text().split(),
          'systemControllers': pathlib.Path('/sys/fs/cgroup/system.slice/cgroup.controllers').read_text().split(),
          'ssh': run(['systemctl', 'show', 'ssh.service', '-p', 'MainPID', '-p', 'ActiveState', '-p', 'FragmentPath']),
          'ports': run(['ss', '-ltnp', '( sport = :8787 or sport = :8788 )']),
          'port8787': run(['ss', '-H', '-ltnp', 'sport = :8787']),
          'memory': run(['free', '-m']), 'files': {}}
for path in ['/home/user/vidfetch-backend/server.js', '/usr/lib/systemd/system/ssh.service',
             '/etc/systemd/system/vidfetch.service', '/opt/vidfetch/releases/20261011-eu3x4mea/vidfetch-backend.cjs',
             '/opt/vidfetch/releases/20261011-eu3x4mea/service-preflight.cjs']:
    p = pathlib.Path(path)
    if p.is_file():
        result['files'][path] = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'uid': p.stat().st_uid,
                                 'mode': oct(p.stat().st_mode & 0o777)}
link = pathlib.Path('/etc/systemd/system/multi-user.target.wants/vidfetch.service')
result['bootEnableLink'] = str(link.resolve()) if link.is_symlink() else None
if int(unit.get('MainPID', '0')):
    p = pathlib.Path('/proc') / unit['MainPID']
    status = dict(line.split(':', 1) for line in (p / 'status').read_text().splitlines() if ':' in line)
    result['mainProcess'] = {name: status.get(name, '').strip() for name in ['Name', 'Uid', 'Gid', 'VmRSS', 'VmHWM', 'Threads', 'NoNewPrivs', 'CapEff']}
if unit.get('ControlGroup'):
    p = pathlib.Path('/sys/fs/cgroup') / unit['ControlGroup'].lstrip('/')
    result['cgroup'] = {name: (p / name).read_text().strip() for name in ['cpu.max', 'cpu.weight', 'pids.max', 'pids.current', 'cgroup.procs', 'cpu.stat'] if (p / name).exists()}
    result['cgroup']['memory.maxPresent'] = (p / 'memory.max').exists()
print(json.dumps(result, indent=2))
