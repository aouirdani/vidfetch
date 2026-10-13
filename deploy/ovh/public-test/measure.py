#!/usr/bin/python3
"""Bounded public-frontend load observation; does not generate any traffic."""
from datetime import datetime, timezone
import json
from pathlib import Path
import time

units = ['vidfetch-web-preproduction-20261013.service', 'vidfetch-caddy.service']
def sample():
    values = {}
    for unit in units:
        group = Path('/sys/fs/cgroup/system.slice') / unit
        stats = dict(line.split() for line in (group / 'cpu.stat').read_text().splitlines())
        values[unit] = {'memory': int((group / 'memory.current').read_text()), 'cpu': int(stats['usage_usec'])}
    return values
started = datetime.now(timezone.utc).isoformat()
begin = time.monotonic(); first = previous = sample(); previous_time = begin
peaks = {unit: 0 for unit in units}; cpu_peaks = {unit: 0 for unit in units}; combined = 0; samples = 0
while time.monotonic() - begin < 90:
    current = sample(); now = time.monotonic(); interval = now - previous_time
    combined = max(combined, sum(x['memory'] for x in current.values())); samples += 1
    for unit in units:
        peaks[unit] = max(peaks[unit], current[unit]['memory'])
        if interval > .05:
            cpu_peaks[unit] = max(cpu_peaks[unit], (current[unit]['cpu'] - previous[unit]['cpu']) / 1e6 / interval * 100)
    previous, previous_time = current, now
    time.sleep(.25)
print(json.dumps({'startedAt': started, 'seconds': round(time.monotonic() - begin, 3), 'samples': samples,
    'maximumCombinedBytes': combined, 'memoryPeaksBytes': peaks, 'maximumOneCoreCPUPercent': cpu_peaks,
    'cpuSeconds': {unit: (previous[unit]['cpu'] - first[unit]['cpu']) / 1e6 for unit in units}}, indent=2))
