#!/usr/bin/python3
"""Read-only final audit with strict local origin TLS verification; secret-safe."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import urllib.request

assert os.geteuid() == 0
backup = Path('/var/backups/vidfetch-public-https-20261013-uNFJxuZ9')
before = json.loads((backup / 'before.json').read_text())
def command(args):
    result = subprocess.run(args, text=True, capture_output=True)
    return {'code': result.returncode, 'output': result.stdout.strip()}
def unit(name):
    return dict(line.split('=', 1) for line in command(['systemctl', 'show', name, '-pActiveState', '-pUnitFileState', '-pMainPID', '-pMemoryCurrent', '-pMemoryPeak', '-pCPUUsageNSec', '-pNRestarts'])['output'].splitlines())
units = {name: unit(name) for name in [*before['protectedUnits'], 'vidfetch-caddy.service', 'vidfetch-https-test-ingress.service']}
preservation = {
    'protectedPidsUnchanged': all(units[name]['MainPID'] == old['MainPID'] for name, old in before['protectedUnits'].items()),
    'originalFileHashesUnchanged': all(hashlib.sha256(Path(name).read_bytes()).hexdigest() == old for name, old in before['protectedFileHashes'].items()),
    'originalFrontendPointerUnchanged': str(Path('/opt/vidfetch-web/current').resolve()) == before['frontendCurrent'],
}
rules = json.loads(command(['nft', '-j', 'list', 'ruleset'])['output'])
old_rules = [row for row in before['nftables']['nftables'] if 'metainfo' not in row]
preservation['existingNftRulesUnchanged'] = all(row in rules['nftables'] for row in old_rules)
assert all(preservation.values())
certificates = []
for host in ['vidfetch.app', 'www.vidfetch.app']:
    with socket.create_connection(('127.0.0.1', 443), timeout=5) as raw:
        with ssl.create_default_context().wrap_socket(raw, server_hostname=host) as tls:
            certificates.append({'host': host, 'chainAndHostnameVerified': True, 'protocol': tls.version(), 'certificate': tls.getpeercert()})
health = {}
for port in [3000, 3001, 8788]:
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=5) as response:
        health[str(port)] = json.load(response)
auth_parts = Path('/etc/vidfetch/public-https-test/auth.caddy').read_text().splitlines()[1].split()
logs = command(['journalctl', '-u', 'vidfetch-caddy.service', '--no-pager', '-o', 'json'])['output']
rows = [json.loads(line) for line in logs.splitlines() if line.startswith('{')]
log_summary = {'entries': len(rows), 'userOrHashDetected': any(part in logs for part in auth_parts),
    'certificateObtained': sum('certificate obtained successfully' in row.get('MESSAGE', '') for row in rows),
    'renewalMaintenanceStarted': any('started background certificate maintenance' in row.get('MESSAGE', '') for row in rows),
    'publicRenewalPerformed': False}
assert log_summary['userOrHashDetected'] is False
report = {'timestamp': datetime.now(timezone.utc).isoformat(), 'preservation': preservation, 'units': units,
    'originTLS': certificates, 'health': health, 'ports': command(['ss', '-H', '-lntu']), 'nftables': rules,
    'memory': command(['free', '-m']), 'disk': command(['df', '-h', '/']), 'journal': log_summary,
    'engineChildren': command(['pgrep', '-x', 'yt-dlp|ffmpeg|ffprobe']),
    'ciRootGatePresent': Path('/etc/vidfetch/full-migration-ready').exists(),
    'proxyConfigHash': hashlib.sha256(Path('/etc/vidfetch/public-https-test/Caddyfile').read_bytes()).hexdigest()}
print(json.dumps(report, indent=2))
