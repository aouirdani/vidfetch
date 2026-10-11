#!/usr/bin/env python3
"""Exercise only vidfetch.service; record real media, cgroup resources and lifecycle."""
import datetime
import hashlib
import http.client
import json
import pathlib
import subprocess
import threading
import time

WORK = pathlib.Path(__file__).resolve().parent
GROUP = pathlib.Path('/sys/fs/cgroup/system.slice/vidfetch.service')
URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
report = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'tests': {}, 'events': []}
samples = []
halt = threading.Event()
phase = 'initial'


def command(args, timeout=60):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args) + '; ' + r.stderr.strip())
    return r.stdout.strip()


def state():
    text = command(['systemctl', 'show', 'vidfetch.service', '-p', 'MainPID', '-p', 'ActiveState', '-p', 'SubState',
                    '-p', 'NRestarts', '-p', 'Result', '-p', 'UnitFileState'])
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line)


def identities():
    result = []
    try:
        pids = set((GROUP / 'cgroup.procs').read_text().split())
    except FileNotFoundError:
        return result
    for pid in pids:
        try:
            p = pathlib.Path('/proc') / pid
            fields = (p / 'stat').read_text().rsplit(')', 1)[1].split()
            status = (p / 'status').read_text().splitlines()
            rss = next((int(line.split()[1]) for line in status if line.startswith('VmRSS:')), 0)
            uid = next(int(line.split()[1]) for line in status if line.startswith('Uid:'))
            result.append({'pid': int(pid), 'startTicks': fields[19], 'name': (p / 'comm').read_text().strip(), 'rssKiB': rss, 'uid': uid})
        except (FileNotFoundError, ProcessLookupError):
            pass
    return result


