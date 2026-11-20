#!/usr/bin/python3
"""Administrator-only, bounded switch of the two engines, Caddy and frontend.
No secrets or media credentials are accepted on the command line or printed.
"""
import fcntl, hashlib, http.client, json, os, re, runpy, shutil, socket, stat, subprocess, sys, time, uuid
from pathlib import Path
STATE=Path('/etc/vidfetch/transfer-deployment.json')
BASE=Path('/opt/vidfetch-web-preproduction-20261013')
STORE=Path('/opt/vidfetch-ci-web')
GUARD=Path('/etc/vidfetch/ci-web-test-guard.json')
PROMOTE=Path('/usr/local/libexec/vidfetch-ci/promote.py')
CONTROL=Path('/usr/local/libexec/vidfetch-transfer-control.py')
CADDY=Path('/etc/vidfetch/public-https-test/Caddyfile.public-dl')
TRANSITION=Path('/etc/vidfetch/ci-engine-transition.json')
DRAIN=Path('/run/vidfetch-deployment/drain')
ENGINE_FILES=['backend/vidfetch-ovh.cjs','backend/vidfetch-gateway.cjs']
UNITS=['vidfetch.service','vidfetch-gateway.service']
DROPINS=[Path('/etc/systemd/system')/(u+'.d')/'90-same-tab-release.conf' for u in UNITS]
CONFIGS=[PROMOTE,CADDY,GUARD,TRANSITION,Path('/etc/vidfetch/gateway.env'),*DROPINS]
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def trusted(p):
    st=Path(p).lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:raise ValueError('Untrusted root file: '+str(p))
def command(args):return subprocess.check_output(args,text=True,timeout=45).strip()
def write(path,data,mode=0o600):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.new-'+uuid.uuid4().hex)
    tmp.write_bytes(data if isinstance(data,bytes) else data.encode());tmp.chmod(mode);os.replace(tmp,path)
def save_state(data):write(STATE,json.dumps(data,indent=2)+'\n')
def snapshot(folder,engines):
    folder.mkdir(mode=0o700)
    files={}
    for i,path in enumerate(CONFIGS):
        if path.exists():
            trusted(path);copy=folder/str(i);shutil.copyfile(path,copy);copy.chmod(0o600)
            files[str(path)]={'copy':str(copy),'sha256':digest(copy),'mode':stat.S_IMODE(path.stat().st_mode)}
        else:files[str(path)]=None
    marker=STORE/'previous.json'
    frontend=(BASE/'current').resolve(strict=True);trusted(frontend/'manifest.json')
    for path in engines.values():trusted(path)
    # Keep independent copies of both immutable binaries as well as their paths.
    for name,path in engines.items():
        copy=folder/Path(name).name;shutil.copyfile(path,copy);copy.chmod(0o600)
    return {'files':files,'engines':engines,'hashes':{n:digest(p) for n,p in engines.items()},'frontend':str(frontend),'frontendManifest':digest(frontend/'manifest.json'),'previousMarker':marker.read_text() if marker.exists() else None}
def request(port,path,headers=None):
    c=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
    try:c.request('GET',path,headers=headers or {'Host':'127.0.0.1:8788'});r=c.getresponse();return r.status,json.loads(r.read(65536))
    finally:c.close()
def idle():
    until=time.monotonic()+60
    while time.monotonic()<until:
        pid=command(['systemctl','show',UNITS[0],'-pMainPID','--value'])
        children=Path('/proc/'+pid+'/task/'+pid+'/children').read_text().strip() if pid!='0' else ''
        connections=command(['ss','-Htn','state','established','( sport = :8789 )'])
        if not children and not connections:return
        time.sleep(1)
    raise ValueError('Active media operation: switch refused')
def verify_state(s):
    for target,entry in s['files'].items():
        if Path(target) not in CONFIGS:raise ValueError('Unexpected managed file')
        if entry:trusted(entry['copy']);assert digest(entry['copy'])==entry['sha256']
    for name,path in s['engines'].items():
        trusted(path);assert digest(path)==s['hashes'][name]
    front=Path(s['frontend']);assert front.parent in [STORE/'releases',Path('/opt/vidfetch-web/releases')]
    trusted(front/'manifest.json');assert digest(front/'manifest.json')==s['frontendManifest']
def apply(s):
    verify_state(s);DRAIN.parent.mkdir(parents=True,exist_ok=True);DRAIN.touch(mode=0o600)
    idle()
    command(['systemctl','stop',UNITS[1]]);command(['systemctl','stop',UNITS[0]])
    for target,entry in s['files'].items():
        p=Path(target)
        if entry:write(p,Path(entry['copy']).read_bytes(),entry['mode'])
        elif p.exists():
            trusted(p);p.unlink()  # one named, root-owned configuration only
    command(['systemctl','daemon-reload'])
    command(['systemctl','start',UNITS[0]]);command(['systemctl','start',UNITS[1]])
    command(['systemctl','reload','vidfetch-caddy.service'])
    if (BASE/'current').resolve()!=Path(s['frontend']):
        temp=BASE/('.current-'+uuid.uuid4().hex);temp.symlink_to(s['frontend']);os.replace(temp,BASE/'current')
        command(['systemctl','restart','vidfetch-web-preproduction-20261013.service'])
    marker=STORE/'previous.json'
    if s['previousMarker'] is not None:write(marker,s['previousMarker'])
    DRAIN.unlink(missing_ok=True)
    for attempt in range(30):
        try:
            status,health=request(8788,'/api/health');assert status==200 and health['engine']['isolationProfile']=='vidfetch-uid-nft-v1'
            break
        except Exception:
            if attempt==29:raise
            time.sleep(.2)
    for name,unit in zip(ENGINE_FILES,UNITS):
        pid=command(['systemctl','show',unit,'-pMainPID','--value'])
        assert s['engines'][name].encode() in Path('/proc/'+pid+'/cmdline').read_bytes().split(b'\0')
    helper=runpy.run_path(str(PROMOTE));helper['guards']();helper['wait_health'](json.loads((Path(s['frontend'])/'manifest.json').read_text())['release']);helper['origin_health']()
    assert request(8789,'/api/health',{'Host':'dl.vidfetch.app','X-Forwarded-Proto':'https','X-Forwarded-For':'127.0.0.1'})[0]==401
    print(json.dumps({'health':200,'site':200,'isolation':'vidfetch-uid-nft-v1','gatewayAnonymousHealth':401}),flush=True)
