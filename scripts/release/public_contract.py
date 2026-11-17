#!/usr/bin/env python3
"""Browser-free production snapshot and release checks. No indexing submissions."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET

ORIGIN = 'https://vidfetch.app'
WORKERS = 12
URL_TIMEOUT = 30
TIMINGS = []
TIMING_LOCK = threading.Lock()
SAMPLE = ['/', '/fr', '/es', '/pt', '/id', '/de', '/it', '/ar',
          '/fr/telecharger-video-tiktok', '/about', '/blog/why-cant-i-save-tiktok']


def href(value):
    # Match HTMLAnchorElement.href/HTMLLinkElement.href used by the existing
    # browser audit: https://host and https://host/ serialize to the same URL.
    parts = urlsplit(value)
    assert parts.scheme == 'https' and parts.netloc, 'canonical/alternate must be absolute HTTPS'
    return urlunsplit((parts.scheme, parts.netloc, quote(parts.path or '/', safe="/:@-._~!$&'()*+,;=%"), parts.query, parts.fragment))


class Page(HTMLParser):
    def __init__(self, path='/'):
        super().__init__(convert_charrefs=True)
        self.data = dict(title=[], h1=[], description=[], canonical=[], hreflang={}, robots=[], adsense=[], json=[], links={})
        self.capture = None
        self.parts = []
        self.json_script = False
        self.script = False
        self.script_parts = []
        self.article = {}
        self.ad_scripts = 0
        self.in_byline = False
        self.url = ORIGIN + path

    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        if 'data-guide-byline' in a:
            self.in_byline = True
        if tag in ('title', 'h1'):
            self.capture, self.parts = tag, []
        if tag == 'meta':
            key = {'description': 'description', 'robots': 'robots', 'google-adsense-account': 'adsense'}.get(a.get('name', '').lower())
            if key:
                self.data[key].append(a.get('content', ''))
        if tag == 'link':
            rel = a.get('rel', '').lower().split()
            if 'canonical' in rel:
                self.data['canonical'].append(href(a.get('href', '')))
            if 'alternate' in rel and 'hreflang' in a:
                assert a['hreflang'] not in self.data['hreflang'], 'duplicate hreflang'
                self.data['hreflang'][a['hreflang']] = href(a.get('href', ''))
        if tag == 'a' and a.get('href'):
            target = urlsplit(urljoin(self.url, a['href']))
            if target.scheme + '://' + target.netloc == ORIGIN:
                path = urlsplit(href(urljoin(self.url, a['href']))).path
                self.data['links'][path] = self.data['links'].get(path, 0) + 1
        if tag == 'script':
            self.script, self.script_parts = True, []
            self.ad_scripts += int(bool(re.search(r'googlesyndication\.com|doubleclick\.net|googleadservices\.com', a.get('src', ''), re.I)))
            if a.get('type') == 'application/ld+json':
                self.json_script, self.parts = True, []
        if tag == 'article':
            self.article = a
        if tag == 'time' and self.in_byline and 'datetime' in a:
            self.article['has-time'] = True

    def handle_endtag(self, tag):
        if tag == 'script' and self.script:
            self.ad_scripts += int(bool(re.search(r'adsbygoogle|google_ad_client|googlesyndication\.com|googleadservices\.com', ''.join(self.script_parts), re.I)))
            self.script, self.script_parts = False, []
        if tag == 'p':
            self.in_byline = False
        if tag == self.capture:
            self.data[tag].append(''.join(self.parts))
            self.capture, self.parts = None, []
        if tag == 'script' and self.json_script:
            self.data['json'].append(json.loads(''.join(self.parts)))
            self.json_script, self.parts = False, []

    def handle_data(self, value):
        if self.script:
            self.script_parts.append(value)
        if self.capture or self.json_script:
            self.parts.append(value)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def get(base, path, expected=200, timeout=None):
    started = time.monotonic()
    headers_at = None
    status = None
    error_text = None
    request = urllib.request.Request(base + path, headers={'User-Agent': 'VidFetch-release-check/1.0'})
    try:
        try:
            response = urllib.request.build_opener(NoRedirect).open(request, timeout=timeout or URL_TIMEOUT)
        except urllib.error.HTTPError as error:
            if error.code != expected:
                raise
            response = error
        with response:
            headers_at = time.monotonic()
            status = response.status
            assert status == expected, (path, status)
            body = response.read(2 * 1024 * 1024 + 1)
            assert len(body) <= 2 * 1024 * 1024, (path, 'response too large')
            return response.headers, body
    except Exception as error:
        error_text = str(error)
        phase = 'body' if headers_at else 'connection/headers'
        raise RuntimeError(f'{path}: {phase} failed after {time.monotonic()-started:.3f}s: {error}') from error
    finally:
        ended = time.monotonic()
        row = {'path': path, 'status': status, 'totalMs': round((ended-started)*1000, 2),
               'headersMs': round((headers_at-started)*1000, 2) if headers_at else None,
               'bodyMs': round((ended-headers_at)*1000, 2) if headers_at else None, 'error': error_text}
        with TIMING_LOCK:
            TIMINGS.append(row)


def wait_ready(base, expected_release=None, timeout=30):
    started = time.monotonic()
    last = None
    while time.monotonic() - started < timeout:
        try:
            data = json.loads(get(base, '/api/health', timeout=min(3, timeout))[1])
            if data.get('ok') and data.get('frontend', {}).get('ready') and (not expected_release or data.get('release') == expected_release):
                return data['release'], round(time.monotonic()-started, 3)
            last = 'health not ready or wrong release'
        except Exception as error:
            last = str(error)
        time.sleep(.2)
    raise RuntimeError(f'health readiness failed after {time.monotonic()-started:.3f}s: {last}')


def start_deadline(seconds):
    def expired():
        print(f'PUBLIC CONTRACT FAILED: global deadline {seconds}s exceeded', file=sys.stderr, flush=True)
        print(json.dumps({'completedRequests': len(TIMINGS), 'slowest': sorted(TIMINGS, key=lambda r: r['totalMs'], reverse=True)[:5]}), file=sys.stderr, flush=True)
        # ThreadPoolExecutor joins pending threads on normal exit. A hard process
        # deadline also closes every socket, allowing the caller to restore at once.
        os._exit(1)
    timer = threading.Timer(seconds, expired)
    timer.daemon = True
    timer.start()
    return timer


def assets(base):
    result = {}
    for path in ['/robots.txt', '/sitemap.xml', '/ads.txt']:
        headers, body = get(base, path)
        assert not re.search(r'noindex|nofollow|\bnone\b', headers.get('X-Robots-Tag', ''), re.I), path
        result[path] = base64.b64encode(body).decode()
    root = ET.fromstring(base64.b64decode(result['/sitemap.xml']))
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
    urls, alternates = [], {}
    for block in root.findall('s:url', ns):
        url = block.findtext('s:loc', namespaces=ns)
        assert url and url.startswith(ORIGIN + '/'), url
        path = urlsplit(url).path
        urls.append(path)
        alternates[path] = {n.attrib['hreflang']: n.attrib['href'] for n in block.findall('x:link', ns)}
    assert len(set(urls)) == len(urls) and len(urls) >= 106, 'sitemap missing or duplicate URLs'
    robots = base64.b64decode(result['/robots.txt']).decode()
    assert 'Sitemap: ' + ORIGIN + '/sitemap.xml' in robots
    assert not re.search(r'(?mi)^Disallow:\s*/\s*$', robots), 'robots blocks every page'
    return result, urls, alternates


def page(base, path, xml_alternates):
    headers, body = get(base, path)
    assert not re.search(r'noindex|nofollow|\bnone\b', headers.get('X-Robots-Tag', ''), re.I), path
    parser = Page(path)
    parser.feed(body.decode('utf-8'))
    data = parser.data
    assert len(data['title']) == len(data['description']) == len(data['h1']) == 1, (path, 'title/description/H1')
    assert all(data[k][0].strip() for k in ['title', 'description', 'h1']), path
    assert data['canonical'] == [ORIGIN + path], (path, 'canonical')
    robots = ','.join(data['robots'])
    assert re.search(r'\bindex\b', robots, re.I) and re.search(r'\bfollow\b', robots, re.I), (path, 'index,follow')
    assert not re.search(r'noindex|nofollow|\bnone\b', robots, re.I), path
    assert data['hreflang'] == xml_alternates, (path, 'sitemap/head hreflang')
    assert data['hreflang'].get('x-default') == data['hreflang'].get('en') and data['hreflang'].get('en'), path
    assert parser.ad_scripts == 0, (path, 'deferred AdSense must remain off')
    assert data['adsense'] in [[], ['ca-pub-7903460199253248']], (path, 'AdSense account')
    nodes = [node for graph in data['json'] for node in graph.get('@graph', [graph])]
    for node in nodes:
        if node.get('@type') == 'BlogPosting':
            if parser.article.get('data-guide-legacy') == 'true' and parser.article.get('data-guide-reviewed') != 'true':
                assert node['author']['@type'] == 'Organization' and not parser.article.get('has-time'), (path, 'legacy review claim')
            else:
                assert node['author']['@type'] == 'Person' and node['author']['name'] == 'Aymane Ouirdani', (path, 'human review gate')
    return path, data


def check_adsense_scope(pages):
    frozen = json.loads(Path('tests/fixtures/adsense-production-20261117.json').read_text())
    present = {p for p, data in pages.items() if data['adsense']}
    absent = set(pages) - present
    assert len(frozen['present']) == 114 and len(frozen['absent']) == 40
    assert present == set(frozen['present']), ('AdSense URL set changed', sorted(present ^ set(frozen['present'])))
    assert absent == set(frozen['absent']), ('AdSense exclusion set changed', sorted(absent ^ set(frozen['absent'])))
    assert set(SAMPLE[:8]).issubset(present), 'all eight homes must keep the AdSense meta'
    return {'present': sorted(present), 'absent': sorted(absent)}


def check_not_found(base):
    _, body = get(base, '/release-check-missing-35e7a', expected=404)
    parser = Page()
    parser.feed(body.decode('utf-8'))
    assert not parser.data['adsense'] and not parser.ad_scripts, '404 gained AdSense'


def run(base, previous=None, subset=False, expected_release=None):
    assert base == ORIGIN or urlsplit(base).hostname in ['127.0.0.1', 'localhost'], 'unsupported origin'
    started = time.monotonic()
    starting_release, ready_seconds = wait_ready(base, expected_release)
    raw_assets, paths, alternates = assets(base)
    if previous:
        for path in ['/robots.txt', '/ads.txt']:
            assert raw_assets[path] == previous['assets'][path], path + ' changed byte for byte'
        assert set(previous['pages']).issubset(paths), 'production sitemap URL disappeared'
        if subset:
            assert set(previous['pages']) == set(paths), 'deployed sitemap differs from checked archive'
    # Even the quick post-deploy check reads all pages: gains on excluded tools
    # must trigger the same automatic rollback as losses on eligible pages.
    selected = paths
    assert set(SAMPLE).issubset(paths), 'required smoke route missing'
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        pages = dict(pool.map(lambda path: page(base, path, alternates[path]), selected))
    adsense_scope = check_adsense_scope(pages)
    if previous:
        assert adsense_scope == check_adsense_scope(previous['pages']), 'production AdSense scope changed'
    check_not_found(base)
    if previous:
        for path, data in pages.items():
            old = previous['pages'].get(path)
            if old:
                for key in ['title', 'h1', 'description', 'canonical', 'hreflang', 'robots', 'adsense', 'json']:
                    assert data[key] == old[key], (path, key + ' changed')
                for target, count in old['links'].items():
                    if target in paths:
                        assert data['links'].get(target, 0) >= count, (path, target, 'fewer internal links')
    if not subset:
        frozen = json.loads(Path('tests/fixtures/public-indexing-expected.json').read_text())
        frozen_paths = {urlsplit(p['canonical']).path for p in frozen['pages'].values()}
        assert frozen_paths.issubset(paths), ('frozen production URL disappeared', frozen_paths - set(paths))
        for path, data in pages.items():
            for lang, target in data['hreflang'].items():
                assert urlsplit(target).path in pages, (path, 'missing alternate')
                if lang != 'x-default':
                    assert ORIGIN + path in pages[urlsplit(target).path]['hreflang'].values(), (path, 'nonreciprocal alternate')
        for path in paths:
            assert any(source != path and data['links'].get(path, 0) for source, data in pages.items()), (path, 'orphan')
    release = json.loads(get(base, '/api/health')[1]).get('release')
    assert release == starting_release, 'release changed during snapshot/check'
    if expected_release:
        assert release == expected_release, ('wrong deployed release', release, expected_release)
    times = sorted(row['totalMs'] for row in TIMINGS)
    metrics = {'seconds': round(time.monotonic()-started, 3), 'readySeconds': ready_seconds,
               'workers': WORKERS, 'urlTimeoutSeconds': URL_TIMEOUT, 'requests': len(times),
               'p50Ms': times[len(times)//2], 'p95Ms': times[int((len(times)-1)*.95)], 'maxMs': max(times),
               'slowest': sorted(TIMINGS, key=lambda row: row['totalMs'], reverse=True)[:5]}
    print('AUDIT TIMING ' + json.dumps(metrics), flush=True)
    return {'assets': raw_assets, 'pages': pages, 'release': release, 'adsenseScope': adsense_scope, 'timing': metrics}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=ORIGIN)
    parser.add_argument('--snapshot')
    parser.add_argument('--output')
    parser.add_argument('--subset', action='store_true')
    parser.add_argument('--release')
    parser.add_argument('--release-from-snapshot', action='store_true')
    parser.add_argument('--workers', type=int, choices=range(8, 17), default=12)
    parser.add_argument('--url-timeout', type=int, choices=range(5, 61), default=30)
    parser.add_argument('--global-timeout', type=int, choices=range(30, 241), default=120)
    parser.add_argument('--timings')
    args = parser.parse_args()
    global WORKERS, URL_TIMEOUT
    WORKERS, URL_TIMEOUT = args.workers, args.url_timeout
    previous = json.loads(Path(args.snapshot).read_text()) if args.snapshot else None
    if args.release_from_snapshot:
        assert previous, 'snapshot required'
    timer = start_deadline(args.global_timeout)
    try:
        result = run(args.base.rstrip('/'), previous, args.subset, previous['release'] if args.release_from_snapshot else args.release)
    finally:
        if args.timings:
            path = Path(args.timings)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(TIMINGS, indent=2) + '\n')
        timer.cancel()
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"PUBLIC CONTRACT PASS: {len(result['pages'])} pages, HTTP 200 index,follow, canonical/hreflang, SEO and AdSense; release {result['release']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        sys.exit('PUBLIC CONTRACT FAILED: ' + str(error))
