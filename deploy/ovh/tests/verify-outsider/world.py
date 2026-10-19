#!/usr/bin/env python3
"""Stand-in for curl, nc and openssl, so verify-outsider.sh can run offline against a modelled production.

WORLD=public     apex public, downloads closed, dl.vidfetch.app tester-only (every dl connection is reset)
WORLD=public-dl  same apex, dl.vidfetch.app public: the gateway answers exactly as it does in production
                 (anonymous JSON POST: 401 INVALID_ACCESS; POST without a body: 400 INVALID_JSON; other paths 404)
FAULT=<name>     breaks one security property (see FAULTS); verify-outsider.sh must then report a failure.
Every curl call is appended to $CURL_LOG as one JSON object, so the tests can check what was really sent.
"""
import json
import os
import sys

VPS = '15.235.127.165'
WORLD = os.environ.get('WORLD', 'public-dl')
FAULT = os.environ.get('FAULT', '')
FAULTS = {'engine_reached_fetch_info', 'engine_reached_download_sample', 'foreign_401', 'empty_post_401', 'empty_post_200',
          'dl_root_200', 'dl_headers', 'cert', 'apex_direct_200', 'internal_port_open', 'ssh_closed', 'apex_noindex',
          'apex_basic_auth', 'apex_download_open', 'grant_issued', 'health_available', 'dl_unreachable', ''}
assert FAULT in FAULTS, f'unknown FAULT {FAULT}'
SAMPLE_URL = 'https://www.tiktok.com/@example/video/1234567890123456789'
DL_HEADERS = {'content-type': 'application/json', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
              'x-robots-tag': 'noindex, nofollow, noarchive', 'x-content-type-options': 'nosniff'}
PAGES = ['/', '/legal', '/fr/', '/fr/mentions-legales', '/es/', '/es/aviso-legal', '/pt/', '/pt/termos-e-privacidade', '/id/',
         '/id/ketentuan-dan-privasi', '/de/', '/de/rechtliches', '/it/', '/it/note-legali', '/ar/', '/ar/legal']


def refusal(status, code):
    return status, dict(DL_HEADERS), json.dumps({'ok': False, 'code': code, 'error': 'The secure download request could not be completed.'}, separators=(',', ':'))


def gateway(method, path, data):
    """dl.vidfetch.app once public: Caddy exposes only the gateway routes; the gateway reads the body, then the grant."""
    if FAULT == 'dl_unreachable':
        return None
    if path in ('/api/fetch-info', '/api/download') and method == 'POST':
        if data is None:
            if FAULT == 'empty_post_200':
                return 200, dict(DL_HEADERS), '{"ok":true}'
            return refusal(401, 'INVALID_ACCESS') if FAULT == 'empty_post_401' else refusal(400, 'INVALID_JSON')
        json.loads(data)  # the script must send valid JSON
        sample = SAMPLE_URL in data
        if (FAULT == 'engine_reached_fetch_info' and path == '/api/fetch-info') or (FAULT == 'engine_reached_download_sample' and path == '/api/download' and sample):
            return 200, dict(DL_HEADERS), '{"ok":true,"title":"engine answer","formats":[]}'
        if FAULT == 'foreign_401':
            return 401, {'content-type': 'text/plain'}, 'Unauthorized'
        status, headers, body = refusal(401, 'INVALID_ACCESS')
        if FAULT == 'dl_headers':
            headers.pop('x-robots-tag')
        return status, headers, body
    if path == '/' and FAULT == 'dl_root_200':
        return 200, {'content-type': 'text/html'}, '<html></html>'
    return 404, dict(DL_HEADERS), ''