def activate(data,name):
    source=data['active'];save_state({**data,'pending':name})
    try:apply(data[name])
    except Exception:
        if source!=name:apply(data[source])
        save_state({**data,'active':source,'pending':None});raise
    data.update(active=name,pending=None);save_state(data);print(json.dumps({'active':name,'validated':True}),flush=True)
def prepare(stage,manifest_hash):
    if STATE.exists():raise ValueError('Existing deployment checkpoint: no overwrite')
    stage=Path(stage).resolve();assert str(stage).startswith('/var/tmp/vidfetch-transfer-stage-')
    manifest=stage/'manifest.json';assert digest(manifest)==manifest_hash
    payload=json.loads(manifest.read_text());assert set(payload['engines'])==set(ENGINE_FILES)
    for name,h in payload['files'].items():assert '/' not in name and digest(stage/name)==h
    oldfront=(BASE/'current').resolve();oldmanifest=json.loads((oldfront/'manifest.json').read_text())
    oldengines={name:re.findall(r'/[^ ;]*\.cjs',command(['systemctl','show',unit,'-pExecStart','--value']))[0] for name,unit in zip(ENGINE_FILES,UNITS)}
    assert all(digest(path)==oldmanifest['files'][name] for name,path in oldengines.items())
    # Validate syntax before changing any live file. No listener or certificate changes.
    command(['/opt/vidfetch/tools/caddy-2.11.7/caddy','adapt','--config',str(stage/'Caddyfile'),'--adapter','caddyfile'])
    folder=Path('/var/backups')/('vidfetch-transfer-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()));folder.mkdir(mode=0o700)
    data={'schema':1,'active':'previous','backup':str(folder),'previous':snapshot(folder/'previous',oldengines),'current':None,'pending':None};save_state(data)
    switch_started=False
    try:
        release=Path('/opt/vidfetch/releases')/('transfer-'+payload['engines'][ENGINE_FILES[0]][:12]+'-'+payload['engines'][ENGINE_FILES[1]][:12]);release.mkdir(mode=0o755)
        engines={}
        for name in ENGINE_FILES:
            target=release/Path(name).name;write(target,(stage/Path(name).name).read_bytes(),0o644);assert digest(target)==payload['engines'][name];engines[name]=str(target)
        write(CONTROL,(stage/'transfer-control.py').read_bytes(),0o755)
        write(PROMOTE,(stage/'promote.py').read_bytes(),0o755)
        write(CADDY,(stage/'Caddyfile').read_bytes(),0o644)
        for i,path in enumerate(DROPINS):
            text='[Service]\nExecStart=\nExecStart=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node --max-old-space-size='+('192' if i==0 else '96')+' '+engines[ENGINE_FILES[i]]+'\n'
            write(path,text,0o644)
        env=Path('/etc/vidfetch/gateway.env');old=env.read_text();lines=[s for s in old.splitlines() if not s.startswith('VIDFETCH_DEPLOY_DRAIN_FILE=')]
        write(env,'\n'.join(lines)+'\nVIDFETCH_DEPLOY_DRAIN_FILE=/run/vidfetch-deployment/drain\n')
        write(TRANSITION,json.dumps({'previous':{n:oldmanifest['files'][n] for n in ENGINE_FILES},'current':payload['engines'],'live':engines},indent=2)+'\n')
        guard=json.loads(GUARD.read_text());before=set(guard['files'])
        for path in [PROMOTE,CADDY,TRANSITION,env,*DROPINS,*map(Path,engines.values()),CONTROL]:trusted(path);guard['files'][str(path)]=digest(path)
        assert set(guard['files'])>=before;write(GUARD,json.dumps(guard,indent=2)+'\n')
        data['current']=snapshot(folder/'current',engines);save_state(data);switch_started=True;activate(data,'current')
    except Exception:
        if not switch_started:
            apply(data['previous']);save_state({**data,'active':'previous','pending':None})
        raise
    print(json.dumps({'backup':str(folder),'rollback':'sudo '+str(CONTROL)+' previous'}),flush=True)
def main():
    if os.geteuid()!=0 or os.environ.get('SUDO_USER')=='vidfetch-deploy':raise SystemExit('Administrator required')
    with (STORE/'lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        action=sys.argv[1]
        if action=='prepare':prepare(sys.argv[2],sys.argv[3]);return
        trusted(STATE);data=json.loads(STATE.read_text())
        if action in ['previous','current']:activate(data,action)
        elif action=='record-current':
            assert data['active']=='current' and not data.get('pending');verify_state(data['current'])
            current=(BASE/'current').resolve();trusted(current/'manifest.json');m=json.loads((current/'manifest.json').read_text())
            assert all(m['files'][n]==data['current']['hashes'][n] for n in ENGINE_FILES)
            data['current']['frontend']=str(current);data['current']['frontendManifest']=digest(current/'manifest.json');data['current']['previousMarker']=(STORE/'previous.json').read_text();save_state(data)
            print(json.dumps({'frontendCheckpoint':m['release']}))
        else:raise ValueError('Unknown action')
if __name__=='__main__':main()
