#!/usr/bin/env bash
# Usage: 10-dl-public.sh [SECONDS=900, 120..1800]
# Opens dl.vidfetch.app to every visitor, downloads still CLOSED (ready=0, no grant can be issued):
#   network  the single tester rule on 443 becomes per-IPv4 limits + IPv4 accept (public-dl-ingress.py, live file in);
#   Caddy    Caddyfile.public -> Caddyfile.public-dl (same apex byte for byte, dl without the tester filter).
# A dead-man timer (vidfetch-dl-rollback) is armed FIRST and restores the snapshot taken here: tester-only dl and
# the public apex (never the old Basic Auth state). 10-dl-confirm.sh disarms it after an SSH proof and the checks.
# Order: network, then Caddy (meanwhile non-testers still get Caddy's 403); the restore reverses it. Any failure
# restores at once. The CI profile (public) and ready (0) are not changed here: 11-downloads.sh does that, later.
. "$(dirname "$0")/common.sh"; need_root
SECS=${1:-900}
[[ "$SECS" =~ ^[0-9]+$ ]] && [ "$SECS" -ge 120 ] && [ "$SECS" -le 1800 ] || die "SECONDS must be 120..1800"
TK="$(cd "$(dirname "$0")/.." && pwd)"
B=$(latest_backup)
take_lock
require_current_backup "$B"
# --- the starting point must be exactly the confirmed public apex with tester-only dl, downloads closed
[ "$(readlink "$BASE/current")" = Caddyfile.public ] && [ -e "$B/caddy-confirmed" ] || die "the public apex window is not confirmed (Caddy must serve Caddyfile.public)"
if why=$(network_window_problem "$B"); then die "network: $why"; fi
for t in $TIMER $CADDY_TIMER $DL_TIMER; do $SYSTEMCTL is-active --quiet $t.timer && die "the $t timer is armed: finish that window first"; done
$SYSTEMCTL is-active --quiet $DL_TIMER.service && die "a public-download restore is running: wait for it"
[ "$(ci_profile_name)" = public ] || die "the CI profile is '$(ci_profile_name)', expected public"
grep -q "^PUBLIC_DL_PROFILE = {'profile': 'public-downloads'," "$CI_HELPER" 2>/dev/null || die "the installed CI helper does not know the public-downloads profile: 09-ci-helper.sh install first"
[ "$(ready_value)" = 0 ] || die "ready is '$(ready_value)': dl.vidfetch.app is opened with downloads closed (ready=0) only"
# --- the files this toolkit brings, checked against what is live
SRC="$TK/Caddyfile.public-dl"; TOOL="$TK/public-dl-ingress.py"
[ -f "$SRC" ] && [ ! -L "$SRC" ] && [ -f "$TOOL" ] && [ ! -L "$TOOL" ] || die "Caddyfile.public-dl or public-dl-ingress.py missing next to this toolkit: send it again (send-to-vps.sh)"
python3 - "$BASE/Caddyfile.public" "$SRC" <<'PY' || die "Caddyfile.public-dl is not the live Caddyfile.public minus the dl tester filter"
import sys
q, r = (open(path).read() for path in sys.argv[1:3])
body = lambda t: t[t.index('\n{\n'):t.index('\n}\n', t.index('www.vidfetch.app {')) + 3]
assert body(q) == body(r), 'global options, apex or www differ'
dq, dr = q[q.index('dl.vidfetch.app {'):], r[r.index('dl.vidfetch.app {'):]
gate = dq[dq.index('    @notTester'):dq.index('    @download')]
assert dq.replace(gate, '') == dr and 'remote_ip' not in dr, 'the dl block differs by more than the tester filter'
PY
remove_expected_file "${BASE:?}" ingress.nft.public-dl
python3 "$TOOL" "$BASE/ingress.nft" "$BASE/ingress.nft.public-dl" || die "the live ingress cannot be turned into the public-download one"
chown root:root "$BASE/ingress.nft.public-dl"; chmod 0644 "$BASE/ingress.nft.public-dl"
tx=$(mktemp); { echo 'delete table inet vidfetch_https_test_ingress'; cat "$BASE/ingress.nft.public-dl"; } > "$tx"
$NFT --check --file "$tx" || { rm -f -- "${tx:?}"; die "nft --check refuses the public-download ingress"; }; rm -f -- "${tx:?}"
install -o root -g root -m 0644 "$SRC" "$BASE/Caddyfile.public-dl.next" && mv -f "$BASE/Caddyfile.public-dl.next" "$BASE/Caddyfile.public-dl"
LIST=$(tester_list)
runuser -u vidfetch-proxy -- env "VIDFETCH_MEDIA_TEST_IPS=$LIST" XDG_CONFIG_HOME=/var/lib/vidfetch-proxy XDG_DATA_HOME=/var/lib/vidfetch-proxy \
  "$CADDY" validate --config "$BASE/Caddyfile.public-dl" --adapter caddyfile >/dev/null 2>&1 || die "caddy validate fails on Caddyfile.public-dl"
