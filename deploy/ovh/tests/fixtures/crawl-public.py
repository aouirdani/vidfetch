"""Crawls the public apex THROUGH Caddy (Caddyfile.public in front of the real Next build) as a search engine would:
every sitemap URL must be indexable, every other prerendered page must stay noindex, downloads must stay closed.
Usage: crawl-public.py BASE_URL PAGES_FILE   (PAGES_FILE: every prerendered page path, one per line)"""
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

base, pages_file = sys.argv[1:3]
fail = 0
count = 0


def ok(text):
    global count
    count += 1
    print(f'ok {count} - {text}')


def bad(text):
    global count, fail
    count += 1
    fail = 1
    print(f'not ok {count} - {text}')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


opener = urllib.request.build_opener(NoRedirect)


def get(path, method='GET'):
    request = urllib.request.Request(base + path, method=method, data=b'{}' if method == 'POST' else None,
                                     headers={'Host': 'vidfetch.app', 'Content-Type': 'application/json'})
    try:
        response = opener.open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read().decode('utf-8', 'replace')


def meta(body, pattern):
    match = re.search(pattern, body)
    return match.group(1) if match else None


status, headers, sitemap = get('/sitemap.xml')
locs = re.findall(r'<loc>([^<]+)</loc>', sitemap)
(ok if status == 200 and 'noindex' not in headers.get('X-Robots-Tag', '') else bad)(f'sitemap.xml served by the frontend through Caddy ({status})')
(ok if len(locs) == 16 and len(set(locs)) == 16 else bad)(f'sitemap lists {len(locs)} distinct canonical URLs (16 expected)')
canonical_paths = set()
for loc in locs:
    path = loc[len('https://vidfetch.app'):] if loc.startswith('https://vidfetch.app/') else None
    if path is None:
        bad(f'sitemap URL outside https://vidfetch.app/: {loc}')
        continue
    canonical_paths.add(urllib.parse.unquote(path))
    status, headers, body = get(path)
    problems = []
    if status != 200:
        problems.append(f'HTTP {status}')
    if 'noindex' in headers.get('X-Robots-Tag', '') or headers.get('WWW-Authenticate'):
        problems.append('noindex header or credentials')
    robots = meta(body, r'<meta name="robots" content="([^"]*)"')
    if robots is None or 'noindex' in robots:
        problems.append(f'robots meta {robots!r}')
    canonical = meta(body, r'<link rel="canonical" href="([^"]*)"')
    if canonical is None or urllib.parse.unquote(canonical).rstrip('/') != urllib.parse.unquote(loc).rstrip('/'):
        problems.append(f'canonical {canonical!r}')
    alternates = set(re.findall(r'<link rel="alternate" hrefLang="([^"]+)"', body))
    if len(alternates) != 9 or 'x-default' not in alternates:
        problems.append(f'{len(alternates)} hreflang alternates')
    if not meta(body, r'<title>([^<]+)</title>') or not meta(body, r'<meta name="description" content="([^"]+)"'):
        problems.append('title or description missing')
    (bad if problems else ok)(f'indexable {urllib.parse.unquote(path)}' + (': ' + ', '.join(problems) if problems else ': 200, index, self-canonical, 9 hreflang, title, description'))

others = [p.strip() for p in open(pages_file) if p.strip() and p.strip() not in canonical_paths]
for path in others:
    status, headers, body = get(urllib.parse.quote(path))
    robots = meta(body, r'<meta name="robots" content="([^"]*)"')
    (ok if status == 200 and robots and 'noindex' in robots else bad)(f'not indexable on purpose {path}: {status}, robots {robots!r}')
(ok if len(others) == 22 else bad)(f'{len(others)} prerendered pages outside the sitemap, all noindex (22 expected)')

status, headers, robots_txt = get('/robots.txt')
(ok if status == 200 and 'Sitemap: https://vidfetch.app/sitemap.xml' in robots_txt and not re.search(r'(?m)^Disallow: */\s*$', robots_txt)
 and 'noindex' not in headers.get('X-Robots-Tag', '') else bad)('robots.txt from the frontend: sitemap published, only private paths disallowed')
for path, expected in (('/fr', '/fr/'), ('/de', '/de/'), ('/legal/', '/legal'), ('/fr/mentions-legales/', '/fr/mentions-legales')):
    status, headers, _ = get(path)
    location = headers.get('Location', '')
    (ok if status == 308 and location in (expected, 'https://vidfetch.app' + expected) else bad)(f'{path} redirects once to {expected} ({status} {location})')
for method, path in (('GET', '/api/download'), ('POST', '/api/download'), ('GET', '/api/fetch-info'), ('POST', '/api/fetch-info'),
                     ('GET', '/api/queue'), ('GET', '/auth/transfer'), ('GET', '/download-helper')):
    status, headers, body = get(path, method)
    (ok if status == 503 and 'noindex' in headers.get('X-Robots-Tag', '') and 'BACKEND_UNAVAILABLE' in body else bad)(f'{method} {path} closed by Caddy (503, noindex)')
status, headers, body = get('/api/download-access', 'POST')
(ok if status == 503 and 'noindex' in headers.get('X-Robots-Tag', '') else bad)(f'POST /api/download-access: the real frontend issues no grant with ready=0 ({status})')
status, headers, body = get('/api/download-access')
(ok if status == 200 and '"available":false' in body and 'noindex' in headers.get('X-Robots-Tag', '') else bad)('GET /api/download-access reports downloads unavailable, noindex')
status, headers, body = get('/api/health')
(ok if '"downloads":{"available":false}' in body else bad)('frontend health: downloads unavailable')
for path in ('/auth/admission', '/auth/deployment', '/internal/state'):
    status, headers, _ = get(path)
    (ok if status == 404 and 'noindex' in headers.get('X-Robots-Tag', '') else bad)(f'{path} stays 404 (noindex)')
status, headers, body = get('/does-not-exist')
(ok if status == 404 and 'noindex' in (meta(body, r'<meta name="robots" content="([^"]*)"') or '') else bad)('unknown page: 404 with a noindex robots meta')
print('ALL PASSED' if not fail else 'FAILURES PRESENT')
sys.exit(fail)
