#!/usr/bin/env bash
# Run from a NON-tester network (e.g. phone on 4G, not Wi-Fi). Proves dl is closed to everyone else.
# Usage: verify-outsider.sh [--public | --public-dl]
#   --public     the apex is expected public and indexable, downloads closed, dl tester-only
#   --public-dl  same apex, and dl.vidfetch.app public: trusted certificate, only the gateway routes, which demand a grant
set -u
MODE=${1:-}; [ -z "$MODE" ] || [ "$MODE" = --public ] || [ "$MODE" = --public-dl ] || { echo "usage: verify-outsider.sh [--public|--public-dl]"; exit 2; }
VPS=15.235.127.165; fail=0; n=0
ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "NOT OK $n - $1"; fail=1; }
echo "this network's public IPv4: $(curl -4 -s -m 8 https://api.ipify.org)   (must NOT be the tester IP)"
if [ "$MODE" != --public-dl ]; then
  c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' https://dl.vidfetch.app/api/fetch-info 2>/dev/null); [ "$c" = 000 ] && ok "dl:443 gives no HTTP answer from a non-tester (reset/timeout)" || bad "dl:443 answered HTTP $c to a non-tester"
  nc -z -w 5 $VPS 443 2>/dev/null && bad "TCP 443 reachable from a non-tester" || ok "TCP 443 closed to non-testers"
  c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve vidfetch.app:443:$VPS https://vidfetch.app/ 2>/dev/null); [ "$c" = 000 ] && ok "apex direct to the VPS (bypassing Cloudflare) refused" || bad "apex direct answered $c"
else
  tls=$(echo | openssl s_client -connect $VPS:443 -servername dl.vidfetch.app -verify_hostname dl.vidfetch.app -verify_return_error 2>&1)
  echo "$tls" | grep -q 'Verification: OK' && ok "public dl: certificate chain and hostname verify (strict)" || bad "public dl: certificate does not verify"
  for spec in POST:/api/fetch-info:401 POST:/api/download:401 GET:/:404 GET:/api/health:404 GET:/auth/admission:404; do
    m=${spec%%:*}; r=${spec#*:}; p=${r%:*}; w=${r##*:}
    c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X "$m" https://dl.vidfetch.app$p); [ "$c" = "$w" ] && ok "public dl: $m $p answers $w to an anonymous visitor" || bad "public dl: $m $p answered $c, expected $w"
  done
  h=$(curl -s -m 10 -D - -o /dev/null -X POST https://dl.vidfetch.app/api/fetch-info)
  echo "$h" | grep -qi '^referrer-policy: no-referrer' && echo "$h" | grep -qi '^x-robots-tag: noindex' && ok "public dl: no-referrer and noindex headers" || bad "public dl: headers"
  c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve vidfetch.app:443:$VPS https://vidfetch.app/ 2>/dev/null); [ "$c" = 403 ] && ok "apex direct to the VPS (bypassing Cloudflare) refused by Caddy (403)" || bad "apex direct answered $c"
fi
for p in 22; do nc -z -w 5 $VPS $p 2>/dev/null && ok "SSH port still reachable (unchanged)" || bad "SSH port unreachable"; done
for p in 3000 3001 8788 8789; do nc -z -w 4 $VPS $p 2>/dev/null && bad "internal port $p reachable" || ok "internal port $p closed"; done
c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -I http://dl.vidfetch.app/); [ "$c" = 308 ] && ok "port 80: redirect only (308)" || echo "info: port 80 answered $c (308 expected if open80, 000 if Cloudflare-only)"
if [ -z "$MODE" ]; then
  c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://vidfetch.app/); [ "$c" = 401 ] && ok "apex via Cloudflare still 401" || bad "apex answered $c"
else
  for path in / /fr/ /legal; do
    page=$(curl -s -m 15 -D - "https://vidfetch.app$path"); c=$(echo "$page" | head -n1 | cut -d' ' -f2)
    [ "$c" = 200 ] && ok "public: $path answers 200 through Cloudflare" || bad "public: $path answered $c"
    echo "$page" | grep -qi '^www-authenticate' && bad "public: $path asks for credentials" || ok "public: $path asks for no credentials"
    echo "$page" | grep -qi '^x-robots-tag:.*noindex' && bad "public: $path sends X-Robots-Tag noindex" || ok "public: $path has no noindex header"
    echo "$page" | grep -qiE '<meta name="robots" content="[^"]*noindex' && bad "public: $path has a noindex meta" || ok "public: $path robots meta allows indexing"
  done
  robots=$(curl -s -m 10 https://vidfetch.app/robots.txt)
  echo "$robots" | grep -q '^Sitemap: https://vidfetch.app/sitemap.xml' && ! echo "$robots" | grep -qiE '^Disallow: */[[:space:]]*$' && ok "public: robots.txt publishes the sitemap and does not disallow everything" || bad "public: robots.txt content"
  locs=$(curl -s -m 15 https://vidfetch.app/sitemap.xml | grep -o '<loc>[^<]*</loc>' | wc -l | tr -d ' ')
  [ "$locs" -ge 1 ] && ok "public: sitemap.xml lists $locs URL(s)" || bad "public: sitemap.xml lists no URL"
  loc=$(curl -s -m 10 -o /dev/null -w '%{http_code} %{redirect_url}' https://vidfetch.app/fr); [ "$loc" = "308 https://vidfetch.app/fr/" ] && ok "public: /fr redirects once to /fr/" || bad "public: /fr answered '$loc'"
  for path in /api/download /api/fetch-info /api/queue /auth/transfer /download-helper; do c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "https://vidfetch.app$path"); [ "$c" = 503 ] && ok "public: $path stays closed (503)" || bad "public: $path answered $c"; done
  c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://vidfetch.app/api/download-access); [ "$c" = 503 ] && ok "public: no download grant is issued (503)" || bad "public: /api/download-access answered $c"
  curl -s -m 10 https://vidfetch.app/api/health | grep -q '"downloads":{"available":false}' && ok "public: the site reports downloads unavailable (ready=0)" || bad "public: downloads not reported unavailable"
fi
echo; [ $fail = 0 ] && echo "ALL $n CHECKS PASSED" || echo "FAILURES PRESENT"; exit $fail
