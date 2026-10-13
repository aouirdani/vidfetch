#!/usr/bin/env bash
# Restores ONLY the network-facing state from a backup: ingress file+table, Caddy config pointer and the
# media-test env drop-in. It never touches environments, secrets, the CI guard or the CI profile.
# Runs from the systemd dead-man timer (no SSH session needed) and by hand: restore-network.sh BACKUP_DIR
# Each step is independent: a failing step is reported and the next ones still run (partial failure must
# never leave the Caddy pointer on the media-test config because the firewall step failed). Exit != 0 if
# anything could not be restored; systemd then retries (Restart=on-failure).
set -uo pipefail
B=${1:?backup dir}
BASE=${VM_BASE:-/etc/vidfetch/public-https-test}; FW=${VM_FW:-/usr/local/libexec/vidfetch-https-test-firewall}
SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}; NFT=${VM_NFT:-nft}
LOCKFILE=${VM_LOCK:-/run/vidfetch-media-test.lock}; WAIT=${VM_RESTORE_LOCK_WAIT:-45}
DROPIN=${VM_DROPIN-/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf}
say() { logger -t vidfetch-media-rollback "$*" 2>/dev/null || true; echo "$*"; }
fails=0; bad() { say "STEP FAILED: $*"; fails=$((fails+1)); }
# Path safety: this script removes exactly one file, Caddy's media-test drop-in, and never a directory.
: "${B:?backup directory is empty}" "${BASE:?BASE is empty}" "${DROPIN:?DROPIN is empty}"
case "$DROPIN" in /*/vidfetch-caddy.service.d/media-test.conf) ;; *) say "unexpected drop-in path: $DROPIN"; exit 1 ;; esac
for checked in "$DROPIN" "$BASE"; do case "$checked" in /*) ;; *) say "path must be absolute: $checked"; exit 1 ;; esac; case "$checked" in *..*|*//*) say "unexpected path: $checked"; exit 1 ;; esac; done
[ -d "$BASE" ] && [ ! -L "$BASE" ] || { say "BASE is not a real directory: $BASE"; exit 1; }
[ -f "$B/public-https-test/ingress.nft" ] && [ -f "$B/current.target" ] && [ -f "$B/ingress-table.nft" ] || { say "invalid backup $B"; exit 1; }
date +%s.%N > "$B/restore-started"   # from now on 04-confirm.sh / 05-caddy.sh refuse: the window is over
# Wait for a running operation (e.g. 05-caddy.sh) so we do not interleave with it; never give up restoring.
# RESTORE_LOCK_HELD=1: the caller (03-network.sh, on a failed apply) already holds the lock; waiting for it here
# would only delay an urgent restore.
if [ -z "${RESTORE_LOCK_HELD:-}" ]; then
  exec 9>"$LOCKFILE" 2>/dev/null && { flock -w "$WAIT" 9 || say "WARNING: lock still busy after ${WAIT}s: restoring anyway"; }
fi
if [ -e "$B/confirmed" ] && [ -z "${RESTORE_FORCE:-}" ]; then rm -f -- "${B:?}/restore-started"; say "confirmed in the meantime: nothing to restore"; exit 0; fi
say "restoring ingress, Caddy pointer and drop-in from $B"
# 1. ingress file (what the firewall helper and a reboot read)
if install -o root -g root -m 0644 "$B/public-https-test/ingress.nft" "$BASE/ingress.nft.restore" && mv -f "$BASE/ingress.nft.restore" "$BASE/ingress.nft"; then :; else bad "ingress.nft copy"; fi
# 2. live nft table: the audited helper first, then the saved table through the same atomic transaction
if ! "$FW" apply 9>&-; then
  say "firewall helper failed: applying the saved table directly"
  tx=$(mktemp); { $NFT list table inet vidfetch_https_test_ingress >/dev/null 2>&1 && echo 'delete table inet vidfetch_https_test_ingress'; cat "$B/ingress-table.nft"; } > "$tx"
  if $NFT --check --file "$tx" && $NFT --file "$tx"; then say "saved table applied"; else bad "nft table"; fi; rm -f -- "${tx:?}"
fi
# 3. Caddy pointer and env drop-in, then reload (only if running)
if ln -sfn "$(cat "$B/current.target")" "$BASE/current"; then :; else bad "caddy pointer"; fi
if [ -e "$DROPIN" ] || [ -L "$DROPIN" ]; then
  if [ -f "$DROPIN" ] && [ ! -L "$DROPIN" ] && rm -f -- "${DROPIN:?}" && $SYSTEMCTL daemon-reload; then :; else bad "drop-in removal (only a regular file named media-test.conf is ever removed)"; fi
fi
if $SYSTEMCTL is-active --quiet vidfetch-caddy.service; then
  $SYSTEMCTL reload vidfetch-caddy.service || { sleep 3; $SYSTEMCTL reload vidfetch-caddy.service; } || bad "caddy reload"
fi
# 4. verify what we can, never trusting the exit codes alone
[ "$(readlink "$BASE/current")" = "$(cat "$B/current.target")" ] || bad "pointer verification"
cmp -s "$B/public-https-test/ingress.nft" "$BASE/ingress.nft" || bad "ingress.nft verification"
if $NFT list table inet vidfetch_https_test_ingress 2>/dev/null | grep -q 'testers4'; then bad "tester set still present in the live table"; fi
[ ! -e "$DROPIN" ] || bad "drop-in still present"
if [ "$fails" = 0 ]; then date +%s.%N > "$B/restored"; say "network state restored (testers removed, original ingress table, original Caddy config)"; exit 0; fi
say "restore INCOMPLETE ($fails step(s)); systemd retries, otherwise run: restore-network.sh $B"; exit 1
