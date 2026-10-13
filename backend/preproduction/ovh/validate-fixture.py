import os,pathlib,subprocess,shutil,json
assert os.geteuid()==0
stage=pathlib.Path('/home/debian/vidfetch-ovh-20261012-LdnrtQwN')
validation=pathlib.Path('/opt/vidfetch/validation-3');assert not validation.exists();validation.mkdir(mode=0o755)
output=stage/'run-3';output.mkdir(mode=0o700);os.chown(output,1000,1000)
metadata=json.loads((stage/'ogv-fixture.json').read_text());assert metadata['extractor_key']=='Generic';assert metadata['formats'][0]['url']=='https://media.w3.org/2010/05/bunny/trailer.ogv'
# Generic HTTP metadata lacks codecs; these values are independently confirmed by ffprobe.
metadata['formats'][0].update(vcodec='theora',acodec='vorbis')
(validation/'fixture-metadata.json').write_text(json.dumps(metadata));shutil.copyfile(stage/'fixture-audio.cjs',validation/'fixture.cjs')
directory=pathlib.Path('/etc/systemd/system/vidfetch.service.d');assert not directory.exists();directory.mkdir()
dropin=directory/'validation.conf';dropin.write_text('[Service]\nExecStart=\nExecStart=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node --max-old-space-size=192 /opt/vidfetch/validation-3/fixture.cjs\n')
try:
 subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
 subprocess.run(['systemctl','daemon-reload'],check=True)
 subprocess.run(['systemctl','reset-failed','vidfetch.service','vidfetch-gateway.service'],check=True)
 subprocess.run(['systemctl','start','vidfetch.service','vidfetch-gateway.service'],check=True)
 for _ in range(80):
  import urllib.request,time
  try:
   h=json.load(urllib.request.urlopen('http://127.0.0.1:8788/api/health',timeout=1))
   if h.get('engine',{}).get('fixture') is True:break
  except OSError:time.sleep(.25)
 else:raise RuntimeError('Fixture readiness failed')
 result=subprocess.run(['/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node',str(stage/'live-tests-ogv-final.mjs'),str(output)],timeout=300)
finally:
 subprocess.run(['systemctl','stop','vidfetch-gateway.service','vidfetch.service'],check=True)
 assert dropin.read_text().endswith('/opt/vidfetch/validation-3/fixture.cjs\n')
 dropin.unlink();directory.rmdir() # Only the exact temporary override created above.
 subprocess.run(['systemctl','daemon-reload'],check=True)
 subprocess.run(['systemctl','reset-failed','vidfetch.service','vidfetch-gateway.service'],check=True)
 subprocess.run(['systemctl','start','vidfetch.service','vidfetch-gateway.service'],check=True)
 for name in ['live-tests.json','received.ogv','received.mp3']:
  p=output/name
  if p.exists():os.chown(p,1000,1000)
raise SystemExit(result.returncode)
