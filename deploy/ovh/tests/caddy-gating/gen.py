"""Derive plain-HTTP local test configs from deploy/ovh/media/Caddyfile.test-only.

Only the TLS/ACME lines and the Basic Auth import (needs a server-side secret file) are
removed; every matcher, handle and respond is kept verbatim so ordering is what is tested.
"""
import sys
src, out_dl, out_apex = sys.argv[1:4]
s = open(src).read()
snip = s[s.index('(test_headers)'):s.index('(http01)')]
head = '{\n  auto_https off\n  admin off\n}\n'
dl = s[s.index('dl.vidfetch.app {'):].replace('dl.vidfetch.app {', 'http://dl.vidfetch.app:8080 {', 1).replace('    import http01\n', '')
apex = s[s.index('\nvidfetch.app {') + 1:s.index('www.vidfetch.app {')].replace('vidfetch.app {', 'http://vidfetch.app:8080 {', 1)
apex = apex.replace('    import http01\n', '').replace('            import /etc/vidfetch/public-https-test/auth.caddy\n', '')
assert 'auth.caddy' not in apex and 'http01' not in apex and 'http01' not in dl
open(out_dl, 'w').write(head + snip + dl)
open(out_apex, 'w').write(head + snip + apex)
