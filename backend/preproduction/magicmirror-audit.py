#!/usr/bin/env python3
"""Read-only targeted inventory. Never print configuration values or process environments."""
import hashlib, json, os, pathlib, re, shutil, subprocess

home = pathlib.Path('/home/user')
installation = home / 'MagicMirror'
needle = re.compile(r'magicmirror|/home/user/MagicMirror|\bmm\.sh\b', re.I)
result = {'installation': str(installation), 'existing': installation.is_dir(), 'references': [],
          'units': [], 'externalSymlinks': [], 'pm2': [], 'inaccessible': []}

def command(args):
    p = subprocess.run(args, text=True, capture_output=True, timeout=30)
    return {'exit': p.returncode, 'stdout': p.stdout.strip()}

result['baseline'] = { 'memory': command(['free', '-m']), 'disk': command(['df', '-k', str(home)]),
    'ports': command(['ss', '-ltnp', '( sport = :8787 or sport = :8788 or sport = :8080 )']),
    'processes': command(['ps', '-eo', 'pid,ppid,comm,rss,pcpu']),
    'binaries': {name: shutil.which(name) for name in ('node', 'yt-dlp', 'ffmpeg', 'ffprobe', 'pm2')}}
result['sizes'] = command(['du', '-sk', str(installation), str(home / '.config/magicmirror')])
if installation.exists():
    package = json.loads((installation / 'package.json').read_text())
    result['package'] = {k: package.get(k) for k in ('name', 'version')}
    result['localDependencies'] = list(package.get('dependencies', {}))
    result['localDevDependencies'] = list(package.get('devDependencies', {}))
    for root, dirs, files in os.walk(installation, followlinks=False):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        for name in dirs + files:
            p = pathlib.Path(root) / name
            if p.is_symlink():
                target = str(p.resolve())
                if not target.startswith(str(installation) + '/'):
                    result['externalSymlinks'].append({'path': str(p), 'target': target})

roots = [pathlib.Path(p) for p in ('/etc/systemd/system', '/usr/lib/systemd/system', '/etc/init.d',
    '/etc/cron.d', '/etc/xdg/autostart', '/etc/xdg/labwc', '/etc/xdg/lxsession',
    '/home/user/.config', '/home/user/.local/share/applications', '/home/user/Desktop')]
files = [home / p for p in ('.bashrc', '.profile', '.bash_profile', '.xsession', '.xinitrc')]
files += [pathlib.Path('/etc/rc.local'), pathlib.Path('/etc/crontab')]
for root in roots:
    if not root.exists(): continue
    for current, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'Cache', 'Code Cache', 'GPUCache')]
        files.extend(pathlib.Path(current) / name for name in names)
for p in sorted(set(files)):
    try:
        if not p.is_file() or p.stat().st_size > 1024 * 1024: continue
        raw = p.read_bytes()
        text = raw.decode('utf8', errors='replace')
        hits = [n for n, line in enumerate(text.splitlines(), 1) if needle.search(line)]
        if hits or needle.search(str(p)):
            result['references'].append({'path': str(p), 'matchingLines': hits,
                'sha256': hashlib.sha256(raw).hexdigest(), 'symlink': p.is_symlink()})
            if p.suffix == '.service':
                user_unit = str(p).startswith(str(home))
                args = ['systemctl'] + (['--user'] if user_unit else [])
                result['units'].append({'path': str(p), 'name': p.name, 'userUnit': user_unit,
                    'state': command(args + ['show', p.name, '-p', 'LoadState', '-p', 'ActiveState', '-p', 'UnitFileState', '-p', 'MainPID']),
                    'reverseDependencies': command(args + ['list-dependencies', '--reverse', '--plain', '--no-pager', p.name])})
    except PermissionError:
        result['inaccessible'].append(str(p))
    except (OSError, UnicodeError): pass
cron = command(['crontab', '-l'])
result['userCron'] = {'exit': cron['exit'], 'matchingLines': [i for i,l in enumerate(cron['stdout'].splitlines(),1) if needle.search(l)]}
for p in (home / '.pm2/dump.pm2', home / '.pm2/dump.pm2.bak'):
    if not p.exists(): continue
    try:
        data = json.loads(p.read_text())
        result['pm2'].append({'path': str(p), 'apps': [
            {k: row.get(k) for k in ('name', 'pm_cwd', 'pm_exec_path', 'autostart')} for row in data]})
    except Exception: result['pm2'].append({'path': str(p), 'parseFailed': True})
result['rootCronReadable'] = os.access('/var/spool/cron/crontabs/root', os.R_OK)
result['protectedHashes'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in
    (home / 'vidfetch-backend/server.js', installation / 'config/config.js', installation / 'package.json') if p.is_file()}
print(json.dumps(result, indent=2))
