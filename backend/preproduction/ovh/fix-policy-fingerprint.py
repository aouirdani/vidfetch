import os,pathlib,subprocess,hashlib,json,shutil
assert os.geteuid()==0
config=pathlib.Path('/etc/vidfetch');stage=pathlib.Path('/home/debian/vidfetch-ovh-20261012-LdnrtQwN')
subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
backup=pathlib.Path('/opt/vidfetch/backups/before-policy-fingerprint-20261012');backup.mkdir(mode=0o700)
for name in ['egress-control.py','isolation.json']:shutil.copyfile(config/name,backup/name)
# Reinstall exactly the root-controlled rule specification with the worker stopped.
profile=json.loads((config/'isolation.json').read_text());assert hashlib.sha256((config/'egress.nft').read_bytes()).hexdigest()==profile['rulesSha256']
subprocess.run(['nft','delete','table','inet','vidfetch_egress'],check=True)
subprocess.run(['nft','--check','-f',str(config/'egress.nft')],check=True)
subprocess.run(['nft','-f',str(config/'egress.nft')],check=True)
def stable(value):
 if isinstance(value,list):return [stable(x) for x in value]
 if isinstance(value,dict):return {k:stable(v) for k,v in value.items() if k not in ['handle','index','packets','bytes']}
 return value
active=json.loads(subprocess.check_output(['nft','-j','-s','list','table','inet','vidfetch_egress'],text=True))
profile['kernelSha256']=hashlib.sha256(json.dumps(stable([x for x in active['nftables'] if 'metainfo' not in x]),sort_keys=True,separators=(',',':')).encode()).hexdigest()
(config/'isolation.json').write_text(json.dumps(profile,indent=2)+'\n');shutil.copyfile(stage/'egress-control-stable.py',config/'egress-control.py')
subprocess.run(['systemctl','reset-failed','vidfetch-egress.service','vidfetch.service'],check=True)
subprocess.run(['systemctl','start','vidfetch-gateway.service'],check=True)
subprocess.run(['python3',str(config/'egress-control.py'),'start'],check=True)
print('Stable structural policy fingerprint verified; worker/gateway started.')
