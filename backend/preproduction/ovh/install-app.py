"""Root installation from the fresh staging directory. Refuses every existing target."""
import os,pathlib,pwd,subprocess,json,hashlib,secrets,shutil,sys
assert os.geteuid()==0
stage=pathlib.Path(sys.argv[1]); assert str(stage).startswith('/home/debian/vidfetch-ovh-20261012-')
release=pathlib.Path('/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4')
config=pathlib.Path('/etc/vidfetch')
assert not release.exists() and not config.exists()
for name in ['vidfetch.service','vidfetch-egress.service','vidfetch-gateway.service']:
 assert not pathlib.Path('/etc/systemd/system',name).exists()
 assert not pathlib.Path('/usr/lib/systemd/system',name).exists()
assert not subprocess.check_output(['ss','-H','-ltn','( sport = :8788 or sport = :8789 )'],text=True).strip()
assert subprocess.run(['nft','list','table','inet','vidfetch_egress'],capture_output=True).returncode!=0
release.mkdir(parents=True,mode=0o755);config.mkdir(mode=0o755)
for name in ['vidfetch-ovh.cjs','vidfetch-gateway.cjs']:
 shutil.copyfile(stage/name,release/name);(release/name).chmod(0o644)
subprocess.run(['/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node','--check',str(release/'vidfetch-ovh.cjs')],check=True)
subprocess.run(['/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node','--check',str(release/'vidfetch-gateway.cjs')],check=True)
worker=pwd.getpwnam('vidfetch-worker').pw_uid;gateway=pwd.getpwnam('vidfetch-gateway').pw_uid
rules=f'''table inet vidfetch_egress {{
 set private4 {{ type ipv4_addr; flags interval;
 elements = {{ 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/3 }}
 }}
 chain output {{ type filter hook output priority 0; policy accept;
 meta skuid {worker} jump worker_out
 }}
 chain worker_out {{
 ct state established,related accept
 ip daddr @private4 counter drop
 # Prevent IPv6 transitions/private/mapped address bypasses; public sources use IPv4.
 meta nfproto ipv6 counter drop
 ip daddr 213.186.33.99 udp dport 53 accept
 ip daddr 213.186.33.99 tcp dport 53 accept
 tcp dport {{ 80, 443 }} accept
 counter drop
 }}
}}
'''
(config/'egress.nft').write_text(rules)
(config/'resolv.conf').write_text('nameserver 213.186.33.99\noptions timeout:2 attempts:2\n')
subprocess.run(['nft','--check','-f',str(config/'egress.nft')],check=True)
# This new table matches ONLY the freshly created worker UID; all other UIDs unaffected.
subprocess.run(['nft','-f',str(config/'egress.nft')],check=True)
active=json.loads(subprocess.check_output(['nft','-j','-s','list','table','inet','vidfetch_egress'],text=True))
def stable(value):
 if isinstance(value,list):return [stable(x) for x in value]
 if isinstance(value,dict):return {k:stable(v) for k,v in value.items() if k not in ['handle','index','packets','bytes']}
 return value
fingerprint=hashlib.sha256(json.dumps(stable([x for x in active['nftables'] if 'metainfo' not in x]),sort_keys=True,separators=(',',':')).encode()).hexdigest()
profile={'version':'vidfetch-uid-nft-v1','workerUid':worker,'gatewayUid':gateway,'rulesVerified':True,'rulesFile':'/etc/vidfetch/egress.nft','rulesSha256':hashlib.sha256(rules.encode()).hexdigest(),'kernelSha256':fingerprint}
(config/'isolation.json').write_text(json.dumps(profile,indent=2)+'\n')
shutil.copyfile(stage/'egress-control.py',config/'egress-control.py')
node='/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin'
(config/'worker.env').write_text(f'''LC_ALL=C.UTF-8
PATH={node}:/usr/bin:/bin
HOME=/var/lib/vidfetch-worker
YTDLP_PATH=/opt/vidfetch/tools/yt-dlp-2026.08.19/yt-dlp
FFMPEG_PATH=/usr/bin/ffmpeg
YTDLP_FORCE_IPV4=1
VIDFETCH_OVH_WORKER_ENABLED=1
VIDFETCH_ISOLATION_PROFILE=/etc/vidfetch/isolation.json
''')
(config/'gateway.env').write_text(f'''LC_ALL=C.UTF-8
PATH={node}:/usr/bin:/bin
HOME=/var/lib/vidfetch-gateway
VIDFETCH_GATEWAY_ENABLED=1
VIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app
VIDFETCH_SITE_ORIGINS=https://vidfetch.app
VIDFETCH_PRIVATE_BACKEND=http://127.0.0.1:8788
VIDFETCH_ISOLATION_MODE=uid-nft
VIDFETCH_PROXY=reverse-proxy
VIDFETCH_ACCESS_SIGNING_KEY={secrets.token_urlsafe(32)}
VIDFETCH_QUOTA_DB=/var/lib/vidfetch-gateway/quotas.sqlite
VIDFETCH_PUBLIC_MAX_MIB=256
VIDFETCH_STREAM_KIBPS=2048
VIDFETCH_QUEUE_ENABLED=1
VIDFETCH_QUEUE_MAX=2
VIDFETCH_QUEUE_WAIT_SECONDS=180
VIDFETCH_QUEUE_ESTIMATE_SECONDS=90
''')
for name in ['worker.env','gateway.env']:(config/name).chmod(0o600)
for name in ['vidfetch.service','vidfetch-gateway.service','vidfetch-egress.service']:
 shutil.copyfile(stage/name,pathlib.Path('/etc/systemd/system',name))
subprocess.run(['systemd-analyze','verify','/etc/systemd/system/vidfetch.service','/etc/systemd/system/vidfetch-gateway.service','/etc/systemd/system/vidfetch-egress.service'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
print(json.dumps({'installed':str(release),'workerUid':worker,'gatewayUid':gateway,'kernelPolicySha256':fingerprint,'enabled':False,'publicServing':False}))
