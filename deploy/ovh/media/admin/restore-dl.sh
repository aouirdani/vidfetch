#!/usr/bin/env bash
# Restores the state saved by 10-dl-public.sh just before it opened dl.vidfetch.app: the tester-only ingress (file
# and live table) and the PUBLIC apex Caddy configuration (Caddyfile.public). Never the old Basic Auth state: the
# site stays public and indexable. It does not touch the CI profile, ready, environments, secrets or the guard;
# downloads are closed whenever this can run (10-dl-public.sh requires ready=0, 11-downloads.sh refuses to open
# while this window is armed, 10-dl-cancel.sh refuses while downloads are open), and the result is verified.
# Run by the vidfetch-dl-rollback timer (no SSH session needed) and by 10-dl-cancel.sh:
#   restore-dl.sh SNAPSHOT_DIR            restore
#   restore-dl.sh SNAPSHOT_DIR --check    only check that this snapshot can be restored
# Each step is independent; exit != 0 if anything could not be restored, and systemd then retries.
set -uo pipefail
S=${1:?snapshot dir}
BASE=${VM_BASE:-/etc/vidfetch/public-https-test}; FW=${VM_FW:-/usr/local/libexec/vidfetch-https-test-firewall}
SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}; NFT=${VM_NFT:-nft}
LOCKFILE=${VM_LOCK:-/run/vidfetch-media-test.lock}; WAIT=${VM_RESTORE_LOCK_WAIT:-45}
UNIT=vidfetch-caddy.service
say() { logger -t vidfetch-dl-rollback "$*" 2>/dev/null || true; echo "$*"; }
fails=0; bad() { say "STEP FAILED: $*"; fails=$((fails+1)); }
: "${S:?snapshot directory is empty}" "${BASE:?BASE is empty}"
for checked in "$BASE" "$S"; do case "$checked" in /*) ;; *) say "path must be absolute: $checked"; exit 1 ;; esac; case "$checked" in *..*|*//*) say "unexpected path: $checked"; exit 1 ;; esac; done
[ -d "$BASE" ] && [ ! -L "$BASE" ] || { say "BASE is not a real directory: $BASE"; exit 1; }
[ -d "$S" ] && [ ! -L "$S" ] && [ -f "$S/ingress.nft" ] && [ -f "$S/ingress-table.nft" ] && [ -f "$S/current.target" ] || { say "invalid snapshot $S"; exit 1; }
TARGET=$(cat "$S/current.target")
[ "$TARGET" = Caddyfile.public ] && [ -f "$BASE/Caddyfile.public" ] || { say "unexpected Caddy target in the snapshot: '$TARGET'"; exit 1; }
grep -q 'tcp dport 443 ip saddr @testers4 accept' "$S/ingress.nft" && ! grep -q 'dl_conn4' "$S/ingress.nft" || { say "the snapshot ingress is not the tester-only one"; exit 1; }
if [ "${2:-}" = --check ]; then echo "public-download restore possible from $S: tester-only ingress, Caddy on $TARGET"; exit 0; fi
date +%s.%N > "$S/restore-started"   # from now on 10-dl-confirm.sh refuses: the window is over
if [ -z "${RESTORE_LOCK_HELD:-}" ]; then
  exec 9>"$LOCKFILE" 2>/dev/null && { flock -w "$WAIT" 9 || say "WARNING: lock still busy after ${WAIT}s: restoring anyway"; }
fi
if [ -e "$S/confirmed" ] && [ -z "${RESTORE_FORCE:-}" ]; then rm -f -- "${S:?}/restore-started"; say "confirmed in the meantime: nothing to restore"; exit 0; fi
say "closing dl.vidfetch.app again from $S (tester-only ingress, public apex unchanged)"
# 1. Caddy first: the tester gate is back before the network opens nothing anymore (order of 10-dl-public reversed)
if ln -sfn "$TARGET" "$BASE/current"; then :; else bad "caddy pointer"; fi
if $SYSTEMCTL is-active --quiet $UNIT; then
  $SYSTEMCTL reload $UNIT || { sleep 3; $SYSTEMCTL reload $UNIT; } || bad "caddy reload"
else
  $SYSTEMCTL reset-failed $UNIT 2>/dev/null || true; $SYSTEMCTL start $UNIT || bad "caddy start"
fi
# 2. ingress file, then the live table through the audited helper, the saved table directly if the helper fails
if install -o root -g root -m 0644 "$S/ingress.nft" "$BASE/ingress.nft.restore" && mv -f "$BASE/ingress.nft.restore" "$BASE/ingress.nft"; then :; else bad "ingress.nft copy"; fi
if ! "$FW" apply 9>&-; then
  say "firewall helper failed: applying the saved table directly"
  tx=$(mktemp); { $NFT list table inet vidfetch_https_test_ingress >/dev/null 2>&1 && echo 'delete table inet vidfetch_https_test_ingress'; cat "$S/ingress-table.nft"; } > "$tx"
  if $NFT --check --file "$tx" && $NFT --file "$tx"; then say "saved table applied"; else bad "nft table"; fi; rm -f -- "${tx:?}"
fi
# 3. verify what we can, never trusting the exit codes alone
[ "$(readlink "$BASE/current")" = "$TARGET" ] || bad "pointer verification"
cmp -s "$S/ingress.nft" "$BASE/ingress.nft" || bad "ingress.nft verification"
live=$($NFT list table inet vidfetch_https_test_ingress 2>/dev/null) || live=""
grep -q 'dl_conn4' <<< "$live" && bad "the public 443 rules are still in the live table"
grep -q 'testers4' <<< "$live" || bad "the tester set is missing from the live table"
$SYSTEMCTL is-active --quiet $UNIT || bad "caddy not active"
if [ "$fails" = 0 ]; then date +%s.%N > "$S/restored"; say "dl.vidfetch.app tester-only again; the public apex was not touched"; exit 0; fi
say "public-download restore INCOMPLETE ($fails step(s)); systemd retries, otherwise run: restore-dl.sh $S"; exit 1
