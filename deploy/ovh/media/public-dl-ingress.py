#!/usr/bin/env python3
"""Derive the public-download ingress from the live tester ingress, offline and side-effect free.

Input: the live /etc/vidfetch/public-https-test/ingress.nft (rendered by render-ingress.py --open-port-80, with the
tester set). Output: the same table with exactly two changes, every other byte kept, so the Cloudflare ranges, SSH,
loopback, DHCP, the refused internal ports, port 80 (ACME) and the tester set stay as they are:

  1. two per-address sets are added after the tester set (state for the limits below);
  2. the single rule `tcp dport 443 ip saddr @testers4 accept` becomes per-IPv4 limits and an IPv4 accept on 443.

Cloudflare (the apex) is accepted earlier in the chain and is never limited here. IPv6 stays Cloudflare-only on 443:
dl.vidfetch.app has no AAAA record. Usage: public-dl-ingress.py LIVE_INGRESS OUTPUT
"""
import sys

MAX_CONNECTIONS = 32   # open HTTPS connections per IPv4 address
NEW_PER_MINUTE = 120   # new HTTPS connections per IPv4 address and minute...
BURST = 60             # ...after a burst of this many

TESTERS_RULE = '        tcp dport 443 ip saddr @testers4 accept\n'
PUBLIC_RULES = (
    '        # dl.vidfetch.app is public: any IPv4 may open HTTPS, within per-address limits.\n'
    f'        tcp dport 443 ct state new add @dl_conn4 {{ ip saddr ct count over {MAX_CONNECTIONS} }} reject with tcp reset\n'
    f'        tcp dport 443 ct state new update @dl_rate4 {{ ip saddr limit rate over {NEW_PER_MINUTE}/minute burst {BURST} packets }} reject with tcp reset\n'
    '        meta nfproto ipv4 tcp dport 443 accept\n')
LIMIT_SETS = (
    '    # Per-address state for the public dl.vidfetch.app limits (IPv4 only: dl has no AAAA record).\n'
    '    set dl_conn4 {\n'
    '        type ipv4_addr\n'
    '        flags dynamic\n'
    '        size 65535\n'
    '    }\n'
    '    set dl_rate4 {\n'
    '        type ipv4_addr\n'
    '        flags dynamic,timeout\n'
    '        timeout 2m\n'
    '        size 65535\n'
    '    }\n')


def transform(text):
    if 'dl_conn4' in text or 'dl_rate4' in text:
        raise ValueError('already the public-download ingress')
    if 'table inet vidfetch_https_test_ingress {' not in text:
        raise ValueError('not the vidfetch_https_test_ingress table')
    if text.count(TESTERS_RULE) != 1:
        raise ValueError('expected exactly one tester rule on port 443, found %d' % text.count(TESTERS_RULE))
    if '        tcp dport 80 accept\n' not in text:
        raise ValueError('port 80 is not open (ACME HTTP-01 needs it): not the open80 ingress')
    start = text.find('    set testers4 {\n')
    if start < 0 or text.count('    set testers4 {\n') != 1:
        raise ValueError('expected exactly one tester set')
    end = text.index('    }\n', start) + len('    }\n')
    out = text[:end] + LIMIT_SETS + text[end:]
    return out.replace(TESTERS_RULE, PUBLIC_RULES)


def main(argv):
    if len(argv) != 3:
        sys.exit('usage: public-dl-ingress.py LIVE_INGRESS OUTPUT')
    with open(argv[1]) as source:
        text = source.read()
    try:
        out = transform(text)
    except ValueError as error:
        sys.exit('REFUSED: %s' % error)
    with open(argv[2], 'x') as target:
        target.write(out)


if __name__ == '__main__':
    main(sys.argv)
