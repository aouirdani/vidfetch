import os,pathlib,hashlib,shutil,subprocess
assert os.geteuid()==0
stage=pathlib.Path('/home/debian/vidfetch-ovh-20261012-LdnrtQwN');bundle=stage/'vidfetch-ovh-ipv4.cjs'
assert hashlib.sha256(bundle.read_bytes()).hexdigest()=='fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287'
new=pathlib.Path('/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4');assert not new.exists();new.mkdir()
shutil.copyfile(bundle,new/'vidfetch-ovh.cjs');shutil.copyfile('/opt/vidfetch/releases/ovh-20261012-rnllrb69/vidfetch-gateway.cjs',new/'vidfetch-gateway.cjs')
backup=pathlib.Path('/opt/vidfetch/backups/before-ipv4-20261012');backup.mkdir(parents=True,mode=0o700)
for name in ['vidfetch.service','vidfetch-gateway.service']:
 p=pathlib.Path('/etc/systemd/system',name);shutil.copyfile(p,backup/name)
 p.write_text(p.read_text().replace('/ovh-20261012-rnllrb69/','/ovh-20261012-rnllrb69-ipv4/'))
p=pathlib.Path('/etc/vidfetch/worker.env');shutil.copyfile(p,backup/'worker.env');(backup/'worker.env').chmod(0o600)
p.write_text(p.read_text()+'YTDLP_FORCE_IPV4=1\n');p.chmod(0o600)
subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','start','vidfetch.service','vidfetch-gateway.service'],check=True)
print('IPv4-specific release installed; previous release and configurations backed up.')
