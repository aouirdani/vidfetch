"""Bounded outbound canaries as the worker UID. Never touches any other service."""
import os,subprocess,json,pwd,time,pathlib
assert os.geteuid()==0
node='/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node'
# Validate denial before any public activation. Python uses no proxies or DNS for private canaries.
code='''import socket,json
out=[]
for host,port in [('127.0.0.1',8788),('10.0.0.1',80),('169.254.169.254',80),('192.168.1.112',8788),('213.186.33.99',22)]:
 s=socket.socket();s.settimeout(1)
 try:s.connect((host,port));out.append({'host':host,'port':port,'blocked':False})
 except OSError:out.append({'host':host,'port':port,'blocked':True})
 finally:s.close()
s=socket.socket(socket.AF_INET6);s.settimeout(1)
try:s.connect(('::1',8788));out.append({'host':'::1','blocked':False})
except OSError:out.append({'host':'::1','blocked':True})
finally:s.close()
print(json.dumps(out))
'''
r=subprocess.run(['runuser','-u','vidfetch-worker','--','python3','-c',code],capture_output=True,text=True,check=True)
results=json.loads(r.stdout)
assert all(t['blocked'] for t in results)
# SSH still responds from the ordinary admin UID; never use its port for worker canaries.
assert subprocess.check_output(['systemctl','is-active','ssh'],text=True).strip()=='active'
print(json.dumps({'uid':pwd.getpwnam('vidfetch-worker').pw_uid,'tests':results,'ssh':'active'}))
