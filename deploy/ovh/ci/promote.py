#!/usr/bin/python3
"""Root-owned frontend-only promotion. No repository code is executed as root."""
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import signal
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time

core = runpy.run_path(str(Path(__file__).with_name('release-lib.py')))
BASE = Path('/opt/vidfetch-web-preproduction-20261013')
STORE = Path('/opt/vidfetch-ci-web')
INCOMING = Path('/var/lib/vidfetch-deploy/ci-incoming')
GATE = Path('/etc/vidfetch/ci-web-test-ready')
GUARD = Path('/etc/vidfetch/ci-web-test-guard.json')
# Absent file = the original closed profile. The file can only be created by root.
PROFILE = Path('/etc/vidfetch/ci-media-test-profile.json')
MEDIA_PROFILE = {'profile': 'media-test', 'apex': 'basic-auth-noindex', 'dl': 'testers-only'}
# Public launch: the apex pages are public and indexable, downloads stay closed and dl stays tester-only.
PUBLIC_PROFILE = {'profile': 'public', 'apex': 'public-indexable', 'dl': 'testers-only'}
UNIT = 'vidfetch-web-preproduction-20261013.service'
PORT = 3001
PROTECTED = ['ssh.service', 'vidfetch.service', 'vidfetch-gateway.service',
             'vidfetch-web-candidate.service', 'vidfetch-caddy.service']
ENGINE_FILES = ['backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs']


def trusted(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Unsafe root configuration')


def profile():
    """'closed' (default), 'media-test' or 'public'. Anything unrecognised refuses to deploy.

    media-test never relaxes the guard (file fingerprints, protected units, PIDs, engine
    artifacts) or the public-origin checks; it only stops requiring that the frontend
    reports downloads unavailable, and adds stricter apex checks for the media routes.
    public never relaxes the guard either: it expects the apex pages indexable without
    credentials, still requires downloads reported unavailable, and checks every media,
    API and auth route closed and noindex.
    """
    if not PROFILE.exists():
        return 'closed'
    trusted(PROFILE)
    data = json.loads(PROFILE.read_text())
    if data == MEDIA_PROFILE:
        return 'media-test'
    if data == PUBLIC_PROFILE:
        return 'public'
    raise ValueError('Unrecognised CI profile; administrator review required')


ACTIVE = None  # selected once per run in main(); never re-read mid-transaction


def active_profile():
    return ACTIVE if ACTIVE is not None else profile()


def gate_open():
    if not GATE.exists():
        return False
    trusted(GATE)
    return GATE.read_text().strip() == 'APPROVED_FRONTEND_TEST'


def command(args):
    return subprocess.check_output(args, text=True, timeout=45).strip()


def protected_pids():
    return {unit: command(['/usr/bin/systemctl', 'show', unit, '-pMainPID', '--value']) for unit in PROTECTED}


def guards():
    trusted(GUARD)
    for path, checksum in json.loads(GUARD.read_text())['files'].items():
        if core['digest'](Path(path)) != checksum:
            raise ValueError('Protected configuration changed; administrator review required')
    subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', *PROTECTED,
                    'vidfetch-https-test-ingress.service'], check=True, timeout=10)
    entry = command(['/usr/bin/systemctl', 'show', UNIT, '-pExecStart', '--value'])
    if str(BASE / 'current/app/server.js') not in entry:
        raise ValueError('Unexpected frontend service pointer')


def response(port, path):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        conn.request('GET', path)
        result = conn.getresponse()
        return result.status, result.read(65537)
    finally:
        conn.close()


def health(expected):
    status, body = response(PORT, '/api/health')
    data = json.loads(body)
    available = data.get('downloads', {}).get('available')
    # closed and public: media must be reported unavailable. media-test: operational state, but a real boolean.
    allowed = isinstance(available, bool) if active_profile() == 'media-test' else available is False
    if status != 200 or not data.get('ok') or data.get('release') != expected or not allowed:
        raise ValueError('Frontend readiness or closed-media check failed')
    if response(PORT, '/')[0] != 200 or response(PORT, '/api/download')[0] != 503:
        raise ValueError('Frontend HTTP readiness failed')


def wait_health(expected):
    for _ in range(30):
        try:
            health(expected)
            return
        except (ValueError, OSError, http.client.HTTPException):
            time.sleep(1)
    raise ValueError('Frontend readiness timed out')


