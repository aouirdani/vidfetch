#!/bin/sh
# Host side, opt-in. The public apex end to end: the REAL Next build of this checkout (`next build` with
# VIDFETCH_TARGET=ovh, ready=0) behind the REAL Caddy 2.11.7 running deploy/ovh/media/Caddyfile.public, crawled
# through Caddy from loopback (as the CI promoter does). Only TLS is turned off and the upstream address points at
# the frontend started here; every matcher, handle and header is the file's own. Exit 2 = environment missing.
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); cd "$src" || exit 2
[ -f .next/BUILD_ID ] && [ -f .next/prerender-manifest.json ] && [ -x node_modules/.bin/next ] || { echo "SKIP: build the frontend first (VIDFETCH_TARGET=ovh next build)"; exit 2; }
command -v docker >/dev/null || exit 2
T=$(mktemp -d); c=vidfetch-index-$$; PORT=$((39000 + $$ % 900))
(
  export NEXT_TELEMETRY_DISABLED=1 VIDFETCH_TARGET=ovh VIDFETCH_CONNECTION_READY=0 DATABASE_URL= TURNSTILE_SECRET_KEY= VIDFETCH_ACCESS_SIGNING_KEY=
  if [ -n "${VIDFETCH_INDEXING_APP:-}" ]; then
    cd "$VIDFETCH_INDEXING_APP" || exit 2
    export PORT=$PORT HOSTNAME=127.0.0.1
    exec node server.js
  fi
  exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$PORT"
) > "$T/next.log" 2>&1 &
NEXT=$!
trap 'kill $NEXT 2>/dev/null; docker rm -f $c >/dev/null 2>&1; rm -rf "$T"' EXIT
i=0; until curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health"; do i=$((i+1)); [ $i -gt 100 ] && { echo "frontend did not start"; cat "$T/next.log"; exit 2; }; sleep 0.2; done
python3 -c 'import json, sys; print("\n".join(p for p in json.load(open(sys.argv[1]))["routes"] if not p.startswith("/_") and p not in ("/robots.txt", "/sitemap.xml", "/manifest.webmanifest")))' .next/prerender-manifest.json > "$T/pages"
python3 deploy/ovh/tests/caddy-gating/gen.py deploy/ovh/media/Caddyfile.test-only "$T/dl.caddy" "$T/apex.caddy" deploy/ovh/media/Caddyfile.public "$T/public.caddy" || exit 2
# Linux host networking reaches the loopback-only standalone server; Desktop provides its host gateway.
case "$(uname -s)" in
  Linux) UPSTREAM=127.0.0.1:$PORT; set -- --network host ;;
  *) UPSTREAM=host.docker.internal:$PORT; set -- ;;
esac
sed -i.bak "s#reverse_proxy 127.0.0.1:3001 {#reverse_proxy $UPSTREAM {#" "$T/public.caddy"
grep -q "$UPSTREAM" "$T/public.caddy" || { echo "upstream not rewritten"; exit 2; }
docker run "$@" -d --name $c -v "$T":/t:ro -v "$src/deploy/ovh/tests/fixtures":/f:ro caddy:2.11.7@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772 \
  caddy run --adapter caddyfile --config /t/public.caddy >/dev/null || exit 2
docker exec $c apk add -q python3 >/dev/null 2>&1 || exit 2
docker exec $c python3 /f/crawl-public.py http://127.0.0.1:8080 /t/pages /f/public-indexing-expected.json
