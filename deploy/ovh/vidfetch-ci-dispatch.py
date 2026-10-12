#!/usr/bin/python3
"""Root-owned forced command; executed as the unprivileged deployment account."""
import fcntl
import signal
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
match = re.fullmatch(r'receive ([a-f0-9]{40}) ([a-f0-9]{64})', command)
if not match:
    sys.exit('Only a validated release transfer is permitted')
sha, checksum = match.groups()
folder = Path('/var/lib/vidfetch-deploy/incoming')
folder.mkdir(mode=0o700, exist_ok=True)
signal.alarm(300)
lock = open(folder / '.upload-lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX)
if sum(p.stat().st_size for p in folder.glob('*.tgz')) > 700 * 1024**2:
    sys.exit('Upload staging bound reached; administrator must inspect retained uploads')
file = folder / (sha + '.tgz')
# Never overwrite an existing upload or follow a link.
fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
size = 0
hash_value = hashlib.sha256()
with os.fdopen(fd, 'wb') as output:
    while chunk := sys.stdin.buffer.read(65536):
        size += len(chunk)
        if size > 350 * 1024**2:
            sys.exit('Archive exceeds the deployment bound; partial upload retained')
        hash_value.update(chunk)
        output.write(chunk)
if hash_value.hexdigest() != checksum:
    sys.exit('Archive checksum failed; upload retained for inspection')
result = subprocess.run(['/usr/bin/sudo', '-n', '/usr/local/libexec/vidfetch-promote', sha, checksum], check=False)
sys.exit(result.returncode)