def apex(method, path):
    html_headers = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store'}
    if path in ('/', '/fr/', '/legal'):
        headers = dict(html_headers)
        if FAULT == 'apex_noindex' and path == '/':
            headers['x-robots-tag'] = 'noindex'
        if FAULT == 'apex_basic_auth' and path == '/fr/':
            return 401, {'www-authenticate': 'Basic realm="restricted"'}, ''
        return 200, headers, '<html><head><meta name="robots" content="index, follow"/></head><body>VidFetch</body></html>'
    if path == '/robots.txt':
        return 200, {'content-type': 'text/plain'}, 'User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://vidfetch.app/sitemap.xml\n'
    if path == '/sitemap.xml':
        return 200, {'content-type': 'application/xml'}, '<urlset>' + ''.join(f'<url><loc>https://vidfetch.app{p}</loc></url>' for p in PAGES) + '</urlset>'
    if path == '/fr':
        return 308, {'location': '/fr/'}, ''
    if path in ('/api/download', '/api/fetch-info', '/api/queue', '/auth/transfer', '/download-helper'):
        return (200, {}, '{}') if FAULT == 'apex_download_open' and path == '/api/download' else (503, {'x-robots-tag': 'noindex'}, '')
    if path == '/api/download-access' and method == 'POST':
        return (200, {}, '{"ok":true}') if FAULT == 'grant_issued' else (503, {}, '')
    if path == '/api/health':
        available = 'true' if FAULT == 'health_available' else 'false'
        return 200, {'content-type': 'application/json'}, '{"ok":true,"service":"VidFetch","downloads":{"available":%s}}' % available
    return 404, {}, ''


def respond(method, url, data, resolve):
    scheme, rest = url.split('://', 1)
    host, _, path = rest.partition('/')
    path = '/' + path
    if url == 'https://api.ipify.org':
        return 200, {}, '198.51.100.77'
    if host == 'dl.vidfetch.app':
        if scheme == 'http':
            return 308, {'location': 'https://dl.vidfetch.app/'}, ''
        return gateway(method, path, data) if WORLD == 'public-dl' else None
    if host == 'vidfetch.app' and resolve == f'vidfetch.app:443:{VPS}':
        if WORLD != 'public-dl':
            return None
        return (200, {}, '<html></html>') if FAULT == 'apex_direct_200' else (403, {}, '')
    if host == 'vidfetch.app':
        return apex(method, path)
    return None


def curl(args):
    method, headers, data, out, fmt, dump, resolve, url, head = None, [], None, None, '', None, None, None, False
    it = iter(args)
    for a in it:
        if a in ('-s', '-4'):
            continue
        elif a == '-I':
            head = True
        elif a == '-m':
            next(it)
        elif a == '-o':
            out = next(it)
        elif a == '-w':
            fmt = next(it)
        elif a == '-X':
            method = next(it)
        elif a == '-H':
            headers.append(next(it))
        elif a in ('-d', '--data'):
            data = next(it)
        elif a == '-D':
            dump = next(it)
        elif a == '--resolve':
            resolve = next(it)
        elif a.startswith('-'):
            sys.exit(f'fake curl: unsupported option {a}')
        else:
            url = a
    method = method or ('HEAD' if head else 'POST' if data is not None else 'GET')
    with open(os.environ['CURL_LOG'], 'a') as log:
        log.write(json.dumps({'method': method, 'url': url, 'headers': headers, 'data': data, 'resolve': resolve}) + '\n')
    answer = respond(method, url, data, resolve)
    code, redirect = '000', ''
    if answer is not None:
        status, rheaders, body = answer
        code = str(status)
        if 'location' in rheaders:
            loc = rheaders['location']
            redirect = loc if loc.startswith('http') else url.split('://')[0] + '://' + url.split('://')[1].split('/')[0] + loc
        if dump == '-':
            sys.stdout.write(f'HTTP/2 {status} \r\n' + ''.join(f'{k}: {v}\r\n' for k, v in rheaders.items()) + '\r\n')
        if out is None and not head:
            sys.stdout.write(body)
    sys.stdout.write(fmt.replace('\\n', '\n').replace('%{http_code}', code).replace('%{redirect_url}', redirect))
    sys.exit(0 if answer is not None else 7)


def nc(args):
    assert args[:3] == ['-z', '-w', args[2]] and args[3] == VPS, f'fake nc: unexpected call {args}'
    port = int(args[4])
    open_ports = {22, 80} | ({443} if WORLD == 'public-dl' else set())
    if FAULT == 'internal_port_open':
        open_ports.add(3001)
    if FAULT == 'ssh_closed':
        open_ports.discard(22)
    sys.exit(0 if port in open_ports else 1)


def openssl(args):
    sys.stdin.read()
    assert args[:2] == ['s_client', '-connect'] and '-verify_return_error' in args, f'fake openssl: unexpected call {args}'
    print('Verify return code: 21 (unable to verify the first certificate)' if FAULT == 'cert' or WORLD != 'public-dl' else 'Verification: OK')


if __name__ == '__main__':
    {'curl': curl, 'nc': nc, 'openssl': openssl}[sys.argv[1]](sys.argv[2:])
