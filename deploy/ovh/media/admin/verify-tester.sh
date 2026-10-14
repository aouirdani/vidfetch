#!/usr/bin/env bash
# Run from the TESTER machine/network (the /32 you authorised). Read-only: plain HTTPS requests, no credentials.
# Usage: verify-tester.sh EXPECTED_TESTER_IP [PHASE]     PHASE = pre-cert (port 80 only) | full (default) | public
# public: same dl checks (certificate, gate, headers), with the apex expected public and indexable, downloads closed.
set -u
IP=${1:?expected tester IPv4}; PHASE=${2:-full}; VPS=15.235.127.165; fail=0; n=0
ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "NOT OK $n - $1"; fail=1; }
chk() { [ "$1" = "$2" ] && ok "$3" || bad "$3 (got '$1', want '$2')"; }
code() { curl -s -m 10 -o /dev/null -w '%{http_code}' "$@"; }
chk "$(curl -4 -s -m 8 https://api.ipify.org)" "$IP" "this machine's public IPv4 is the authorised tester IP (no VPN / Private Relay)"
chk "$(dig +short A dl.vidfetch.app | tr '\n' ' ')" "$VPS " "dl A record = VPS"
chk "$(dig +short AAAA dl.vidfetch.app)" "" "no AAAA record for dl"
chk "$(code -I http://dl.vidfetch.app/)" 308 "port 80 answers a 308 redirect only"
case "$(curl -s -m 10 -o /dev/null -w '%{redirect_url}' http://dl.vidfetch.app/x?a=1)" in https://dl.vidfetch.app/*) ok "redirect stays on https://dl";; *) bad "redirect target";; esac
for p in 3001 8788 8789; do nc -z -w 4 $VPS $p 2>/dev/null && bad "internal port $p reachable" || ok "internal port $p closed"; done
[ "$PHASE" = pre-cert ] && { echo "pre-cert phase: stop here"; exit $fail; }
tls=$(echo | openssl s_client -connect $VPS:443 -servername dl.vidfetch.app -verify_hostname dl.vidfetch.app -verify_return_error 2>&1)
echo "$tls" | grep -q 'Verification: OK' && ok "dl certificate chain and hostname verify (strict)" || bad "dl certificate does not verify"
echo "$tls" | openssl x509 -noout -issuer -enddate -ext subjectAltName 2>/dev/null | sed 's/^/    /'
for path in /api/health /auth/admission /auth/deployment /internal/x /nope; do chk "$(code https://dl.vidfetch.app$path)" 404 "dl unlisted route $path is 404"; done
r=$(code -X POST -H 'Content-Type: application/json' -d '{}' https://dl.vidfetch.app/api/fetch-info); case "$r" in 2*|5*|000) bad "anonymous POST /api/fetch-info on dl answered $r";; *) ok "anonymous POST /api/fetch-info refused ($r)";; esac
h=$(curl -s -m 10 -D - -o /dev/null https://dl.vidfetch.app/nope)
echo "$h" | grep -qi '^referrer-policy: no-referrer' && ok "dl: Referrer-Policy no-referrer" || bad "dl referrer policy"
echo "$h" | grep -qi '^x-robots-tag: noindex' && ok "dl: noindex" || bad "dl noindex"
echo "$h" | grep -qi '^cache-control: .*no-store' && ok "dl: no-store" || bad "dl cache"
if [ "$PHASE" = public ]; then
  chk "$(code https://vidfetch.app/)" 200 "apex via Cloudflare: public (200)"
  chk "$(curl -s -m 10 -D - -o /dev/null https://vidfetch.app/ | grep -ci '^x-robots-tag:.*noindex')" 0 "apex: no noindex header"
  chk "$(code -X POST -H 'Content-Type: application/json' -d '{}' https://vidfetch.app/api/download-access)" 503 "apex /api/download-access issues no grant while ready=0 (503)"
  chk "$(code https://vidfetch.app/sitemap.xml)" 200 "apex sitemap published (200)"
else
  chk "$(code https://vidfetch.app/)" 401 "apex via Cloudflare: Basic Auth (401)"
  chk "$(curl -s -m 10 -D - -o /dev/null https://vidfetch.app/ | grep -ci '^x-robots-tag:.*noindex')" 1 "apex: noindex header"
  chk "$(code -X POST https://vidfetch.app/api/download-access)" 401 "apex /api/download-access needs Basic Auth first (401)"
  chk "$(code https://vidfetch.app/sitemap.xml)" 404 "apex sitemap stays 404"
fi
for path in /api/download /api/fetch-info /api/queue /auth/transfer /download-helper; do chk "$(code https://vidfetch.app$path)" 503 "apex $path stays closed (503)"; done
chk "$(code --resolve vidfetch.app:443:$VPS https://vidfetch.app/)" 403 "apex hit DIRECTLY (bypassing Cloudflare) from the tester IP is refused by Caddy (403)"
echo; [ $fail = 0 ] && echo "ALL $n CHECKS PASSED" || echo "FAILURES PRESENT"; exit $fail
