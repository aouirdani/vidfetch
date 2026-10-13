#!/usr/bin/env bash
# Usage: 03-network.sh closed80|open80 [SECONDS=300..1800]
# 1) ARMS a dead-man timer (systemd transient timer + service: independent of any SSH session) that restores
#    the original ingress, Caddy pointer and drop-in, retrying if a step fails, 2) applies the staged ingress
#    atomically through the existing helper. Established SSH sessions are not cut (ct state established);
#    04-confirm.sh therefore demands a NEW login from the tester IP.
. "$(dirname "$0")/common.sh"; need_root
MODE=${1:?closed80|open80}; SECS=${2:-300}; B=$(latest_backup)
[[ "$SECS" =~ ^[0-9]+$ ]] && [ "$SECS" -ge 120 ] && [ "$SECS" -le 1800 ] || die "SECONDS must be 120..1800"
take_lock
require_current_backup "$B"
[ -f "$BASE/ingress.nft.media-test" ] || die "run 02-stage.sh first"
$SYSTEMCTL is-active --quiet $TIMER.timer && die "timer already armed: run 04-confirm.sh or 04-cancel.sh"
$SYSTEMCTL is-active --quiet $TIMER.service && die "the automatic restore is running: wait for it"
if [ "$MODE" = open80 ]; then WANT_80=1; elif [ "$MODE" = closed80 ]; then WANT_80=0; else die "mode"; fi
grep -q '^        tcp dport 80 accept$' "$BASE/ingress.nft.media-test" && HAS_80=1 || HAS_80=0
[ "$WANT_80" = "$HAS_80" ] || die "staged ingress was rendered with a different port-80 mode; re-render and re-stage"
# The backup must describe the ORIGINAL state; refuse to arm over an already-modified system.
grep -q 'testers4' "$BASE/ingress.nft" && die "live ingress.nft already contains testers4: run 04-cancel.sh, then take a fresh backup"
[ "$(readlink "$BASE/current")" = "$(cat "$B/current.target")" ] || die "Caddy pointer differs from the backup: run 04-cancel.sh and re-take the backup"
for marker in armed-at restore-started restored confirmed; do remove_expected_file "${B:?}" "$marker"; done
$SYSTEMCTL reset-failed $TIMER.service 2>/dev/null || true
systemd-run --quiet --unit=$TIMER --on-active="${SECS}s" --timer-property=AccuracySec=1s --collect \
  -p Restart=on-failure -p RestartSec=20s -p TimeoutStartSec=600 \
  --description="VidFetch media-test dead-man restore" "$B/restore-network.sh" "$B"
log "ARMED: original network state returns automatically in ${SECS}s unless you run 04-confirm.sh"
install -o root -g root -m 0644 "$BASE/ingress.nft.media-test" "$BASE/ingress.nft.next"
mv -f "$BASE/ingress.nft.next" "$BASE/ingress.nft"
# 9>&-: the firewall helper must not inherit the lock descriptor (an orphaned helper would otherwise keep the lock)
if ! "$FW" apply 9>&-; then log "apply FAILED: restoring now"; RESTORE_FORCE=1 RESTORE_LOCK_HELD=1 "$B/restore-network.sh" "$B"; $SYSTEMCTL stop $TIMER.timer || true; exit 1; fi
date +%s.%N > "$B/armed-at"   # written AFTER the rules are live, to the microsecond: 04-confirm.sh needs a NEW login after it
log "RULES LIVE. Open the NEW ssh connection now (public-key login from the tester IP), then run 04-confirm.sh."
$SYSTEMCTL list-timers $TIMER.timer --no-pager | sed -n 1,3p
