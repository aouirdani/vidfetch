"""Stand-in for the Next.js frontend in caddy-window-systemd.test.sh: answers the routes the public checks read
exactly as the real build does (verified against `next start` of main): sitemap, robots.txt, indexable pages with a
self canonical, the /fr -> /fr/ redirect. Like the real frontend, downloads are offered only when its environment
(read at start, systemd EnvironmentFile) has VIDFETCH_CONNECTION_READY=1 and the Turnstile keys; a grant request
without the site's browser origin is then refused (403), and with ready=0 every grant request gets 503.
Usage: fake-frontend.py PORT"""
import http.server
import json
import os
import sys

SITE = 'https://vidfetch.app'
OPEN = os.environ.get('VIDFETCH_CONNECTION_READY') == '1' and bool(os.environ.get('TURNSTILE_SITE_KEY')) and bool(os.environ.get('TURNSTILE_SECRET_KEY'))
PAGES = {'/': SITE, '/fr/': SITE + '/fr/', '/legal': SITE + '/legal'}
ROBOTS = 'User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /download-helper\n\nHost: https://vidfetch.app\nSitemap: https://vidfetch.app/sitemap.xml\n'


def page(canonical, robots):
    return (f'<!DOCTYPE html><html lang="en"><head><title>VidFetch</title><link rel="canonical" href="{canonical}"/>'
            f'<meta name="robots" content="{robots}"/></head><body><h1>VidFetch</h1></body></html>')


class Frontend(http.server.BaseHTTPRequestHandler):
    def answer(self, status, body, kind='text/html; charset=utf-8', headers=()):
        data = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/sitemap.xml':
            locs = ''.join(f'<url><loc>{SITE}{p}</loc></url>' for p in PAGES)
            return self.answer(200, f'<?xml version="1.0" encoding="UTF-8"?><urlset>{locs}</urlset>', 'application/xml')
        if path == '/robots.txt':
            return self.answer(200, ROBOTS, 'text/plain')
        if path == '/api/health':
            return self.answer(200, json.dumps({'ok': True, 'service': 'VidFetch', 'frontend': {'ready': True}, 'downloads': {'available': OPEN}}, separators=(',', ':')), 'application/json')
        if path == '/api/download-access':
            config = {'ok': True, 'available': OPEN, 'siteKey': os.environ.get('TURNSTILE_SITE_KEY', '') if OPEN else '',
                      'gatewayOrigin': os.environ.get('VIDFETCH_MEDIA_ORIGIN', '') if OPEN else ''}
            return self.answer(200, json.dumps(config, separators=(',', ':')), 'application/json')
        if path == '/fr':
            return self.answer(308, '', headers=[('Location', '/fr/')])
        if path in PAGES:
            return self.answer(200, page(PAGES[path], 'index, follow'))
        return self.answer(404, page(SITE + path, 'noindex'))

    def do_POST(self):
        if self.path == '/api/download-access':
            if not OPEN:
                return self.answer(503, '{"ok":false,"code":"BACKEND_UNAVAILABLE"}', 'application/json')
            if self.headers.get('Origin') != SITE:
                return self.answer(403, '{"ok":false,"code":"FORBIDDEN_ORIGIN"}', 'application/json')
            return self.answer(403, '{"ok":false,"code":"CHALLENGE_REQUIRED"}', 'application/json')
        return self.answer(405, '')

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Frontend).serve_forever()
