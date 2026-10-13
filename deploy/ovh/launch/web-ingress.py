#!/usr/bin/python3
"""Approved future use only: atomically replace this single dedicated nft table."""
import os
from pathlib import Path
import subprocess

assert os.geteuid() == 0
path = Path('/etc/vidfetch/web-ingress.nft')
info = path.lstat()
assert path.is_file() and not path.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022
text = path.read_text()
assert text.startswith('# PREPARED ONLY.') and text.count('table inet vidfetch_web_ingress {') == 1
assert 'flush ruleset' not in text and 'delete table' not in text
existing = subprocess.run(['/usr/sbin/nft', 'list', 'table', 'inet', 'vidfetch_web_ingress'], capture_output=True)
if existing.returncode == 0:
    text = 'delete table inet vidfetch_web_ingress\n' + text
subprocess.run(['/usr/sbin/nft', '--check', '--file', '-'], input=text, text=True, check=True)
subprocess.run(['/usr/sbin/nft', '--file', '-'], input=text, text=True, check=True)
