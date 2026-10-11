#!/usr/bin/env python3
"""Optional read-only root audit, execute only after explicit sudo permission."""
import json,pathlib,re
result={'rootCron':{'present':False,'magicMirrorLines':[]},'rootPm2':[]}
p=pathlib.Path('/var/spool/cron/crontabs/root')
if p.exists():
    result['rootCron']['present']=True
    result['rootCron']['magicMirrorLines']=[n for n,l in enumerate(p.read_text().splitlines(),1) if re.search(r'magicmirror|\bmm\.sh\b',l,re.I)]
for p in [pathlib.Path('/root/.pm2/dump.pm2'),pathlib.Path('/root/.pm2/dump.pm2.bak')]:
    if not p.exists():continue
    data=json.loads(p.read_text())
    apps=[{k:row.get(k) for k in ['name','pm_cwd','pm_exec_path','autostart']} for row in data]
    result['rootPm2'].append({'path':str(p),'apps':apps})
print(json.dumps(result))
