#!/usr/bin/env python3
"""Measure ten quiet seconds in the VidFetch cgroup, without service mutations."""
import datetime
import json
import pathlib
import time

group = pathlib.Path('/sys/fs/cgroup/system.slice/vidfetch.service')
def cpu():
    return int(dict(line.split() for line in (group / 'cpu.stat').read_text().splitlines())['usage_usec'])
started = time.monotonic()
before = cpu()
time.sleep(10)
after = cpu()
elapsed = time.monotonic() - started
pids = (group / 'cgroup.procs').read_text().split()
assert len(pids) == 1, 'Unexpected engine during idle measurement'
status = dict(line.split(':', 1) for line in (pathlib.Path('/proc') / pids[0] / 'status').read_text().splitlines() if ':' in line)
print(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'seconds': elapsed,
                  'cpuUsageDeltaUsec': after-before, 'cpuPercentOneCore': (after-before)/10000/elapsed,
                  'pid': int(pids[0]), 'rssKiB': int(status['VmRSS'].split()[0]), 'tasks': int((group/'pids.current').read_text())}))
