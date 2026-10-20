#!/usr/bin/python3
"""ADMINISTRATOR-ONLY, reviewed activation of a frontend release whose GATEWAY bundle changed.

The CI promoter refuses such a release on purpose ("Engine/gateway artifact changed; separate administrator review
required") and keeps doing so: this tool does not change it, is not in the CI account's sudo rules, and refuses to run
for that account. It is the separate review, run by an administrator in a root shell:

  sudo python3 activate-reviewed.py check    SHA ARCHIVE_SHA256 GATEWAY_SHA256   every check, release extracted, no switch
  sudo python3 activate-reviewed.py activate SHA ARCHIVE_SHA256 GATEWAY_SHA256   the same checks, then the promoter's switch

  SHA             the commit the CI built: 40 hex characters, also the release id written in the manifest
  ARCHIVE_SHA256  the archive checksum published by that CI build (it reached the VPS through operation=verify)
  GATEWAY_SHA256  the gateway bundle the administrator rebuilt INDEPENDENTLY from SHA (node backend/gateway/build.mjs)

It loads the INSTALLED promoter (/usr/local/libexec/vidfetch-ci/promote.py) and uses its archive checks, its lock,
guard, health and origin checks, and its switch: pending.json and previous.json are written exactly as for a CI
deployment, so rollback.py restores the previous release. Of the promoter's rules, exactly one is replaced, for this
release only: its gateway may differ from the active release's, if and only if it equals GATEWAY_SHA256. Everything
else is the promoter's rule or stricter:
  - the engine must be unchanged: new manifest = active manifest = the bundle the engine process runs;
  - the gateway in service must be the active release's gateway (no prior drift);
  - downloads must be closed (ready=0 and the "public" or "closed" CI profile): from this activation until
    08-gateway.sh upgrade, the frontend and the gateway come from different releases, and 11-downloads.sh open
    refuses until they match again;
  - the guard (environment files with the secrets, units, configuration) must hold before and after; Caddy (pointer
    and served file), the nftables rules, sshd_config, the protected services' PIDs and the engine and gateway
    bundles must be identical after the switch, or the switch is undone by the promoter's own rollback;
  - one operation at a time: the promoter's lock and the administrator toolkit's lock are both held.
Each run leaves a root-only record under the promoter's store (reviewed/); no secret is read into it or printed.

Exit status: the state actually reached (also written in the record as exit_code).
  0  checked, nothing switched; or activated and re-checked
  1  refused: nothing switched (arguments, access, a lock held, any pre-check, an interruption before the switch)
  2  activated, but the final re-check failed or did not run: the new release stays active, downloads stay closed;
     inspect, and to go back: rollback.py
  3  failed during the switch; the previous release is active and validated by the promoter's own rollback
  4  failed, and the restoration is NOT validated (pending.json kept, or another release is active): downloads stay
     closed; inspect, then rollback.py. Also any unexpected error, whose state is unknown.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import sys
import tempfile
import time

HELPER = Path('/usr/local/libexec/vidfetch-ci/promote.py')
WEB_ENV = Path('/etc/vidfetch/web.env')
TOOLKIT_LOCK = Path('/run/vidfetch-media-test.lock')
CADDY_BASE = Path('/etc/vidfetch/public-https-test')
SSHD_CONFIG = Path('/etc/ssh/sshd_config')
NFT = '/usr/sbin/nft'
SYSTEMCTL = '/usr/bin/systemctl'
PROC = Path('/proc')
ENGINE_UNIT, GATEWAY_UNIT = 'vidfetch.service', 'vidfetch-gateway.service'
ENGINE, GATEWAY = 'backend/vidfetch-ovh.cjs', 'backend/vidfetch-gateway.cjs'
CLOSED_PROFILES = ('closed', 'public')   # the profiles under which the frontend must report downloads unavailable
CI_ACCOUNT = 'vidfetch-deploy'


class Refused(Exception):
    """A precondition does not hold: nothing was switched."""


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        while chunk := stream.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_promoter(path=HELPER):
    try:
        info = path.lstat()
    except OSError as error:
        raise Refused(f'{path}: {error.strerror}') from None
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise Refused(f'{path} is not a root-owned, non-writable promoter')
    spec = importlib.util.spec_from_file_location('vidfetch_installed_promote', path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as error:   # nothing changed yet
        raise Refused(f'{path} cannot be loaded: {error}') from None
    return module


def administrator():
    if os.geteuid() != 0:
        raise Refused('run as root (sudo)')
    if os.environ.get('SUDO_USER') == CI_ACCOUNT or os.environ.get('USER') == CI_ACCOUNT or 'SSH_ORIGINAL_COMMAND' in os.environ:
        raise Refused('administrator access required: never through the CI account or its forced command')


def arguments(argv):
    if len(argv) != 4 or argv[0] not in ('check', 'activate'):
        raise Refused('usage: activate-reviewed.py check|activate SHA ARCHIVE_SHA256 GATEWAY_SHA256')
    mode, sha, archive, gateway = argv
    if not re.fullmatch('[a-f0-9]{40}', sha) or not re.fullmatch('[a-f0-9]{64}', archive) or not re.fullmatch('[a-f0-9]{64}', gateway):
        raise Refused('SHA must be 40 and both checksums 64 lowercase hexadecimal characters')
    return mode, sha, archive, gateway


def lock(path):
    try:
        handle = open(path, 'a')
    except OSError as error:
        raise Refused(f'{path}: {error.strerror}') from None
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise Refused(f'another operation holds {path}: wait for it')
    return handle


def ready_value(path=None):
    path = path or WEB_ENV
    try:
        values = [line.split('=', 1)[1] for line in path.read_text().splitlines() if line.startswith('VIDFETCH_CONNECTION_READY=')]
    except OSError:
        return ''
    return values[-1] if values else ''


def downloads_problem(p):
    ready, profile = ready_value(), p.profile()
    if ready != '0' or profile not in CLOSED_PROFILES:
        return f'downloads must be closed (ready={ready or "unset"}, CI profile {profile})'
    return None


def downloads_closed(p):
    problem = downloads_problem(p)
    if problem:
        raise Refused(problem + ': 11-downloads.sh close, then guard-update.py accept /etc/vidfetch/web.env')


def running_bundle(p, unit):
    """The bundle the unit's MAIN PROCESS executes, and the one its ExecStart names: they must agree."""
    configured = re.findall(r'/[^ ;]*\.cjs', p.command([SYSTEMCTL, 'show', unit, '-pExecStart', '--value']))
    pid = p.command([SYSTEMCTL, 'show', unit, '-pMainPID', '--value'])
    if not configured or not pid.isdigit() or pid == '0':
        raise Refused(f'{unit}: no running bundle found')
    try:
        argv = (PROC / pid / 'cmdline').read_bytes().split(b'\0')
    except OSError:
        raise Refused(f'{unit}: its process cannot be inspected') from None
    executed = [a.decode() for a in argv if a.endswith(b'.cjs')]
    if executed[:1] != configured[:1]:
        raise Refused(f'{unit}: the running process does not execute the configured bundle (restart pending?)')
    return digest(configured[0])


