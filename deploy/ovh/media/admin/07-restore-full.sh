#!/usr/bin/env bash
# Usage: restore-full.sh BACKUP_DIR --yes
# Full return to the backed-up configuration: network (via restore-network.sh) AND environments, CI guard,
# gate files, Caddy unit and drop-ins, and the CI profile (removed if it did not exist). Files are restored
# byte-for-byte with their original owner and mode. It restarts NOTHING and prints what to restart.
# NOT restored on purpose: Caddy certificates/ACME state (caddy-state.tgz) so that renewed certificates are
# never overwritten with older ones; extract it manually only if the state directory itself was lost.
set -euo pipefail; umask 077
B=${1:?backup dir}; [ "${2:-}" = --yes ] || { echo "REFUSED: add --yes (this overwrites env files, the CI guard and the Caddy unit)" >&2; exit 1; }
[ "$(id -u)" = 0 ] || [ "${VM_SKIP_ROOT:-0}" = 1 ] || { echo "run as root" >&2; exit 1; }
ETC=${VM_ETC:-/etc/vidfetch}; SYSD=${VM_SYSD:-/etc/systemd/system}; SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}
[ -d "$B" ] && [ -f "$B/MANIFEST.sha256" ] || { echo "REFUSED: not a backup directory" >&2; exit 1; }
( cd "$B" && sha256sum --check --quiet MANIFEST.sha256 ) || { echo "REFUSED: backup integrity check failed" >&2; exit 1; }
"$B/restore-network.sh" "$B" || { echo "network restore incomplete; stopping before touching env files" >&2; exit 1; }
# whole tree back, byte for byte, owner/mode preserved (cp -a); then remove ONLY what media-test created
cp -a "$B/etc-vidfetch-tree/." "$ETC/"
for f in public-https-test/Caddyfile.media-test public-https-test/ingress.nft.media-test public-https-test/media-test-ips.env; do rm -f "$ETC/$f"; done
[ "$(cat "$B/ci-profile.state")" = present ] || rm -f "$ETC/ci-media-test-profile.json"
install -o root -g root -m 0644 "$B/systemd/vidfetch-caddy.service" "$SYSD/vidfetch-caddy.service"
rm -rf "$SYSD/vidfetch-caddy.service.d"; [ -d "$B/systemd/vidfetch-caddy.service.d" ] && cp -a "$B/systemd/vidfetch-caddy.service.d" "$SYSD/"
$SYSTEMCTL daemon-reload
echo "restored $ETC (whole tree), the Caddy unit and its drop-ins; media-test files removed. Nothing restarted. If environments or the gateway origin were changed, restart ONLY what you need, e.g.:"
echo "  systemctl restart vidfetch-web-preproduction-20261013.service   (frontend env)"
echo "  systemctl restart vidfetch-gateway.service                      (gateway env; only with no active transfer)"
