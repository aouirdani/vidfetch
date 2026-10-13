#!/usr/bin/python3
"""Read cgroup accounting only; does not alter scheduling or limits."""
from datetime import datetime, timezone
import json
from pathlib import Path
import time

units=['vidfetch-web-preproduction-20261013.service','vidfetch-launch-fixture-worker.service','vidfetch-launch-fixture-gateway.service','vidfetch-launch-fixture-proxy.service']
started=datetime.now(timezone.utc).isoformat();start=time.monotonic();samples=[]
def usage(unit):
    path=Path('/sys/fs/cgroup/system.slice')/unit
    stats=dict(line.split() for line in (path/'cpu.stat').read_text().splitlines())
    return {'memoryBytes':int((path/'memory.current').read_text()),'memoryPeakSinceServiceStartBytes':int((path/'memory.peak').read_text()),'cpuUsageUsecSinceServiceStart':int(stats['usage_usec'])}
while time.monotonic()-start<45:
    samples.append({'seconds':round(time.monotonic()-start,3),'units':{name:usage(name) for name in units}})
    time.sleep(.25)
result={'startedAtUtc':started,'sampledSeconds':round(time.monotonic()-start,3),'samples':len(samples),
        'maximumCombinedSampledBytes':max(sum(unit['memoryBytes'] for unit in sample['units'].values()) for sample in samples),
        'unitPeaksSinceServiceStartBytes':{name:max(s['units'][name]['memoryPeakSinceServiceStartBytes'] for s in samples) for name in units},
        'cpuUsageSecondsSinceServiceStart':{name:samples[-1]['units'][name]['cpuUsageUsecSinceServiceStart']/1000000 for name in units},
        'cpuSecondsInSamplingWindow':{name:(samples[-1]['units'][name]['cpuUsageUsecSinceServiceStart']-samples[0]['units'][name]['cpuUsageUsecSinceServiceStart'])/1000000 for name in units},
        'maximumOneCorePercent':{name:max((b['units'][name]['cpuUsageUsecSinceServiceStart']-a['units'][name]['cpuUsageUsecSinceServiceStart'])/10000/(b['seconds']-a['seconds']) for a,b in zip(samples,samples[1:])) for name in units},
        'note':'Local bounded fixtures only. Kernel peaks cover complete service lifetime, including activity preceding this sampling window. No production-capacity claim.'}
print(json.dumps(result,indent=2))