def nft_rules(p):
    """Rules of every table; dynamic set elements (per-address limits) are left out, they change with traffic."""
    text = p.command([NFT, '-s', 'list', 'ruleset'])
    return hashlib.sha256(re.sub(r'\n[ \t]*elements = \{[^}]*\}', '', text).encode()).hexdigest()


def infrastructure(p):
    pointer = os.readlink(CADDY_BASE / 'current')
    return {
        'caddy_pointer': pointer,
        'caddy_config': digest(CADDY_BASE / pointer),
        'nft_rules': nft_rules(p),
        'sshd_config': digest(SSHD_CONFIG),
        'protected_pids': p.protected_pids(),
        'engine_bundle': running_bundle(p, ENGINE_UNIT),
        'gateway_bundle': running_bundle(p, GATEWAY_UNIT),
    }


def unchanged(before, after):
    changed = sorted(k for k in before if before[k] != after.get(k))
    if changed:
        raise ValueError('changed during the activation: ' + ', '.join(changed))


def reviewed_release(p, sha, archive, gateway, infra):
    """The promoter's archive checks, with its engine/gateway rule replaced by the reviewed one. Returns the release."""
    if (p.STORE / 'pending.json').exists():
        raise Refused('unfinished promotion (pending.json): run rollback.py first, then retry')
    if shutil.disk_usage(p.STORE).free < 3 * 1024**3:
        raise Refused('less than 3 GiB free in the release store')
    current_dir = (p.BASE / 'current').resolve(strict=True)
    if current_dir == p.STORE / 'releases' / sha:
        raise Refused('this release is already the active one: nothing to do (08-gateway.sh check tells whether the gateway follows)')
    p.trusted(current_dir / 'manifest.json')
    current = json.loads((current_dir / 'manifest.json').read_text())['files']
    if infra['engine_bundle'] != current.get(ENGINE):
        raise Refused('the engine in service is not the active release engine: out of scope')
    if infra['gateway_bundle'] != current.get(GATEWAY):
        raise Refused('the gateway in service is not the active release gateway: settle that with 08-gateway.sh first')
    source = p.INCOMING / (sha + '.tgz')
    try:
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise Refused(f'no uploaded archive {source.name}: transfer it with the CI operation=verify first') from None
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_size > 350 * 1024**2:
        os.close(fd)
        raise Refused('invalid upload')
    stage = Path(tempfile.mkdtemp(prefix='reviewed-', dir=p.STORE / 'staging'))
    with os.fdopen(fd, 'rb') as incoming, (stage / 'archive.tgz').open('xb') as output:
        shutil.copyfileobj(incoming, output, 65536)
    if p.core['digest'](stage / 'archive.tgz') != archive:
        raise Refused('the uploaded archive does not have the CI checksum; evidence retained in ' + str(stage))
    app = stage / 'release'
    app.mkdir()
    try:
        manifest = p.core['extract_checked'](stage / 'archive.tgz', app, sha)   # release id = SHA, every file = manifest
    except ValueError as error:
        raise Refused(f'archive refused by the promoter checks: {error}') from None
    files = manifest['files']
    if files.get(ENGINE) != current.get(ENGINE):
        raise Refused('the engine bundle changed: not covered by this review')
    if files.get(GATEWAY) == current.get(GATEWAY):
        raise Refused('the gateway bundle did not change: use the CI promoter')
    if files.get(GATEWAY) != gateway or p.core['digest'](app / GATEWAY) != gateway:
        raise Refused('the release gateway does not match the independently built fingerprint')
    target = p.STORE / 'releases' / sha
    if target.exists():
        old = json.loads((target / 'manifest.json').read_text())
        actual = {str(f.relative_to(target)) for f in target.rglob('*') if f.is_file()}
        if old != manifest or actual != set(files) | {'manifest.json'} or any(p.core['digest'](target / n) != v for n, v in files.items()):
            raise Refused('a different release already exists under this SHA; no overwrite')
    else:
        app.rename(target)
    return target, current_dir