ORIGIN_CHECKS = [('GET', '/', 401), ('GET', '/fr/', 401), ('GET', '/api/download', 503),
                 ('GET', '/api/fetch-info', 503), ('GET', '/sitemap.xml', 404)]
# media-test: the site may pass /api/download-access to Next.js, but only behind Basic Auth.
# Every other media route stays closed on the apex, whatever the profile.
MEDIA_CHECKS = [('POST', '/api/download-access', 401), ('GET', '/api/download-access', 401),
                ('GET', '/api/queue', 503), ('GET', '/auth/transfer', 503), ('GET', '/download-helper', 503)]


# public: these pages must answer 200 without credentials and without any noindex (header or meta); everything
# else listed must stay closed and carry X-Robots-Tag noindex.
PUBLIC_PAGES = ['/', '/fr/', '/robots.txt', '/sitemap.xml']
PUBLIC_CHECKS = [('GET', page, 200) for page in PUBLIC_PAGES] + [
    ('GET', '/api/download', 503), ('GET', '/api/fetch-info', 503), ('GET', '/api/queue', 503),
    ('GET', '/auth/transfer', 503), ('GET', '/download-helper', 503), ('POST', '/api/download-access', 503),
    ('GET', '/auth/admission', 404), ('GET', '/internal/state', 404)]


def origin_checks():
    if active_profile() == 'public':
        return PUBLIC_CHECKS
    return ORIGIN_CHECKS + (MEDIA_CHECKS if active_profile() == 'media-test' else [])


def public_page_problem(path, headers, body):
    """Why a public page is not indexable, or None. Body = the first 256 KiB."""
    if 'noindex' in headers.get('X-Robots-Tag', '') or headers.get('WWW-Authenticate'):
        return 'noindex header or credentials requested'
    if re.search(rb'<meta name="robots" content="[^"]*noindex', body):
        return 'robots meta noindex'
    if path == '/robots.txt' and (b'Sitemap: https://vidfetch.app/sitemap.xml' not in body or re.search(rb'(?mi)^Disallow: */\s*$', body)):
        return 'robots.txt does not publish the sitemap or disallows everything'
    if path == '/sitemap.xml' and b'<loc>https://vidfetch.app/</loc>' not in body:
        return 'sitemap without the home page'
    return None


def origin_health():
    # Validate the actual Caddy origin using its public hostname and trusted TLS.
    # Cloudflare can reject requests from the VPS itself independently of origin health.
    for method, path, expected in origin_checks():
        conn = http.client.HTTPSConnection('vidfetch.app', timeout=8)
        try:
            raw = socket.create_connection(('127.0.0.1', 443), timeout=8)
            try:
                conn.sock = ssl.create_default_context().wrap_socket(raw, server_hostname='vidfetch.app')
            except BaseException:
                raw.close()
                raise
            conn.request(method, path, body=b'{}' if method == 'POST' else None)
            result = conn.getresponse()
            body = result.read(262144)
            if active_profile() == 'public' and path in PUBLIC_PAGES and method == 'GET':
                problem = public_page_problem(path, result.headers, body) if result.status == expected else 'status ' + str(result.status)
                if problem:
                    raise ValueError('Public page not indexable: ' + path + ': ' + problem)
                continue
            if result.status != expected or 'noindex' not in result.headers.get('X-Robots-Tag', ''):
                raise ValueError('Origin test protection failed: ' + method + ' ' + path + ' status ' + str(result.status))
            if expected == 401 and 'Basic' not in result.headers.get('WWW-Authenticate', ''):
                raise ValueError('Origin authentication missing')
        finally:
            conn.close()


def restart():
    command(['/usr/bin/systemctl', 'reset-failed', UNIT])
    command(['/usr/bin/systemctl', 'restart', UNIT])


def release_id(path):
    return json.loads((path / 'manifest.json').read_text())['release']


