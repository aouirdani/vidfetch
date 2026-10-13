import os,pathlib,subprocess,json,urllib.request,pwd
assert os.geteuid()==0
stage=pathlib.Path('/home/debian/vidfetch-ovh-20261012-LdnrtQwN')
def run(args):return subprocess.check_output(args,text=True).strip()
report={'timestamp':run(['date','-u','+%Y-%m-%dT%H:%M:%SZ']),'os':run(['uname','-srm']),'node':run(['node','--version']),'ytdlp':run(['yt-dlp','--version']),'ffmpeg':run(['ffmpeg','-version']).splitlines()[0],'ffprobe':run(['ffprobe','-version']).splitlines()[0],'ports':run(['ss','-H','-ltn']),'memory':run(['free','-m']),'disk':run(['df','-h','/']),'health':json.load(urllib.request.urlopen('http://127.0.0.1:8788/api/health',timeout=10)),'services':{},'privateFiles':{},'processes':run(['ps','-u','vidfetch-worker,vidfetch-gateway','-o','user,pid,ppid,comm,rss,pcpu']),'ssh':run(['systemctl','show','ssh.service','-pMainPID','-pActiveState']),'sshSettings':{},'nftRules':run(['nft','list','table','inet','vidfetch_egress']),'bundles':{},'cgroups':{},'workerTmpExtractDirectories':[]}
for line in run(['sshd','-T']).splitlines():
 k=line.split()[0]
 if k in ['port','pubkeyauthentication','passwordauthentication','permitrootlogin']:report['sshSettings'][k]=line.split(' ',1)[1]
for unit in ['vidfetch.service','vidfetch-gateway.service','vidfetch-egress.service']:
 report['services'][unit]={'state':run(['systemctl','is-active',unit]),'enabled':run(['systemctl','is-enabled',unit]),'details':run(['systemctl','show',unit,'-pMainPID','-pNRestarts','-pMemoryCurrent','-pMemoryPeak','-pCPUUsageNSec','-pMemoryMax','-pTasksMax','-pNoNewPrivileges','-pCapabilityBoundingSet'])}
 if unit!='vidfetch-egress.service':
  d=pathlib.Path('/sys/fs/cgroup/system.slice',unit);report['cgroups'][unit]={n:(d/n).read_text().strip() for n in ['memory.max','memory.high','memory.swap.max','pids.max','cpu.max']}
for name in ['gateway.env','worker.env']:
 s=(pathlib.Path('/etc/vidfetch')/name).stat();report['privateFiles'][name]={'uid':s.st_uid,'mode':oct(s.st_mode&0o777)}
for n in ['vidfetch-ovh.cjs','vidfetch-gateway.cjs']:
 report['bundles'][n]=run(['sha256sum','/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4/'+n]).split()[0]
for r in pathlib.Path('/tmp').glob('systemd-private-*-vidfetch.service-*'):report['workerTmpExtractDirectories'] += [str(x) for x in r.rglob('_MEI*')]
assert report['health']['ok'] and not report['health']['engine'].get('fixture')
assert all(s['state']=='active' and s['enabled']=='enabled' for s in report['services'].values())
assert report['bundles']['vidfetch-ovh.cjs']=='fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287'
assert report['bundles']['vidfetch-gateway.cjs']=='a703f269641fc6c38fce74d4e7ff7f47ef5fe54a64b3e104dbab2082481dc1d5'
subprocess.run(['python3','/etc/vidfetch/egress-control.py','start'],check=True)
p=stage/'final-audit.json';p.write_text(json.dumps(report,indent=2)+'\n');p.chmod(0o600);os.chown(p,1000,1000)
log=stage/'final-journal.log';log.write_text(run(['journalctl','-u','vidfetch.service','-u','vidfetch-gateway.service','-u','vidfetch-egress.service','-n','80','--no-pager']));os.chown(log,1000,1000);log.chmod(0o600)
print(json.dumps({'timestamp':report['timestamp'],'health':report['health'],'memory':report['memory'],'services':report['services'],'workerTmpExtractDirectories':report['workerTmpExtractDirectories']}))
