import hashlib,json,pathlib,subprocess,sys
profile=json.loads(pathlib.Path('/etc/vidfetch/isolation.json').read_text())
rules=pathlib.Path(profile['rulesFile'])
assert hashlib.sha256(rules.read_bytes()).hexdigest()==profile['rulesSha256']
def stable(value):
 if isinstance(value,list):return [stable(x) for x in value]
 if isinstance(value,dict):return {k:stable(v) for k,v in value.items() if k not in ['handle','index','packets','bytes']}
 return value
def fingerprint():
 r=subprocess.run(['nft','-j','-s','list','table','inet','vidfetch_egress'],capture_output=True,text=True)
 if r.returncode:return None
 return hashlib.sha256(json.dumps(stable([x for x in json.loads(r.stdout)['nftables'] if 'metainfo' not in x]),sort_keys=True,separators=(',',':')).encode()).hexdigest()
current=fingerprint()
if sys.argv[1]=='start':
 if current is None:
  subprocess.run(['nft','--check','-f',str(rules)],check=True)
  subprocess.run(['nft','-f',str(rules)],check=True)
 assert fingerprint()==profile['kernelSha256'], 'Active VidFetch policy differs from validated rules'
elif sys.argv[1]=='stop':
 if current is not None:
  assert current==profile['kernelSha256'], 'Refusing to delete modified policy'
  subprocess.run(['nft','delete','table','inet','vidfetch_egress'],check=True)
else:raise ValueError('start/stop only')
