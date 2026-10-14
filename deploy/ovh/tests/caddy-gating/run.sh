#!/bin/sh
# Runs INSIDE the caddy:2 image (apk available). Local-only; nothing is installed on the VPS.
set -u
apk add -q python3 curl >/dev/null 2>&1
python3 /c/gen.py /src/Caddyfile.test-only /tmp/dl.caddy /tmp/apex.caddy /src/Caddyfile.public /tmp/public.caddy || exit 2
python3 - <<'PY' &
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.end_headers(); s.wfile.write(b"BACKEND-REACHED")
    do_POST=do_GET
    def log_message(*a): pass
for port in (8789, 3001):
    import threading
    threading.Thread(target=http.server.HTTPServer(("127.0.0.1",port),H).serve_forever,daemon=True).start()
import time; time.sleep(600)
PY
sleep 1
fail=0
code() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X "$1" -H "Host: $2" "http://127.0.0.1:8080$3"; }
expect() { [ "$1" = "$2" ] && echo "ok - $3" || { echo "not ok - $3 (got $1, want $2)"; fail=1; }; }
start() { [ -n "${1:-}" ] || exit 2; caddy run --adapter caddyfile --config "$1" >/tmp/caddy.log 2>&1 & P=$!; sleep 2; head -c 600 /tmp/caddy.log | grep -i 'error' | head -3; }
stop() { kill $P 2>/dev/null; cat /tmp/caddy.log | tail -3; wait $P 2>/dev/null; }

export VIDFETCH_MEDIA_TEST_IPS=192.0.2.1/32; start /tmp/dl.caddy
for path in /api/fetch-info /api/download /api/queue /auth/transfer /download-helper /api/health /auth/admission /x; do
  expect "$(code GET dl.vidfetch.app $path)" 403 "dl non-tester refused: $path"
done
expect "$(code POST dl.vidfetch.app /api/download)" 403 "dl non-tester POST refused"
stop
export VIDFETCH_MEDIA_TEST_IPS=127.0.0.1/32; start /tmp/dl.caddy
for path in /api/fetch-info /api/download /api/queue /auth/transfer /download-helper; do
  expect "$(code GET dl.vidfetch.app $path)" 200 "dl tester reaches gateway: $path"
done
for path in /api/health /auth/admission /auth/deployment /internal/x /x; do
  expect "$(code GET dl.vidfetch.app $path)" 404 "dl tester cannot reach unlisted route: $path"
done
hdr=$(curl -s -D - -o /dev/null -H 'Host: dl.vidfetch.app' http://127.0.0.1:8080/api/fetch-info)
echo "$hdr" | grep -qi '^Referrer-Policy: no-referrer' && echo "ok - dl sends Referrer-Policy: no-referrer" || { echo "not ok - dl Referrer-Policy"; fail=1; }
echo "$hdr" | grep -qi '^X-Robots-Tag: noindex' && echo "ok - dl noindex" || { echo "not ok - dl noindex"; fail=1; }
stop
start /tmp/apex.caddy
IP=$(hostname -i | awk '{print $1}')
codeip() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X "$1" -H "Host: $2" "http://$IP:8080$3"; }
for path in / /api/download-access /api/fetch-info /api/download; do
  expect "$(codeip GET vidfetch.app $path)" 403 "apex refuses non-Cloudflare, non-loopback peer: $path"
done
# The CI promoter probes from 127.0.0.1: it must reach the origin (Basic Auth is its job).
expect "$(code GET vidfetch.app /)" 200 "apex accepts loopback peer (promoter/audit probes)"
stop

# ---- public apex (Caddyfile.public): pages and robots/sitemap reach the frontend, indexable; downloads stay closed
start /tmp/public.caddy
hdr() { curl -s -m 5 -D - -o /dev/null -X "$1" -H "Host: vidfetch.app" "http://127.0.0.1:8080$2" | tr -d '\r'; }
body() { curl -s -m 5 -X "$1" -H "Host: vidfetch.app" "http://127.0.0.1:8080$2"; }
for path in / /fr/ /legal /fr/mentions-legales /robots.txt /sitemap.xml; do
  h=$(hdr GET $path)
  expect "$(echo "$h" | head -1 | cut -d' ' -f2)" 200 "public: $path answered by the frontend"
  expect "$(body GET $path)" BACKEND-REACHED "public: $path proxied to the frontend (not answered by Caddy)"
  echo "$h" | grep -qi '^x-robots-tag' && { echo "not ok - public: $path carries an X-Robots-Tag header"; fail=1; } || echo "ok - public: $path has no X-Robots-Tag header (indexable)"
  echo "$h" | grep -qi '^www-authenticate' && { echo "not ok - public: $path asks for credentials"; fail=1; } || echo "ok - public: $path asks for no credentials"
done
for path in /api/fetch-info /api/download /api/queue /auth/transfer /download-helper; do
  for method in GET POST; do
    h=$(hdr $method $path)
    expect "$(echo "$h" | head -1 | cut -d' ' -f2)" 503 "public: $method $path stays closed (503)"
    echo "$h" | grep -qi '^x-robots-tag: noindex' && echo "ok - public: $method $path noindex" || { echo "not ok - public: $method $path without noindex"; fail=1; }
  done
  expect "$(body GET $path | grep -c BACKEND-REACHED)" 0 "public: $path never reaches a backend"
done
h=$(hdr POST /api/download-access)
echo "$h" | grep -qi '^x-robots-tag: noindex' && echo "ok - public: /api/download-access noindex (the frontend decides availability)" || { echo "not ok - public: /api/download-access without noindex"; fail=1; }
for path in /auth/admission /auth/deployment /internal/x /server-status; do
  expect "$(code GET vidfetch.app $path)" 404 "public: $path stays 404"
done
for path in / /robots.txt /sitemap.xml /api/download; do
  expect "$(codeip GET vidfetch.app $path)" 403 "public: a direct non-Cloudflare peer is still refused: $path"
done
stop
exit $fail
