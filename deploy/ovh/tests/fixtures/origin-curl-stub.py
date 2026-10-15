#!/usr/bin/env python3
"""Stands in for curl in common.sh origin() during the stub tests (VM_CURL). It answers the way the Caddy origin
would with the configuration the pointer currently selects, so the result changes when 05-caddy.sh or a restore
moves the pointer.

Table: $ORIGIN_TABLES/<pointer name>, one line per route: HOST METHOD PATH CODE [header|header...]
A header written BODY=<file> is not a header: <file> (under $ORIGIN_TABLES/bodies) is the response body, printed
when curl is not told to discard it (origin_page). A route missing from the table answers STATUS:000.
Each call is appended to $STATE/curl.log; an insecure option (-k / --insecure) is refused outright.
Plain http://HOST:PORT requests (no --resolve, e.g. the frontend on 127.0.0.1:3001) use HOST:PORT as the host.
When $VM_WEB_ENV says VIDFETCH_CONNECTION_READY=1 and $ORIGIN_TABLES/<pointer>.open exists, that table is used.
"""
import os
import sys

args = sys.argv[1:]
with open(os.path.join(os.environ['STATE'], 'curl.log'), 'a') as log:
    log.write(' '.join(args) + '\n')
if '-k' in args or '--insecure' in args:
    sys.exit(60)
method = args[args.index('-X') + 1] if '-X' in args else 'GET'
if '--resolve' in args:
    host = args[args.index('--resolve') + 1].split(':')[0]
    path = args[-1].split(host, 1)[1]
else:
    from urllib.parse import urlsplit
    parts = urlsplit(args[-1]); host, path = parts.netloc, parts.path or '/'
pointer = os.path.basename(os.readlink(os.path.join(os.environ['ORIGIN_BASE'], 'current')))
ready = ''
try:
    with open(os.environ.get('VM_WEB_ENV', '/nonexistent')) as env:
        for line in env:
            if line.startswith('VIDFETCH_CONNECTION_READY='):
                ready = line.strip().split('=', 1)[1]
except OSError:
    pass
name = pointer + '.open' if ready == '1' and os.path.exists(os.path.join(os.environ['ORIGIN_TABLES'], pointer + '.open')) else pointer
answer = None
try:
    with open(os.path.join(os.environ['ORIGIN_TABLES'], name)) as table:
        for line in table:
            parts = line.rstrip('\n').split(' ', 4)
            if parts[:3] == [host, method, path]:
                answer = parts[3:]
except FileNotFoundError:
    pass
if not answer:
    sys.stdout.write('STATUS:000')
    sys.exit(35)
code, fields = answer[0], (answer[1].split('|') if len(answer) > 1 else [])
headers = [f for f in fields if not f.startswith('BODY=')]
body = ''
for f in fields:
    if f.startswith('BODY=') and '-o' not in args:
        with open(os.path.join(os.environ['ORIGIN_TABLES'], 'bodies', f[5:])) as source:
            body = source.read()
sys.stdout.write('HTTP/2 %s\r\n' % code + ''.join(h + '\r\n' for h in headers) + '\r\n' + body + ('\n' if body else '') + 'STATUS:%s' % code)
