#!/usr/bin/env python3
"""Create and verify a complete archive in a fresh private directory; no deletion."""
import hashlib, json, os, pathlib, sys, tarfile, time

destination = pathlib.Path(sys.argv[1])
if not str(destination).startswith('/home/user/vidfetch-maintenance-20261011-'):
    raise SystemExit('Use a fresh maintenance directory')
os.umask(0o077)
home = pathlib.Path('/home/user')
sources = [home/'MagicMirror', home/'.config/magicmirror', home/'.config/labwc/autostart']
archive = destination/'magicmirror-full.tar'
manifest = {}
def digest(stream):
    value=hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024*1024),b''): value.update(chunk)
    return value.hexdigest()
def record(info):
    if info.isfile():
        source=home/info.name
        with source.open('rb') as stream: manifest[info.name]={'size':info.size,'sha256':digest(stream)}
    elif info.issym() or info.islnk(): manifest[info.name]={'link':info.linkname}
    return info
started=time.time()
with archive.open('xb') as out, tarfile.open(fileobj=out,mode='w',dereference=False) as tar:
    for source in sources:
        if source.exists(): tar.add(source,arcname=str(source.relative_to(home)),filter=record)
with (destination/'magicmirror-manifest.json').open('x') as out: json.dump(manifest,out,indent=2)
checked=0
with tarfile.open(archive,'r') as tar:
    for member in tar:
        expected=manifest.get(member.name)
        if member.isfile():
            with tar.extractfile(member) as stream: actual=digest(stream)
            if actual!=expected['sha256'] or member.size!=expected['size']: raise RuntimeError('Archive verification failed')
            checked+=1
        elif member.issym() or member.islnk():
            if member.linkname!=expected['link']: raise RuntimeError('Link verification failed')
with archive.open('rb') as stream: archive_hash=digest(stream)
result={'archive':str(archive),'bytes':archive.stat().st_size,'sha256':archive_hash,
    'verifiedFiles':checked,'sources':[str(s) for s in sources if s.exists()],
    'seconds':round(time.time()-started,2),'permissions':oct(archive.stat().st_mode & 0o777),
    'configurationAndPersonalData':'included; complete application, all modules and app data',
    'deletionPerformed':False}
with (destination/'backup-verification.json').open('x') as out: json.dump(result,out,indent=2)
print(json.dumps(result))
