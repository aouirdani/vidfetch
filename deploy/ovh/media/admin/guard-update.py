#!/usr/bin/env python3
"""Administrator-only maintenance of the CI guard (/etc/vidfetch/ci-web-test-guard.json).

The guard may only get STRICTER or be re-baselined on purpose:
  list                    show guarded files whose current hash differs (names only)
  accept PATH [PATH...]   re-hash entries that ARE guarded and DID change (each one named explicitly)
  add PATH [PATH...]      guard new root-owned files
Entries are never removed, nothing is accepted implicitly, the previous guard is kept as .bak.<time>.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import time

DEFAULT = Path('/etc/vidfetch/ci-web-test-guard.json')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def trusted(path, check_root=True):
    try:
        info = Path(path).lstat()
    except OSError as error:
        raise SystemExit(f'REFUSED: cannot read {path}: {error.strerror}') from None
    if not stat.S_ISREG(info.st_mode):
        raise SystemExit(f'REFUSED: {path} is not a regular file (symlinks are not guarded blindly)')
    if info.st_mode & 0o022 or (check_root and info.st_uid != 0):
        raise SystemExit(f'REFUSED: {path} must be root-owned and not group/world-writable')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--guard', type=Path, default=DEFAULT)
    parser.add_argument('--no-root-check', action='store_true', help='tests only')
    parser.add_argument('action', choices=['list', 'accept', 'add'])
    parser.add_argument('paths', nargs='*')
    args = parser.parse_args(argv)
    if not args.no_root_check and os.geteuid() != 0:
        raise SystemExit('REFUSED: run as root')
    trusted(args.guard, not args.no_root_check)
    data = json.loads(args.guard.read_text())
    files = data['files']
    changed = [p for p, want in sorted(files.items()) if not Path(p).is_file() or digest(p) != want]
    if args.action == 'list':
        for path in changed:
            print('DIFF', path)
        print(f'{len(files)} guarded, {len(changed)} differing')
        return 0
    if not args.paths:
        raise SystemExit('REFUSED: name the files explicitly')
    updated = dict(files)
    for path in args.paths:
        path = str(Path(path))
        if args.action == 'accept':
            if path not in files:
                raise SystemExit(f'REFUSED: {path} is not guarded (use add)')
            if path not in changed:
                raise SystemExit(f'REFUSED: {path} did not change')
            trusted(path, not args.no_root_check)
        else:
            if path in files:
                raise SystemExit(f'REFUSED: {path} already guarded')
            trusted(path, not args.no_root_check)
        updated[path] = digest(path)
    backup = args.guard.with_name(args.guard.name + '.bak.' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.write_bytes(args.guard.read_bytes())
    backup.chmod(0o600)
    descriptor, name = tempfile.mkstemp(dir=args.guard.parent, prefix=args.guard.name + '.new.')
    with os.fdopen(descriptor, 'w') as output:
        json.dump({**data, 'files': updated}, output, indent=2)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(name, 0o600)
    os.replace(name, args.guard)
    assert set(updated) >= set(files)  # never fewer entries
    remaining = [p for p, want in updated.items() if not Path(p).is_file() or digest(p) != want]
    print(f'guard updated: {len(updated)} entries ({len(updated) - len(files)} new), still differing: {len(remaining)}; backup {backup.name}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
