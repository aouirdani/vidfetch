#!/usr/bin/env python3
"""Execute only after explicit confirmation of the exact two removal paths and autostart change."""
import hashlib, json, os, pathlib, re, shutil, stat, subprocess, sys

if sys.argv[1:] != ['--confirmed-exact-paths']:
    raise SystemExit('Explicit operator confirmation required')
home=pathlib.Path('/home/user')
work=home/'vidfetch-maintenance-20261011-ALaZGoF9'
root_audit=json.loads((work/'root-audit.json').read_text())
if root_audit['rootCron']['magicMirrorLines'] or any(re.search(r'magicmirror|\bmm\.sh\b',str(row),re.I) for dump in root_audit['rootPm2'] for row in dump['apps']):
    raise SystemExit('Additional root startup found: stop and review exact actions')
verification=json.loads((work/'backup-verification.json').read_text())
if verification['verifiedFiles']!=21648 or verification['sha256']!='1582132120467a95cc57af1246214c0088bf88ff4164b65d68f8cc364baa4b3f':
    raise SystemExit('Verified backup evidence mismatch')
archive=work/'magicmirror-full.tar'
h=hashlib.sha256()
with archive.open('rb') as stream:
    for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
if h.hexdigest()!=verification['sha256']:raise SystemExit('Archive changed; no deletion')
targets=[home/'MagicMirror',home/'.config/magicmirror']
for target in targets:
    if target.is_symlink() or not target.is_dir() or os.path.ismount(target):raise SystemExit('Unsafe removal target')
    for mount in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        point=mount.split()[4]
        if point==str(target) or point.startswith(str(target)+'/'):raise SystemExit('Mount inside removal target')
# Protect against a newly running consumer; never kill a PID by a broad name match.
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit():continue
    try:
        cwd=str((p/'cwd').resolve())
        args=(p/'cmdline').read_bytes().decode('utf8',errors='replace')
        if cwd.startswith(str(targets[0])) or re.search(r'/home/user/MagicMirror|\bmm\.sh\b',args,re.I):
            raise SystemExit('MagicMirror-related process present; review before removal')
    except (PermissionError,FileNotFoundError,ProcessLookupError):pass
autostart=home/'.config/labwc/autostart'
old=autostart.read_bytes()
if hashlib.sha256(old).hexdigest()!='bdd0eaf840c9029ea8d3f915963387104f513a48c6fcdaded877283ec60e70c6':raise SystemExit('Autostart changed; no overwrite')
lines=old.splitlines(keepends=True)
if len(lines)<7 or not re.search(rb'magicmirror',lines[6],re.I):raise SystemExit('Expected MagicMirror startup line absent')
# Change the identified launch line only, retaining comments and unrelated commands.
new=b''.join(lines[:6]+[b'# Disabled MagicMirror: installation removed after verified backup.\n']+lines[7:])
with (work/'autostart-before-removal').open('xb') as out:out.write(old)
with (work/'autostart-proposed').open('xb') as out:out.write(new)
report={'before':{},'after':{},'removed':[],'autostart':str(autostart)}
for name,args in [('disk',['df','-k',str(home)]),('memory',['free','-m']),('ports',['ss','-ltnp','( sport = :8787 or sport = :8788 or sport = :8080 )'])]:
    report['before'][name]=subprocess.run(args,capture_output=True,text=True,check=True).stdout
protected=home/'vidfetch-backend/server.js'
report['protectedBefore']=hashlib.sha256(protected.read_bytes()).hexdigest()
# Atomic replacement, retaining original mode and all unrelated startup lines.
temporary=autostart.parent/'autostart.vidfetch-new'
with temporary.open('xb') as out:out.write(new)
os.chmod(temporary,stat.S_IMODE(autostart.stat().st_mode))
os.replace(temporary,autostart)
for target in targets:
    shutil.rmtree(target)
    report['removed'].append({'path':str(target),'absent':not target.exists()})
report['protectedAfter']=hashlib.sha256(protected.read_bytes()).hexdigest()
for name,args in [('disk',['df','-k',str(home)]),('memory',['free','-m']),('ports',['ss','-ltnp','( sport = :8787 or sport = :8788 or sport = :8080 )'])]:
    report['after'][name]=subprocess.run(args,capture_output=True,text=True,check=True).stdout
report['binaries']={name:shutil.which(name) for name in ('node','yt-dlp','ffmpeg','ffprobe','ssh')}
report['nodeVersion']=subprocess.run(['node','--version'],capture_output=True,text=True,check=True).stdout.strip()
with (work/'removal-results.json').open('x') as out:json.dump(report,out,indent=2)
print(json.dumps(report))
