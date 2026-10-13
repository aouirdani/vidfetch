#!/usr/bin/env bash
# Usage: 03-network.sh closed80|open80 [SECONDS=300]
# 1) ARMS a dead-man timer (systemd transient timer: survives SSH loss) that restores the original
#    ingress + Caddy pointer, 2) applies the staged ingress atomically through the existing helper.
# Established SSH sessions are not cut (ct state established); open a NEW session to prove new logins.
. "$(dirname "$0")/common.sh"; need_root
MODE=${1:?closed80|open80}; SECS=${2:-300}; B=$(latest_backup)
[[ "$SECS" =~ ^[0-9]+$ ]] && [ "$SECS" -ge 120 ] && [ "$SECS" -le 1800 ] || die "SECONDS must be 120..1800"
[ -f "$BASE/ingress.nft.media-test" ] || die "run 02-stage.sh first"
$SYSTEMCTL is-active --quiet $TIMER.timer && die "timer already armed: run 04-confirm.sh or 04-cancel.sh"
if [ "$MODE" = open80 ]; then WANT_80=1; elif [ "$MODE" = closed80 ]; then WANT_80=0; else die "mode"; fi
grep -q '^        tcp dport 80 accept$' "$BASE/ingress.nft.media-test" && HAS_80=1 || HAS_80=0
[ "$WANT_80" = "$HAS_80" ] || die "staged ingress was rendered with a different port-80 mode; re-render and re-stage"
$SYSTEMCTL reset-failed $TIMER.service 2>/dev/null || true
systemd-run --quiet --unit=$TIMER --on-active="${SECS}s" --timer-property=AccuracySec=1s --collect \
  --description="VidFetch media-test dead-man restore" "$B/restore-network.sh" "$B"
log "ARMED: original network state returns automatically in ${SECS}s unless you run 04-confirm.sh"
install -o root -g root -m 0644 "$BASE/ingress.nft.media-test" "$BASE/ingress.nft.next"
mv -f "$BASE/ingress.nft.next" "$BASE/ingress.nft"
if ! "$FW" apply; then log "apply FAILED: restoring now"; "$B/restore-network.sh" "$B"; $SYSTEMCTL stop $TIMER.timer || true; exit 1; fi
log "ingress applied. NOW: new SSH session from a second terminal; then 04-confirm.sh (or wait for the restore)."
$SYSTEMCTL list-timers $TIMER.timer --no-pager | sed -n 1,3p
