"""Validate only new VidFetch services: clean stop, start, active-engine crash/recovery, boot enablement."""
import os,pathlib,subprocess,json,time,urllib.request,threading
assert os.geteuid()==0
stage=pathlib.Path('/home/debian/vidfetch-ovh-20261012-LdnrtQwN')
checks=[]
def check(name,ok,**evidence):
 checks.append(dict(name=name,ok=ok,**evidence));assert ok,name
def show(unit):
 props=['MainPID','NRestarts','MemoryCurrent','MemoryPeak','CPUUsageNSec','MemoryMax','MemoryHigh','TasksMax','CPUQuotaPerSecUSec','ActiveState','ControlGroup']
 return dict(x.split('=',1) for x in subprocess.check_output(['systemctl','show',unit,*['-p'+p for p in props]],text=True).splitlines())
def health():
 return json.load(urllib.request.urlopen('http://127.0.0.1:8788/api/health',timeout=3))
def ready():
 for _ in range(100):
  try:
   h=health()
   if h.get('ok'):return h
  except (OSError,ValueError):pass
  time.sleep(.25)
 raise RuntimeError('Health readiness timeout')
def worker_processes():
 found=[]
 for path in pathlib.Path('/proc').glob('[0-9]*/status'):
  try:
   fields=dict(x.split(':',1) for x in path.read_text().splitlines() if ':' in x)
   if int(fields['Uid'].split()[0])==999:found.append({'pid':int(path.parent.name),'ppid':int(fields['PPid']),'name':fields['Name'].strip()})
  except (OSError,KeyError,ValueError):pass
 return found
ssh_before=show('ssh.service')['MainPID']
subprocess.run(['systemctl','reset-failed','vidfetch.service'],check=True)
initial=show('vidfetch.service');before_ports=subprocess.check_output(['ss','-H','-ltn'],text=True)
try:
 check('permanent_entry_restored',not ready()['engine'].get('fixture',False))
 subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
 check('stop_no_workers',not worker_processes())
 ports=subprocess.check_output(['ss','-H','-ltn','( sport = :8788 or sport = :8789 )'],text=True)
 check('stop_ports_free',not ports.strip())
 subprocess.run(['systemctl','start','vidfetch.service','vidfetch-gateway.service'],check=True)
 check('start_health',ready()['ok'])
 before=show('vidfetch.service');pid=int(before['MainPID'])
 def metadata():
  try:urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8788/api/fetch-info',data=json.dumps({'url':'https://www.youtube.com/watch?v=aqz-KE-bpKQ'}).encode(),headers={'Content-Type':'application/json'}),timeout=20).read()
  except OSError:pass
 t=threading.Thread(target=metadata,daemon=True);t.start();descendants=[]
 for _ in range(100):
  descendants=[p for p in worker_processes() if p['pid']!=pid]
  if descendants:break
  time.sleep(.05)
 check('active_engine_before_crash',bool(descendants),processes=descendants)
 started=time.monotonic()
 subprocess.run(['systemctl','kill','--kill-whom=main','--signal=SIGKILL','vidfetch.service'],check=True)
 for _ in range(120):
  after=show('vidfetch.service')
  if int(after['MainPID']) not in [0,pid] and after['ActiveState']=='active':
   try:
    if health()['ok']:break
   except OSError:pass
  time.sleep(.25)
 else:raise RuntimeError('Automatic restart failed')
 check('automatic_restart',int(after['NRestarts'])==int(before['NRestarts'])+1,oldPid=pid,newPid=int(after['MainPID']),restartSeconds=round(time.monotonic()-started,3),NRestarts=int(after['NRestarts']))
 time.sleep(.5)
 check('crash_no_orphans',not any(pathlib.Path('/proc',str(p['pid'])).exists() for p in descendants),oldEnginePids=[p['pid'] for p in descendants])
 check('gateway_running',show('vidfetch-gateway.service')['ActiveState']=='active')
 subprocess.run(['systemctl','enable','vidfetch-egress.service','vidfetch.service','vidfetch-gateway.service'],check=True)
 for unit in ['vidfetch-egress.service','vidfetch.service','vidfetch-gateway.service']:
  check('enabled_'+unit,subprocess.check_output(['systemctl','is-enabled',unit],text=True).strip()=='enabled')
 check('ssh_pid_unchanged',show('ssh.service')['MainPID']==ssh_before,sshPid=int(ssh_before))
 check('loopback_ports',all('127.0.0.1:' in x for x in subprocess.check_output(['ss','-H','-ltn','( sport = :8788 or sport = :8789 )'],text=True).splitlines()))
finally:
 report={'checks':checks,'initialService':initial,'worker':show('vidfetch.service'),'gateway':show('vidfetch-gateway.service'),'health':ready(),'memory':subprocess.check_output(['free','-m'],text=True),'disk':subprocess.check_output(['df','-h','/'],text=True),'portsBefore':before_ports,'portsAfter':subprocess.check_output(['ss','-H','-ltn'],text=True),'workerProcesses':worker_processes(),'rebootExecuted':False}
 p=stage/'service-lifecycle.json';p.write_text(json.dumps(report,indent=2));p.chmod(0o600);os.chown(p,1000,1000)
 print(json.dumps({'passed':sum(c['ok'] for c in checks),'checks':len(checks),'health':report['health'],'worker':report['worker'],'gateway':report['gateway']}))
