#!/usr/bin/env bash
# Usage: 02-stage.sh RENDER_DIR   (contains ingress.nft, media-test-ips.env, Caddyfile.test-only, SHA256SUMS)
# Installs the new files under NEW names and validates them. Nothing references them yet:
# no reload, no restart, no firewall change.
. "$(dirname "$0")/common.sh"; need_root
R=${1:?render dir}; latest_backup >/dev/null
( cd "$R" && sha256sum --check --strict SHA256SUMS ) || die "render directory does not match SHA256SUMS"
grep -qE '^VIDFETCH_MEDIA_TEST_IPS=([0-9.]+/32)( [0-9.]+/32)*$' "$R/media-test-ips.env" || die "tester list must be /32 IPv4 entries"
grep -q '192.0.2.1' "$R/media-test-ips.env" && die "placeholder tester list (denies everyone); render with the real IP"
install -o root -g root -m 0644 "$R/ingress.nft" "$BASE/ingress.nft.media-test"
install -o root -g root -m 0644 "$R/media-test-ips.env" "$BASE/media-test-ips.env"
install -o root -g root -m 0644 "$R/Caddyfile.test-only" "$BASE/Caddyfile.media-test"
$NFT --check --file "$BASE/ingress.nft.media-test" && log "nft --check OK"
set -a; . "$BASE/media-test-ips.env"; set +a
runuser -u vidfetch-proxy -- env "VIDFETCH_MEDIA_TEST_IPS=$VIDFETCH_MEDIA_TEST_IPS" XDG_CONFIG_HOME=/var/lib/vidfetch-proxy XDG_DATA_HOME=/var/lib/vidfetch-proxy \
  "$CADDY" validate --config "$BASE/Caddyfile.media-test" --adapter caddyfile 2>&1 | tail -3
# The candidate must not weaken the live apex: same Basic Auth import, same media 503s, noindex.
grep -q 'import /etc/vidfetch/public-https-test/auth.caddy' "$BASE/Caddyfile.media-test" || die "Basic Auth import missing"
grep -q 'X-Robots-Tag "noindex, nofollow"' "$BASE/Caddyfile.media-test" || die "noindex missing"
log "staged: $BASE/{ingress.nft.media-test,media-test-ips.env,Caddyfile.media-test}. Not active."
