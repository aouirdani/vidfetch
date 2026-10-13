#!/usr/bin/env bash
# Restores ONLY the network-facing state from a backup: ingress table + file, and the Caddy
# config pointer. It never touches environments, secrets, the CI guard or the CI profile.
# Called by the dead-man timer and by hand: restore-network.sh BACKUP_DIR
set -euo pipefail
B=${1:?backup dir}; BASE=${VM_BASE:-/etc/vidfetch/public-https-test}; FW=${VM_FW:-/usr/local/libexec/vidfetch-https-test-firewall}
SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}
say() { logger -t vidfetch-media-rollback "$*" 2>/dev/null || true; echo "$*"; }
[ -f "$B/public-https-test/ingress.nft" ] && [ -f "$B/current.target" ] || { say "invalid backup $B"; exit 1; }
say "restoring ingress and Caddy pointer from $B"
install -o root -g root -m 0644 "$B/public-https-test/ingress.nft" "$BASE/ingress.nft.restore"
mv -f "$BASE/ingress.nft.restore" "$BASE/ingress.nft"
"$FW" apply
ln -sfn "$(cat "$B/current.target")" "$BASE/current"
if $SYSTEMCTL is-active --quiet vidfetch-caddy.service; then $SYSTEMCTL reload vidfetch-caddy.service; fi
say "network state restored (testers removed, original ingress table, original Caddy config)"