def observer():
    previous = None
    while not halt.is_set():
        now = time.monotonic()
        entry = {'phase': phase, 'time': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            processes = identities()
            cpu = dict(line.split() for line in (GROUP / 'cpu.stat').read_text().splitlines())
            usage = int(cpu['usage_usec'])
            entry.update({'processes': processes, 'rssKiB': sum(p['rssKiB'] for p in processes),
                          'tasks': int((GROUP / 'pids.current').read_text()), 'cpuUsageUsec': usage,
                          'throttledUsec': int(cpu.get('throttled_usec', 0))})
            if previous and usage >= previous[1]:
                entry['cpuPercentOneCore'] = (usage - previous[1]) / 10000 / (now - previous[0])
            previous = (now, usage)
        except FileNotFoundError:
            previous = None
            entry['inactive'] = True
        except Exception as error:
            entry['observerError'] = str(error)
        memory = dict((line.split(':')[0], int(line.split()[1])) for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemAvailable:', 'SwapFree:', 'SwapTotal:')))
        entry['availableRamKiB'] = memory['MemAvailable']
        entry['swapUsedKiB'] = memory['SwapTotal'] - memory['SwapFree']
        samples.append(entry)
        halt.wait(0.5)


def request(path, body=None, method=None, raw=None, timeout=200):
    connection = http.client.HTTPConnection('127.0.0.1', 8788, timeout=timeout)
    data = raw if raw is not None else json.dumps(body) if body is not None else None
    try:
        connection.request(method or ('POST' if data is not None else 'GET'), path, data,
                           {'Content-Type': 'application/json'} if data is not None else {})
        response = connection.getresponse()
        return response.status, json.loads(response.read(2 * 1024 * 1024))
    finally:
        connection.close()


def health_wait(previous_pid=None):
    start = time.monotonic()
    while time.monotonic() - start < 90:
        try:
            code, body = request('/api/health', timeout=2)
            current = state()
            if code == 200 and body.get('ok') and current['ActiveState'] == 'active' and (not previous_pid or int(current['MainPID']) != previous_pid):
                return {'http': code, 'body': body, 'state': current, 'waitSeconds': round(time.monotonic() - start, 2)}
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.3)
    raise RuntimeError('Health did not recover within 90 seconds')


def prepare(format_id, kind):
    code, ready = request('/api/download', {'url': URL, 'format_id': format_id, 'type': kind})
    if code != 201 or not ready.get('ok'):
        raise RuntimeError('Preparation failed: HTTP ' + str(code) + ', code ' + str(ready.get('code')))
    return ready


def transfer(ready, name, kind):
    path = WORK / name
    c = http.client.HTTPConnection('127.0.0.1', 8788, timeout=60)
    digest = hashlib.sha256()
    size = 0
    started = time.monotonic()
    try:
        c.request('GET', ready['downloadUrl'])
        r = c.getresponse()
        assert r.status == 200, 'Streaming HTTP failure'
        content_type = r.getheader('Content-Type')
        with path.open('xb') as out:
            while True:
                block = r.read(64 * 1024)
                if not block:
                    break
                digest.update(block)
                size += len(block)
                assert size <= 256 * 1024 * 1024, 'Client received more than the application limit'
                out.write(block)
    finally:
        c.close()
    for _ in range(30):
        code, status = request('/api/download?status=' + ready['token'], timeout=5)
        if status.get('status') == 'completed':
            break
        time.sleep(0.1)
    assert code == 200 and status['status'] == 'completed' and status['bytes'] == size and status['error'] is None, 'Completion/counter mismatch'
    reuse, _ = request(ready['downloadUrl'], timeout=5)
    assert reuse == 404, 'Ticket reused'
    probe = json.loads(command(['/usr/bin/ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,codec_type:format=duration,size', '-of', 'json', str(path)]))
    assert int(probe['format']['size']) == size, 'ffprobe size mismatch'
    if kind == 'audio':
        assert any(s['codec_name'] == 'mp3' for s in probe['streams']) and not any(s['codec_type'] == 'video' for s in probe['streams']), 'Expected MP3 only'
    else:
        assert {'video', 'audio'} <= {s['codec_type'] for s in probe['streams']}, 'Expected video with audio'
    return {'http': 200, 'contentType': content_type, 'bytes': size, 'sha256': digest.hexdigest(),
            'status': {k: status.get(k) for k in ['status', 'bytes', 'error']}, 'ticketReuse': reuse,
            'probe': probe, 'seconds': round(time.monotonic() - started, 2)}


def no_old_processes(old):
    for _ in range(20):
        remaining = []
        for process in old:
            path = pathlib.Path('/proc') / str(process['pid']) / 'stat'
            try:
                if path.read_text().rsplit(')', 1)[1].split()[19] == process['startTicks']:
                    remaining.append(process['pid'])
            except FileNotFoundError:
                pass
        if not remaining:
            return True
        time.sleep(0.25)
    raise RuntimeError('Old VidFetch processes remain: ' + str(remaining))


thread = threading.Thread(target=observer, daemon=True)
thread.start()
try:
    report['tests']['initialHealth'] = health_wait()
    report['initialState'] = state()
    report['sshBefore'] = command(['systemctl', 'show', 'ssh.service', '-p', 'MainPID', '-p', 'ActiveState'])
    report['port8787Before'] = command(['ss', '-H', '-ltnp', 'sport = :8787'])
    protected = pathlib.Path('/home/user/vidfetch-backend/server.js')
    report['protectedBefore'] = hashlib.sha256(protected.read_bytes()).hexdigest()
    code, body = request('/api/health', method='POST', timeout=5)
    assert code == 405
    report['tests']['method'] = code
    code, body = request('/api/fetch-info', raw='{', timeout=5)
    assert code == 400
    report['tests']['invalidJson'] = {'http': code, 'code': body.get('code')}
    code, body = request('/api/fetch-info', {'url': 'http://127.0.0.1/test'}, timeout=5)
    assert code == 400
    report['tests']['privateUrl'] = {'http': code, 'code': body.get('code')}
    code, body = request('/api/fetch-info', raw='x' * 8193, timeout=5)
    assert code == 413
    report['tests']['oversizedBody'] = {'http': code, 'code': body.get('code')}
    phase = 'metadata'
    code, info = request('/api/fetch-info', {'url': URL})
    assert code == 200 and info.get('ok'), 'Metadata failed'
    formats = [f for f in info['info']['formats'] if f['kind'] == 'video' and 0 < (f.get('height') or 0) <= 360]
    chosen = next((f for f in formats if f['id'] == '602'), sorted(formats, key=lambda f: f['height'])[0])
    report['format'] = {'id': chosen['id'], 'height': chosen['height']}
    phase = 'video'
    ready = prepare(chosen['id'], 'video')
    code, _ = request('/api/download', {'url': URL, 'format_id': 'mp3', 'type': 'audio'}, timeout=5)
    assert code == 429, 'Concurrency limit missing'
    report['tests']['concurrency'] = code
    report['tests']['video'] = transfer(ready, 'systemd-public-test.mp4', 'video')
    print(json.dumps({'stage': 'video-completed', 'bytes': report['tests']['video']['bytes']}), flush=True)
    phase = 'audio'
    ready = prepare('mp3', 'audio')
    report['tests']['audio'] = transfer(ready, 'systemd-public-test.mp3', 'audio')
    print(json.dumps({'stage': 'mp3-completed', 'bytes': report['tests']['audio']['bytes']}), flush=True)
    # An administrative stop must close the active ticket and the detached engines.
    phase = 'stop-with-engines'
    prepare('mp3', 'audio')
    old = identities()
    assert len(old) >= 2 and any(p['name'] in ['ffmpeg', 'yt-dlp', 'python3'] for p in old), 'No active engine to test cleanup'
    started = time.monotonic()
    command(['sudo', '-n', 'systemctl', 'stop', 'vidfetch.service'])
    assert no_old_processes(old)
    time.sleep(16)
    stopped = state()
    assert stopped['ActiveState'] == 'inactive' and stopped['MainPID'] == '0', 'Administrative stop restarted'
    assert not command(['ss', '-H', '-ltn', 'sport = :8788']), 'Port remained bound after stop'
    report['tests']['stop'] = {'state': stopped, 'elapsedIncludingNoRestartWait': round(time.monotonic() - started, 2),
                              'oldProcesses': old, 'allOldProcessesGone': True, 'noAutoRestartWaitSeconds': 16}
    phase = 'start-after-stop'
    command(['sudo', '-n', 'systemctl', 'start', 'vidfetch.service'])
    report['tests']['startAfterStop'] = health_wait()
    # Kill only the main process of this unit while real engines are alive.
    phase = 'crash-with-engines'
    prepare('mp3', 'audio')
    old = identities()
    assert len(old) >= 2, 'No engine available during crash test'
    previous = state()
    started = time.monotonic()
    command(['sudo', '-n', 'systemctl', 'kill', '--kill-whom=main', '--signal=SIGKILL', 'vidfetch.service'])
    recovered = health_wait(int(previous['MainPID']))
    assert int(recovered['state']['NRestarts']) > int(previous['NRestarts']), 'Automatic restart counter did not increase'
    assert no_old_processes(old)
    report['tests']['automaticRestart'] = {'before': previous, 'after': recovered, 'oldProcesses': old,
                                           'allOldProcessesGone': True, 'recoveredSeconds': round(time.monotonic() - started, 2)}
    # Reset counters consumed by this planned test, then enable this validated unit only.
    command(['sudo', '-n', 'systemctl', 'reset-failed', 'vidfetch.service'])
    command(['sudo', '-n', 'systemctl', 'enable', 'vidfetch.service'])
    phase = 'idle-final'
    time.sleep(10)
    report['tests']['finalHealth'] = health_wait()
    report['finalState'] = state()
    assert report['finalState']['UnitFileState'] == 'enabled'
    report['sshAfter'] = command(['systemctl', 'show', 'ssh.service', '-p', 'MainPID', '-p', 'ActiveState'])
    report['port8787After'] = command(['ss', '-H', '-ltnp', 'sport = :8787'])
    report['protectedAfter'] = hashlib.sha256(protected.read_bytes()).hexdigest()
    assert report['sshBefore'] == report['sshAfter'] and report['port8787Before'] == report['port8787After'] and report['protectedBefore'] == report['protectedAfter'], 'Protected service changed'
    assert len(identities()) == 1, 'Unexpected child left after recovery'
    report['status'] = 'VALIDÉ'
except Exception as error:
    report['status'] = 'ÉCHEC'
    report['failure'] = str(error)
    raise
finally:
    halt.set()
    thread.join(3)
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['resources'] = {'samples': len(samples), 'maxCgroupRssKiB': max((s.get('rssKiB', 0) for s in samples), default=0),
                           'maxTasks': max((s.get('tasks', 0) for s in samples), default=0),
                           'maxCpuPercentOneCore': max((s.get('cpuPercentOneCore', 0) for s in samples), default=0),
                           'minAvailableRamKiB': min((s['availableRamKiB'] for s in samples), default=0)}
    with (WORK / 'systemd-test-results.json').open('x') as out:
        json.dump(report, out, indent=2)
    with (WORK / 'systemd-resource-samples.json').open('x') as out:
        json.dump(samples, out, indent=2)
    print(json.dumps({'status': report['status'], 'resources': report['resources'], 'failure': report.get('failure')}), flush=True)