def reached(p, target, previous):
    """After a failure in or right after the switch, the state actually left, read from the promoter's own record and
    pointer: its switch removes pending.json only once the restored previous release passed its checks, or once
    previous.json names the predecessor of a completed switch. Returns (exit status, why not validated)."""
    if (p.STORE / 'pending.json').exists():
        return 4, 'pending.json kept'
    try:
        active = (p.BASE / 'current').resolve(strict=True)
    except OSError as error:
        return 4, f'active release unreadable: {error.strerror}'
    if active == previous:
        return 3, None
    if active == target:
        return 2, None
    return 4, f'unexpected active release {active.name}'


def record(p, entry):
    folder = p.STORE / 'reviewed'
    folder.mkdir(mode=0o700, exist_ok=True)
    os.chmod(folder, 0o700)
    now = time.time_ns()   # unique and in chronological order, even for two runs within the same second
    name = folder / f"{time.strftime('%Y%m%dT%H%M%S', time.gmtime(now // 10**9))}.{now % 10**9:09d}Z-{entry['release'][:12]}-{entry['mode']}.json"
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(entry, output, indent=2, sort_keys=True)
    return name


def run(argv, p=None):
    mode, sha, archive, gateway = arguments(argv)
    administrator()
    p = p or load_promoter()
    entry = {'mode': mode, 'release': sha, 'archive_sha256': archive, 'gateway_sha256': gateway,
             'administrator': os.environ.get('SUDO_USER', 'root'), 'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    signals = (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)
    saved = {sig: signal.getsignal(sig) for sig in signals}
    phase = 'pre'   # pre: nothing changed yet | switch: the promoter's switch decides | post: switched, nothing undone | done

    def finish(code, result):
        entry['result'], entry['exit_code'] = result, code
        return code

    with lock(p.STORE / 'lock'), lock(TOOLKIT_LOCK):
        try:
            for sig in signals:   # an interruption becomes an exception: recorded, and undone by the switch when inside it
                signal.signal(sig, p.cancelled)
            try:   # everything before the switch: a failure here changes nothing and is a refusal
                if mode == 'activate':
                    downloads_closed(p)
                p.guards()
                before = infrastructure(p)
                target, current_dir = reviewed_release(p, sha, archive, gateway, before)
                entry.update(previous_release=p.release_id(current_dir), engine_sha256=before['engine_bundle'],
                             gateway_in_service=before['gateway_bundle'], infrastructure_before=before)
                if mode == 'activate':
                    p.origin_health()
            except Refused:
                raise
            except Exception as error:
                raise Refused(f'pre-check failed: {error}') from None
            if mode == 'check':
                print(f'CHECKED: release {sha[:12]} is in {target}; gateway {gateway[:16]}… reviewed; engine unchanged; nothing switched')
                return finish(0, 'checked: ready for activation')

            def after_switch():
                """Run by the promoter's switch after the new release starts (any exception restores the previous one)
                and again after that restoration, where only the previous release's own health matters."""
                p.origin_health()
                p.guards()
                if (p.BASE / 'current').resolve() != target:
                    return
                problem = downloads_problem(p)
                if problem:
                    raise ValueError(problem)
                unchanged(before, infrastructure(p))

            phase = 'switch'
            p.switch(target, sha, do_restart=p.restart, check=p.wait_health, postcheck=after_switch)
            # From here the release is active and previous.json names its predecessor: nothing is undone automatically.
            phase = 'post'
            for sig in signals:
                signal.signal(sig, signal.SIG_IGN)
            try:
                p.guards()
                unchanged(before, infrastructure(p))
            except Exception as error:
                print(f'ACTIVATED, but the final re-check failed: {error}\nDownloads stay closed. Inspect; to go back: '
                      'sudo /usr/local/libexec/vidfetch-ci/rollback.py', file=sys.stderr)
                return finish(2, f'activated; final re-check FAILED: {error}')
            phase = 'done'
            finish(0, 'activated')
            print(f'ACTIVATED: frontend release {sha[:12]} (previous {entry["previous_release"][:12]}, kept for rollback.py).')
            print('The gateway in service is still the previous one; downloads stay closed. Next, on this VPS:')
            print(f'  sudo bash 08-gateway.sh check   {gateway}')
            print(f'  sudo bash 08-gateway.sh upgrade {gateway}')
            print('then reconcile the guard, test, and only then 11-downloads.sh open (it refuses while the gateway differs).')
            return 0
        except Refused as error:
            print(f'REFUSED: {error}', file=sys.stderr)
            return finish(1, f'refused: {error}')
        except BaseException as error:   # never re-raised: the exit status is the state actually reached
            if phase == 'pre':   # e.g. a check calling sys.exit: nothing switched
                print(f'REFUSED: interrupted before the switch: {error!r}', file=sys.stderr)
                return finish(1, f'refused: interrupted before the switch: {error!r}')
            if phase == 'done':   # activated and re-checked; only the report failed
                return 0
            code, why = reached(p, target, current_dir)
            if code == 2:   # the switch completed; the failure came before or during the final re-check
                print(f'ACTIVATED, but the final re-check did not complete: {error}\nDownloads stay closed. Inspect; to go back: '
                      'sudo /usr/local/libexec/vidfetch-ci/rollback.py', file=sys.stderr)
                return finish(2, f'activated; final re-check FAILED (interrupted): {error}')
            if code == 3:
                print(f'FAILED, previous release restored and validated: {error}', file=sys.stderr)
                return finish(3, f'failed and rolled back: {error}')
            print(f'FAILED and the restoration of the previous release could not be validated ({why}): {error}\n'
                  'Downloads stay closed. Inspect, then run: sudo /usr/local/libexec/vidfetch-ci/rollback.py', file=sys.stderr)
            return finish(4, f'failed; rollback NOT validated ({why}): {error}')
        finally:
            for sig in signals:   # the record is written whatever arrives now
                signal.signal(sig, signal.SIG_IGN)
            entry['ended'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            try:
                print('record:', record(p, entry))
            except Exception as error:
                print(f'WARNING: record not written: {error}', file=sys.stderr)
            for sig, handler in saved.items():
                signal.signal(sig, handler)


if __name__ == '__main__':
    try:
        status = run(sys.argv[1:])
    except Refused as error:   # arguments, access, promoter or lock: before anything changed
        print(f'REFUSED: {error}', file=sys.stderr)
        status = 1
    except Exception as error:   # not expected: the state is unknown, so it is reported as not validated
        print(f'FAILED, state unknown: {error}\nDownloads stay closed. Inspect pending.json and the active release first.', file=sys.stderr)
        status = 4
    sys.exit(status)
