#!/usr/bin/env python3
"""Render the media-test ingress table and the matching Caddy tester list.

Offline and side-effect free: reads a tester list and the Cloudflare ranges, writes two
files, never touches nftables. The output replaces ONLY the dedicated table
`vidfetch_https_test_ingress`, via the existing deploy/ovh/public-test/firewall.py
(atomic delete+create, `nft --check` first). Same table name and chain structure as
public-test/ingress.nft: SSH, loopback, established, DHCP and the closed internal ports
are unchanged; Cloudflare keeps 80/443 for the apex.

Added: TCP 443 from the tester IPv4 list (dl.vidfetch.app). nftables cannot see the TLS
hostname, so testers can also reach the apex on 443 (still Basic Auth); Caddy's
remote_ip matcher is the second barrier for dl. An empty tester list renders an empty
set, i.e. dl stays unreachable (fail closed).

Port 80 stays Cloudflare-only unless --open-port-80 is given (needed for Let's Encrypt
HTTP-01 from arbitrary validation IPs; see docs/VIDFETCH-DL-CERTIFICATE-OPTIONS.md).
"""
import argparse
import ipaddress
import json
from pathlib import Path
import sys

MAX_TESTERS = 32
MIN_PREFIX = 24  # a tester entry never covers more than 256 addresses


def load_testers(text, cloudflare):
    nets = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.split('#', 1)[0].strip()
        if not line:
            continue
        try:
            net = ipaddress.ip_network(line, strict=True)
        except ValueError as error:
            raise ValueError(f'line {number}: {error}') from None
        if net.version != 4:
            raise ValueError(f'line {number}: IPv6 refused (dl has no AAAA record)')
        if net.prefixlen < MIN_PREFIX:
            raise ValueError(f'line {number}: prefix /{net.prefixlen} too broad (minimum /{MIN_PREFIX})')
        if not net.is_global or net.is_multicast or net.is_reserved or net.is_loopback or net.is_link_local:
            raise ValueError(f'line {number}: {net} is not a public routable address')
        if any(net.overlaps(c) for c in cloudflare):
            raise ValueError(f'line {number}: {net} overlaps Cloudflare ranges (would admit any Cloudflare customer)')
        nets.append(net)
    nets = sorted(set(nets))
    if len(nets) > MAX_TESTERS:
        raise ValueError(f'more than {MAX_TESTERS} tester entries')
    for a in nets:
        for b in nets:
            if a != b and a.overlaps(b):
                raise ValueError(f'{a} overlaps {b}')
    return nets


def render(testers, cloudflare4, cloudflare6, open_port_80=False):
    def elements(items):
        return '        elements = { ' + ', '.join(str(i) for i in items) + ' }\n' if items else ''
    port80 = ('        # ACME HTTP-01 + redirect only (Caddy serves nothing else on :80).\n'
              '        tcp dport 80 accept\n') if open_port_80 else ''
    return f"""# Rendered by deploy/ovh/media/render-ingress.py. Replaces ONLY this dedicated table.
table inet vidfetch_https_test_ingress {{
    set cloudflare4 {{
        type ipv4_addr
        flags interval
{elements(cloudflare4)}    }}
    set cloudflare6 {{
        type ipv6_addr
        flags interval
{elements(cloudflare6)}    }}
    # Authorised dl.vidfetch.app testers (IPv4). Empty = nobody.
    set testers4 {{
        type ipv4_addr
        flags interval
{elements(testers)}    }}
    chain input {{
        type filter hook input priority -5; policy accept;
        iifname "lo" accept
        ct state established,related accept
        tcp dport 22 accept
        ip protocol icmp accept
        meta l4proto ipv6-icmp accept
        # Preserve the existing DHCP client on ens3.
        udp sport 67 udp dport 68 accept
        tcp dport {{ 3000, 3001, 8788, 8789 }} reject with tcp reset
{port80}        tcp dport {{ 80, 443 }} ip saddr @cloudflare4 accept
        tcp dport {{ 80, 443 }} ip6 saddr @cloudflare6 accept
        tcp dport 443 ip saddr @testers4 accept
        tcp dport {{ 80, 443 }} reject with tcp reset
        udp dport 443 drop
        drop
    }}
}}
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--testers', type=Path, help='file with one IPv4 CIDR per line; omitted = empty list')
    parser.add_argument('--ranges', type=Path, default=Path(__file__).parents[1] / 'public-test' / 'cloudflare-ranges.json')
    parser.add_argument('--out-nft', type=Path, required=True)
    parser.add_argument('--out-caddy-env', type=Path, required=True)
    parser.add_argument('--open-port-80', action='store_true')
    args = parser.parse_args(argv)
    ranges = json.loads(args.ranges.read_text())['ranges']
    cf4 = [ipaddress.ip_network(n) for n in ranges['4']]
    testers = load_testers(args.testers.read_text() if args.testers else '', cf4)
    args.out_nft.write_text(render(testers, ranges['4'], ranges['6'], args.open_port_80))
    # Same source of truth for Caddy's second barrier; the placeholder denies everyone.
    value = ' '.join(str(n) for n in testers) or '192.0.2.1/32'
    args.out_caddy_env.write_text(f'VIDFETCH_MEDIA_TEST_IPS={value}\n')
    print(f'{len(testers)} tester entries; port 80 {"open (ACME)" if args.open_port_80 else "Cloudflare-only"}', file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        sys.exit(f'refused: {error}')
