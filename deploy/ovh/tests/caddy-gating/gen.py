"""Derive plain-HTTP local test configs from deploy/ovh/media/Caddyfile.test-only.

Only the TLS/ACME lines and the Basic Auth import (needs a server-side secret file) are
removed; every matcher, handle and respond is kept verbatim so ordering is what is tested.
"""
import sys
src, out_dl, out_apex = sys.argv[1:4]
public_src, out_public = (sys.argv[4:6] + [None, None])[:2]
public_dl_src, out_public_dl = (sys.argv[6:8] + [None, None])[:2]
s = open(src).read()
snip = s[s.index('(test_headers)'):s.index('(http01)')]
head = '{\n  auto_https off\n  admin off\n}\n'
dl = s[s.index('dl.vidfetch.app {'):].replace('dl.vidfetch.app {', 'http://dl.vidfetch.app:8080 {', 1).replace('    import http01\n', '')
apex = s[s.index('\nvidfetch.app {') + 1:s.index('www.vidfetch.app {')].replace('vidfetch.app {', 'http://vidfetch.app:8080 {', 1)
apex = apex.replace('    import http01\n', '').replace('            import /etc/vidfetch/public-https-test/auth.caddy\n', '')
assert 'auth.caddy' not in apex and 'http01' not in apex and 'http01' not in dl
open(out_dl, 'w').write(head + snip + dl)
open(out_apex, 'w').write(head + snip + apex)

if public_src:
    # The public apex is tested the same way. Its dl block must be byte-identical to the candidate's: going public
    # never changes who may reach dl.vidfetch.app.
    q = open(public_src).read()
    assert q[q.index('dl.vidfetch.app {'):] == s[s.index('dl.vidfetch.app {'):], 'dl block differs from Caddyfile.test-only'
    assert 'auth.caddy' not in q and 'Disallow' not in q
    psnip = q[q.index('(public_headers)'):q.index('(http01)')]
    papex = q[q.index('\nvidfetch.app {') + 1:q.index('www.vidfetch.app {')].replace('vidfetch.app {', 'http://vidfetch.app:8080 {', 1)
    papex = papex.replace('    import http01\n', '')
    assert 'http01' not in papex
    open(out_public, 'w').write(head + psnip + papex)

if public_dl_src:
    # Public downloads: outside the dl block (after the header comment) the file must be Caddyfile.public byte for byte,
    # so the public apex, its SEO and www stay exactly as they are; the dl block only loses the tester filter.
    q, r = open(public_src).read(), open(public_dl_src).read()
    body = lambda text: text[text.index('\n{\n'):text.index('\n}\n', text.index('www.vidfetch.app {')) + 3]  # global, apex, www
    assert body(q) == body(r), 'Caddyfile.public-dl differs from Caddyfile.public outside the dl block'
    dlq, dlr = q[q.index('dl.vidfetch.app {'):], r[r.index('dl.vidfetch.app {'):]
    assert 'notTester' in dlq and 'notTester' not in dlr and 'remote_ip' not in dlr
    gate = dlq[dlq.index('    @notTester'):dlq.index('    @download')]
    assert dlq.replace(gate, '') == dlr, 'the dl block differs by more than the tester filter'
    pdl = dlr.replace('dl.vidfetch.app {', 'http://dl.vidfetch.app:8080 {', 1).replace('    import http01\n', '')
    open(out_public_dl, 'w').write(head + pdl)
