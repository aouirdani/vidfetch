#!/bin/sh
# Runs INSIDE the caddy:2 image (apk available). Local-only; nothing is installed on the VPS.
set -u
apk add -q python3 curl >/dev/null 2>&1
python3 /c/gen.py /src/Caddyfile.test-only /tmp/dl.caddy /tmp/apex.caddy || exit 2
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
stop
start /tmp/apex.caddy

for path in / /api/download-access /api/fetch-info /api/download; do
  expect "$(code GET vidfetch.app $path)" 403 "apex refuses non-Cloudflare peer: $path"
done
stop
exit $fail
