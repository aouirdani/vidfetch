#!/usr/bin/env python3
"""Stands in for curl in common.sh origin() during the stub tests (VM_CURL). It answers the way the Caddy origin
would with the configuration the pointer currently selects, so the result changes when 05-caddy.sh or a restore
moves the pointer.

Table: $ORIGIN_TABLES/<pointer name>, one line per route: HOST METHOD PATH CODE [header|header...]
A route missing from the table answers STATUS:000 (no HTTPS answer, e.g. no certificate for that host).
Each call is appended to $STATE/curl.log; an insecure option (-k / --insecure) is refused outright.
"""
import os
import sys

args = sys.argv[1:]
with open(os.path.join(os.environ['STATE'], 'curl.log'), 'a') as log:
    log.write(' '.join(args) + '\n')
if '-k' in args or '--insecure' in args:
    sys.exit(60)
method = args[args.index('-X') + 1] if '-X' in args else 'GET'
host = args[args.index('--resolve') + 1].split(':')[0]
path = args[-1].split(host, 1)[1]
pointer = os.path.basename(os.readlink(os.path.join(os.environ['ORIGIN_BASE'], 'current')))
answer = None
try:
    with open(os.path.join(os.environ['ORIGIN_TABLES'], pointer)) as table:
        for line in table:
            parts = line.rstrip('\n').split(' ', 4)
            if parts[:3] == [host, method, path]:
                answer = parts[3:]
except FileNotFoundError:
    pass
if not answer:
    sys.stdout.write('STATUS:000')
    sys.exit(35)
code, headers = answer[0], (answer[1].split('|') if len(answer) > 1 else [])
sys.stdout.write('HTTP/2 %s\r\n' % code + ''.join(h + '\r\n' for h in headers) + '\r\nSTATUS:%s' % code)
