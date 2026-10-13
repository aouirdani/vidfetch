"""Run as root ONLY on the explicitly authorized fresh OVH VPS. No SSH/network changes."""
import os, pathlib, subprocess, urllib.request, hashlib, json
assert os.geteuid()==0
base=pathlib.Path('/opt/vidfetch')
assert not base.exists(), 'Existing installation: stop and audit before modifying'
for user in ['vidfetch-worker','vidfetch-gateway']:
 assert subprocess.run(['getent','passwd',user],stdout=subprocess.DEVNULL).returncode!=0,'Existing dedicated account'
env=dict(os.environ,LC_ALL='C.UTF-8',DEBIAN_FRONTEND='noninteractive',NEEDRESTART_MODE='l')
subprocess.run(['apt-get','update'],env=env,check=True)
subprocess.run(['apt-get','install','--no-install-recommends','-y','ffmpeg','nftables','xz-utils'],env=env,check=True)
base.mkdir(mode=0o755)
tools=base/'tools'; tools.mkdir()
node='node-v22.23.3-linux-x64.tar.xz'
url='https://nodejs.org/download/release/v22.23.3/'
checks=urllib.request.urlopen(url+'SHASUMS256.txt',timeout=30).read().decode()
expected=next(line.split()[0] for line in checks.splitlines() if line.split()[-1]==node)
assert expected=='df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de'
archive=tools/node; urllib.request.urlretrieve(url+node,archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
(tools/'node-SHASUMS256.txt').write_text(checks)
subprocess.run(['tar','-xJf',str(archive),'-C',str(tools)],check=True)
ytdir=tools/'yt-dlp-2026.08.19'; ytdir.mkdir()
yturl='https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/'
checks=urllib.request.urlopen(yturl+'SHA2-256SUMS',timeout=45).read().decode()
expected=next(line.split()[0] for line in checks.splitlines() if line.split()[-1]=='yt-dlp_linux')
yt=ytdir/'yt-dlp'; urllib.request.urlretrieve(yturl+'yt-dlp_linux',yt)
assert hashlib.sha256(yt.read_bytes()).hexdigest()==expected
(ytdir/'SHA2-256SUMS').write_text(checks); yt.chmod(0o755)
for user in ['vidfetch-worker','vidfetch-gateway']:
 subprocess.run(['useradd','--system','--user-group','--home-dir','/nonexistent','--shell','/usr/sbin/nologin',user],check=True)
# Generate only the missing locale, without changing default locale or SSH settings.
subprocess.run(['localedef','-i','en_US','-f','UTF-8','en_US.UTF-8'],check=True)
versions={}
for name,cmd in [('node',[str(tools/'node-v22.23.3-linux-x64/bin/node'),'--version']),('yt-dlp',[str(yt),'--version']),('ffmpeg',['/usr/bin/ffmpeg','-version']),('ffprobe',['/usr/bin/ffprobe','-version'])]:
 versions[name]=subprocess.check_output(cmd,text=True).splitlines()[0]
print(json.dumps({'versions':versions,'node_sha256':'df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de','yt_sha256':expected}))
