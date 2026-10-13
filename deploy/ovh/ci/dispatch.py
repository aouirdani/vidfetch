#!/usr/bin/python3
"""Forced SSH command: status, verify archive, or gated frontend deployment."""
import fcntl
import hashlib
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile

FOLDER = Path('/var/lib/vidfetch-deploy/ci-incoming')
HELPER = '/usr/local/libexec/vidfetch-ci/promote.py'


def helper(*args):
    return subprocess.run(['/usr/bin/sudo', '-n', HELPER, *args], check=False).returncode


def main():
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    if command == 'status':
        return helper('status')
    match = re.fullmatch(r'(verify|receive) ([a-f0-9]{40}) ([a-f0-9]{64})', command)
    if not match:
        sys.exit('Only status or a bounded release transfer is permitted')
    mode, sha, checksum = match.groups()
    if mode == 'receive' and helper('ready') != 0:
        return 1
    signal.alarm(600)
    with (FOLDER / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sum(p.stat().st_size for p in FOLDER.iterdir() if p.is_file()) > 700 * 1024**2:
            sys.exit('Upload storage bound reached; administrator inspection required')
        fd, name = tempfile.mkstemp(prefix='upload-', dir=FOLDER)
        partial = Path(name)
        size = 0
        digest = hashlib.sha256()
        with os.fdopen(fd, 'wb') as output:
            while chunk := sys.stdin.buffer.read(65536):
                size += len(chunk)
                if size > 350 * 1024**2:
                    sys.exit('Archive exceeds upload bound; partial evidence retained')
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != checksum:
            sys.exit('Archive checksum failed; evidence retained')
        target = FOLDER / (sha + '.tgz')
        if target.exists() or target.is_symlink():
            if target.is_symlink() or not target.is_file():
                sys.exit('Unsafe existing upload')
            with target.open('rb') as existing:
                same = hashlib.file_digest(existing, 'sha256').hexdigest() == checksum
            if not same:
                sys.exit('Existing upload differs; no overwrite permitted')
            partial.unlink()  # Only this invocation's duplicate temporary copy.
        else:
            partial.rename(target)
        signal.alarm(0)
        return helper('verify' if mode == 'verify' else 'deploy', sha, checksum)


if __name__ == '__main__':
    sys.exit(main())
