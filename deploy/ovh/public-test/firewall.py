#!/usr/bin/python3
"""Manage only the dedicated Phase 5 ingress table; never flush other rules."""
import os
from pathlib import Path
import subprocess
import sys

assert os.geteuid() == 0 and len(sys.argv) == 2
action = sys.argv[1]
table = ['inet', 'vidfetch_https_test_ingress']
if action == 'safety-rollback' and Path('/run/vidfetch-https-test-confirmed').exists():
    sys.exit(0)
if action in ['rollback', 'safety-rollback']:
    subprocess.run(['systemctl', 'stop', 'vidfetch-caddy.service'], check=True)
    if subprocess.run(['nft', 'list', 'table', *table], capture_output=True).returncode == 0:
        subprocess.run(['nft', 'delete', 'table', *table], check=True)
    print('Public proxy stopped; only the Phase 5 ingress table removed')
elif action == 'apply':
    path = Path('/etc/vidfetch/public-https-test/ingress.nft')
    info = path.lstat()
    assert path.is_file() and not path.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022
    text = path.read_text()
    assert 'flush ruleset' not in text and 'delete table' not in text
    assert text.count('table inet vidfetch_https_test_ingress {') == 1
    if subprocess.run(['nft', 'list', 'table', *table], capture_output=True).returncode == 0:
        text = 'delete table inet vidfetch_https_test_ingress\n' + text
    subprocess.run(['nft', '--check', '--file', '-'], input=text, text=True, check=True)
    subprocess.run(['nft', '--file', '-'], input=text, text=True, check=True)
else:
    raise ValueError('Unsupported firewall action')
