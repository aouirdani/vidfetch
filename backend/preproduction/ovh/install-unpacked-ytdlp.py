import os,pathlib,urllib.request,hashlib,zipfile,subprocess,shutil,json
assert os.geteuid()==0
base=pathlib.Path('/opt/vidfetch/tools/yt-dlp-2026.08.19-unpacked');assert not base.exists();base.mkdir()
url='https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/'
checks=urllib.request.urlopen(url+'SHA2-256SUMS',timeout=45).read().decode()
expected=next(s.split()[0] for s in checks.splitlines() if s.split()[-1]=='yt-dlp_linux.zip')
archive=base/'yt-dlp_linux.zip';urllib.request.urlretrieve(url+'yt-dlp_linux.zip',archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
(base/'SHA2-256SUMS').write_text(checks)
with zipfile.ZipFile(archive) as z:
 for name in z.namelist():
  path=pathlib.PurePosixPath(name);assert not path.is_absolute() and '..' not in path.parts
 z.extractall(base)
binaries=[p for p in base.rglob('yt-dlp_linux') if p.is_file()]
assert len(binaries)==1
binary=binaries[0];binary.chmod(0o755)
assert subprocess.check_output([str(binary),'--version'],text=True).strip()=='2026.08.19'
backup=pathlib.Path('/opt/vidfetch/backups/before-unpacked-ytdlp-20261012');backup.mkdir(mode=0o700)
env=pathlib.Path('/etc/vidfetch/worker.env');shutil.copyfile(env,backup/'worker.env');(backup/'worker.env').chmod(0o600)
text=env.read_text();assert 'YTDLP_PATH=/opt/vidfetch/tools/yt-dlp-2026.08.19/yt-dlp\n' in text
subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
env.write_text(text.replace('YTDLP_PATH=/opt/vidfetch/tools/yt-dlp-2026.08.19/yt-dlp\n',f'YTDLP_PATH={binary}\n'));env.chmod(0o600)
subprocess.run(['systemctl','reset-failed','vidfetch.service'],check=True)
subprocess.run(['systemctl','start','vidfetch.service','vidfetch-gateway.service'],check=True)
# No pre-existing global yt-dlp command is replaced.
link=pathlib.Path('/usr/local/bin/yt-dlp');assert not os.path.lexists(link);link.symlink_to(binary)
print(json.dumps({'binary':str(binary),'archiveSha256':expected,'version':'2026.08.19','oldBinaryPreserved':True}))
