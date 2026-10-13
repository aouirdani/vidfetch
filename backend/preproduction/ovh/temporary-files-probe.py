import pathlib,subprocess,os,signal,time,json
before=set(pathlib.Path('/tmp').glob('_MEI*'))
p=subprocess.Popen(['/usr/local/bin/yt-dlp','--ignore-config','--force-ipv4','--socket-timeout','3','--limit-rate','1K','--no-progress','-o','-','https://media.w3.org/2010/05/bunny/trailer.ogv'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
time.sleep(3)
if p.poll() is None:os.killpg(p.pid,signal.SIGKILL)
p.wait();time.sleep(.3)
after=set(pathlib.Path('/tmp').glob('_MEI*'));remaining=after-before
print(json.dumps({'killed':p.returncode<0,'remainingExtractionDirectories':len(remaining),'remainingBytes':sum(f.stat().st_size for d in remaining for f in d.rglob('*') if f.is_file())}))
