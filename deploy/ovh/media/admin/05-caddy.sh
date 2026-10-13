#!/usr/bin/env bash
# Usage: 05-caddy.sh --port80-verified-from-outside
# Switches the Caddy pointer to the staged config and reloads (no restart, certificates kept).
# Caddy requests the dl certificate (HTTP-01) at reload: port 80 must ALREADY be reachable from the
# Internet, otherwise failed validations count against Let's Encrypt limits.
. "$(dirname "$0")/common.sh"; need_root
[ "${1:-}" = --port80-verified-from-outside ] || die "confirm from another network that http://dl.vidfetch.app/ answers 308 first"
B=$(latest_backup); DROPIN=/etc/systemd/system/$CADDY_UNIT.d/media-test.conf
$SYSTEMCTL is-active --quiet $TIMER.timer || die "arm the dead-man timer first (03-network.sh); it also restores this pointer"
grep -q 'tcp dport 80 accept' "$BASE/ingress.nft" || die "port 80 is not open in the applied ingress"
[ -f "$BASE/Caddyfile.media-test" ] || die "run 02-stage.sh"
printf '[Service]\nEnvironmentFile=%s/media-test-ips.env\n' "$BASE" > "$DROPIN.new"; chmod 0644 "$DROPIN.new"; mv -f "$DROPIN.new" "$DROPIN"
$SYSTEMCTL daemon-reload
ln -sfn Caddyfile.media-test "$BASE/current"
if ! $SYSTEMCTL reload $CADDY_UNIT; then log "reload FAILED: restoring pointer"; ln -sfn "$(cat "$B/current.target")" "$BASE/current"; $SYSTEMCTL reload $CADDY_UNIT || true; exit 1; fi
sleep 3; $SYSTEMCTL is-active --quiet $CADDY_UNIT || die "caddy not active"
log "Caddy reloaded. Watch issuance: journalctl -u $CADDY_UNIT --since '-2min' | grep -iE 'obtain|certificate|acme|error'"