def switch(target, expected, do_restart=restart, check=wait_health, postcheck=origin_health):
    previous = (BASE / 'current').resolve(strict=True)
    pending = STORE / 'pending.json'
    with pending.open('x') as record:
        json.dump({'previous': str(previous), 'target': str(target)}, record)
        record.flush()
        os.fsync(record.fileno())
    try:
        core['pointer'](BASE, target)
        do_restart()
        check(expected)
        postcheck()
    except BaseException:
        core['pointer'](BASE, previous)
        # A repeated cancellation must not interrupt the rollback itself.
        if os.geteuid() == 0:
            for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
                signal.signal(sig, signal.SIG_IGN)
        do_restart()
        check(release_id(previous))
        postcheck()
        pending.unlink()  # Only this transaction's record, after validated recovery.
        print('ROLLBACK VALIDATED: previous frontend restored', file=sys.stderr)
        raise
    # Keep the predecessor independently of the currently served release.
    previous_marker = STORE / 'previous.json'
    temp = STORE / 'previous.next'
    temp.write_text(json.dumps({'path': str(previous), 'release': release_id(previous)}))
    os.replace(temp, previous_marker)
    pending.unlink()
    return previous


def verify(sha, checksum):
    if shutil.disk_usage(STORE).free < 3 * 1024**3:
        raise ValueError('Less than 3 GiB free; releases preserved')
    source = INCOMING / (sha + '.tgz')
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_size > 350 * 1024**2:
        os.close(fd)
        raise ValueError('Invalid upload')
    stage = Path(tempfile.mkdtemp(prefix='verify-', dir=STORE / 'staging'))
    with os.fdopen(fd, 'rb') as incoming, (stage / 'archive.tgz').open('xb') as output:
        shutil.copyfileobj(incoming, output, 65536)
    if core['digest'](stage / 'archive.tgz') != checksum:
        raise ValueError('Copied upload checksum mismatch; evidence retained')
    app = stage / 'release'
    app.mkdir()
    manifest = core['extract_checked'](stage / 'archive.tgz', app, sha)
    current = json.loads(((BASE / 'current').resolve(strict=True) / 'manifest.json').read_text())
    if any(manifest['files'].get(name) != current['files'].get(name) for name in ENGINE_FILES):
        raise ValueError('Engine/gateway artifact changed; separate administrator review required')
    target = STORE / 'releases' / sha
    if target.exists():
        # Reruns are allowed only for exactly the same immutable contents.
        old = json.loads((target / 'manifest.json').read_text())
        actual = {str(p.relative_to(target)) for p in target.rglob('*') if p.is_file()}
        if old != manifest or actual != set(manifest['files']) | {'manifest.json'} or any(core['digest'](target / name) != value for name, value in manifest['files'].items()):
            raise ValueError('Existing release differs; no overwrite permitted')
    else:
        app.rename(target)
    # No pruning, no removal of uploads, staging evidence or previous releases.
    return target


def cancelled(signum, _frame):
    raise RuntimeError('Deployment interrupted; rollback required')


def main():
    if os.geteuid() != 0:
        raise ValueError('Root helper required')
    global ACTIVE
    ACTIVE = profile()  # an invalid profile file refuses before anything is changed
    args = sys.argv[1:]
    if args == ['status']:
        print(json.dumps({'gateOpen': gate_open(), 'profile': profile(), 'release': release_id(BASE / 'current'),
                          'targetPort': PORT, 'pendingRecovery': (STORE / 'pending.json').exists()}))
        return
    if args == ['ready']:
        if not gate_open():
            raise ValueError('Frontend deployment gate is closed')
        guards()
        return
    if len(args) != 3 or args[0] not in ['verify', 'deploy'] or not re.fullmatch('[a-f0-9]{40}', args[1]) or not re.fullmatch('[a-f0-9]{64}', args[2]):
        raise ValueError('Invalid operation or release identifiers')
    mode, sha, checksum = args
    if mode == 'deploy' and not gate_open():
        raise ValueError('Frontend deployment gate is closed')
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, cancelled)
    with (STORE / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (STORE / 'pending.json').exists():
            raise ValueError('Unfinished transaction; administrator recovery required')
        guards()
        before = protected_pids()
        target = verify(sha, checksum)
        if mode == 'deploy':
            origin_health()
            def after_switch():
                origin_health()
                guards()
                if protected_pids() != before:
                    raise ValueError('Protected service PID changed during promotion')
            if (BASE / 'current').resolve() != target:
                switch(target, sha, postcheck=after_switch)
            else:
                wait_health(sha)
                origin_health()
        guards()
        if protected_pids() != before:
            raise ValueError('A protected service restarted; administrator inspection required')
        print(json.dumps({'operation': mode, 'release': sha, 'validated': True,
                          'activated': mode == 'deploy', 'protectedServicesUnchanged': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not serialize environment, HTTP bodies, request headers or secrets.
        print('CI helper refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
