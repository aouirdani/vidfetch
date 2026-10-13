#!/usr/bin/python3
"""Render reviewable proxy/firewall files. Never applies configuration."""
import ipaddress
import json
from pathlib import Path

folder = Path(__file__).resolve().parent
for output in ['Caddyfile.proxied', 'Caddyfile.downloads-approved.example', 'web-ingress.nft']:
    if (folder / output).exists():
        raise FileExistsError('Render in a fresh directory; existing configurations are preserved')
ranges = json.loads((folder / 'cloudflare-ranges.json').read_text())['ranges']
for version in ['4', '6']:
    if not ranges[version]:
        raise ValueError('Empty Cloudflare range list')
    for value in ranges[version]:
        if ipaddress.ip_network(value, strict=True).version != int(version):
            raise ValueError('Unexpected IP family')
proxies = ' '.join(ranges['4'] + ranges['6'])
global_config = '''{
    admin 127.0.0.1:2019
    servers {
        protocols h1 h2
        trusted_proxies static PROXIES
        trusted_proxies_strict
        client_ip_headers CF-Connecting-IP
        max_header_size 16KB
        timeouts {
            read_header 10s
            read_body 15s
            idle 5m
        }
    }
    # No access logger: queries contain media URLs and one-use tickets.
    log default {
        format filter {
            wrap json
            fields {
                request>uri query {
                    delete ticket
                    delete status
                    delete token
                    delete url
                    delete text
                    delete link
                    delete u
                }
                request>headers>Authorization delete
                request>headers>Cookie delete
                request>headers>X-Vidfetch-Proof delete
            }
        }
    }
}
'''.replace('PROXIES', proxies)
shared = '''
(launch_headers) {
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Robots-Tag "{$VIDFETCH_ROBOTS_HEADER:noindex, nofollow}"
        -Server
    }
}
(frontend) {
    request_body {
        max_size 32KB
    }
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up Host vidfetch.app
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-For {client_ip}
        header_up -CF-Connecting-IP
        header_up -X-Real-IP
        transport http {
            dial_timeout 3s
            response_header_timeout 30s
        }
    }
}
(http01) {
    # Cloudflare terminates TLS: ALPN validation cannot reach Caddy through it.
    tls {
        issuer acme {
            disable_tlsalpn_challenge
        }
    }
}
'''
site = '''
vidfetch.app {
    import http01
    import launch_headers
    @private path /auth/admission /auth/deployment /internal/*
    handle @private {
        respond 404
    }
    @media path /api/fetch-info /api/download /api/queue /auth/transfer /download-helper
    handle @media {
MEDIA
    }
    @authorization path /api/download-access
    handle @authorization {
        request_body {
            max_size 8KB
        }
        header {
            Cache-Control no-store
            X-Robots-Tag "noindex, nofollow"
        }
        reverse_proxy 127.0.0.1:3000 {
            header_up Host vidfetch.app
            header_up X-Forwarded-Proto https
            header_up X-Forwarded-For {client_ip}
            header_up -CF-Connecting-IP
            header_up -X-Real-IP
        }
    }
    handle {
        import frontend
    }
}
www.vidfetch.app {
    import http01
    import launch_headers
    redir https://vidfetch.app{uri} 301
}
'''
disabled = '''        header {
            Content-Type application/json
            Cache-Control no-store
            X-Robots-Tag "noindex, nofollow"
        }
        respond `{"ok":false,"code":"BACKEND_UNAVAILABLE","error":"Video extraction and downloads are temporarily unavailable. Please try again later."}` 503'''
enabled = '''        request_body {
            max_size 8KB
        }
        header {
            Cache-Control no-store
            X-Robots-Tag "noindex, nofollow"
        }
        reverse_proxy 127.0.0.1:8789 {
            header_up Host vidfetch.app
            header_up X-Forwarded-Proto https
            header_up X-Forwarded-For {client_ip}
            header_up -CF-Connecting-IP
            header_up -X-Real-IP
            transport http {
                dial_timeout 3s
                response_header_timeout 240s
            }
            stream_timeout 660s
        }'''
for name, media in [('Caddyfile.proxied', disabled), ('Caddyfile.downloads-approved.example', enabled)]:
    text = '# PREPARED ONLY. Explicit approval is required before public activation.\n' + global_config + shared + site.replace('MEDIA', media)
    # Preserve previously reviewed configurations; render in a fresh directory.
    with (folder / name).open('x') as output:
        output.write(text)
nft = '''# PREPARED ONLY. No global policy, SSH rule or existing table is replaced.
table inet vidfetch_web_ingress {
    set cloudflare4 {
        type ipv4_addr
        flags interval
        elements = { IPV4 }
    }
    set cloudflare6 {
        type ipv6_addr
        flags interval
        elements = { IPV6 }
    }
    chain input {
        type filter hook input priority -5; policy accept;
        iifname "lo" accept
        ct state established,related accept
        tcp dport { 3000, 3001, 8788, 8789 } reject with tcp reset
        tcp dport { 80, 443 } ip saddr @cloudflare4 accept
        tcp dport { 80, 443 } ip6 saddr @cloudflare6 accept
        tcp dport { 80, 443 } reject with tcp reset
        udp dport 443 drop
    }
}
'''.replace('IPV4', ', '.join(ranges['4'])).replace('IPV6', ', '.join(ranges['6']))
with (folder / 'web-ingress.nft').open('x') as output:
    output.write(nft)
print('Rendered two Caddyfiles and one isolated nft table; nothing activated')