if ! out=$(apex_public); then printf '%s\n' "$out" >&2; die "the public apex is not as expected BEFORE the change: nothing done"; fi
# --- snapshot of what the rollback restores: tester-only ingress (file and live table) and the public apex
S=$(mktemp -d "$BACKUPS/vidfetch-public-dl-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
cp -p "$BASE/ingress.nft" "$S/ingress.nft"
$NFT list table inet vidfetch_https_test_ingress > "$S/ingress-table.nft"
echo Caddyfile.public > "$S/current.target"
install -m 0700 "$(dirname "$0")/restore-dl.sh" "$S/restore-dl.sh"
cmp -s "$(dirname "$0")/restore-dl.sh" "$S/restore-dl.sh" || die "could not copy restore-dl.sh into the snapshot"
"$S/restore-dl.sh" "$S" --check >/dev/null || die "the restore would not work from $S: nothing changed"
ln -sfn "$S" "$BACKUPS/vidfetch-public-dl-latest"
# --- arm first, change second
$SYSTEMCTL reset-failed $DL_TIMER.service 2>/dev/null || true
systemd-run --quiet --unit=$DL_TIMER --on-active="${SECS}s" --timer-property=AccuracySec=1s --collect \
  -p Restart=on-failure -p RestartSec=20s -p TimeoutStartSec=600 \
  --description="VidFetch public-download rollback" "$S/restore-dl.sh" "$S"
$SYSTEMCTL is-active --quiet $DL_TIMER.timer || die "the rollback timer is not active: nothing changed"
log "ARMED: dl.vidfetch.app returns to tester-only in ${SECS}s unless you run 10-dl-confirm.sh (the public apex stays as it is)"
restore_now() {
  log "$1: restoring the tester-only dl now"
  if RESTORE_FORCE=1 RESTORE_LOCK_HELD=1 "$S/restore-dl.sh" "$S"; then $SYSTEMCTL stop $DL_TIMER.timer || true; else log "restore incomplete: the rollback timer stays armed"; fi
  exit 1
}
{ install -o root -g root -m 0644 "$BASE/ingress.nft.public-dl" "$BASE/ingress.nft.next" && mv -f "$BASE/ingress.nft.next" "$BASE/ingress.nft"; } || restore_now "ingress file FAILED"
"$FW" apply 9>&- || restore_now "firewall apply FAILED"
if why=$(public_dl_table_problem); then restore_now "live table: $why"; fi
ln -sfn Caddyfile.public-dl "$BASE/current" || restore_now "pointer switch FAILED"
$SYSTEMCTL reload $CADDY_UNIT || restore_now "Caddy reload FAILED"
sleep 3
$SYSTEMCTL is-active --quiet $CADDY_UNIT || restore_now "Caddy is not active after the reload"
date +%s.%N > "$S/armed-at"   # after the rules are live: 10-dl-confirm.sh needs a NEW SSH login after it
log "dl.vidfetch.app is public (downloads still closed: ready=0). Open a NEW ssh connection now (public key),"
log "run verify-outsider.sh --public-dl from a non-tester network, then 10-dl-confirm.sh --external-checks-passed"
$SYSTEMCTL list-timers $DL_TIMER.timer --no-pager | sed -n 1,3p
