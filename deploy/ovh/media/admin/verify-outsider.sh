#!/usr/bin/env bash
# Run from a NON-tester network (e.g. phone on 4G, not Wi-Fi). Proves dl is closed to everyone else.
set -u
VPS=15.235.127.165; fail=0; n=0
ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "NOT OK $n - $1"; fail=1; }
echo "this network's public IPv4: $(curl -4 -s -m 8 https://api.ipify.org)   (must NOT be the tester IP)"
c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' https://dl.vidfetch.app/api/fetch-info 2>/dev/null); [ "$c" = 000 ] && ok "dl:443 gives no HTTP answer from a non-tester (reset/timeout)" || bad "dl:443 answered HTTP $c to a non-tester"
nc -z -w 5 $VPS 443 2>/dev/null && bad "TCP 443 reachable from a non-tester" || ok "TCP 443 closed to non-testers"
c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve vidfetch.app:443:$VPS https://vidfetch.app/ 2>/dev/null); [ "$c" = 000 ] && ok "apex direct to the VPS (bypassing Cloudflare) refused" || bad "apex direct answered $c"
for p in 22; do nc -z -w 5 $VPS $p 2>/dev/null && ok "SSH port still reachable (unchanged)" || bad "SSH port unreachable"; done
for p in 3000 3001 8788 8789; do nc -z -w 4 $VPS $p 2>/dev/null && bad "internal port $p reachable" || ok "internal port $p closed"; done
c=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -I http://dl.vidfetch.app/); [ "$c" = 308 ] && ok "port 80: redirect only (308)" || echo "info: port 80 answered $c (308 expected if open80, 000 if Cloudflare-only)"
c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://vidfetch.app/); [ "$c" = 401 ] && ok "apex via Cloudflare still 401" || bad "apex answered $c"
echo; [ $fail = 0 ] && echo "ALL $n CHECKS PASSED" || echo "FAILURES PRESENT"; exit $fail
