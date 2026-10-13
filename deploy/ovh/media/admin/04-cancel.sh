#!/usr/bin/env bash
# Immediate manual restore of the network state (the very code the timer runs), then disarm.
. "$(dirname "$0")/common.sh"; need_root
B=$(latest_backup); rm -f "$B/confirmed"
RESTORE_FORCE=1 "$B/restore-network.sh" "$B"; rc=$?
$SYSTEMCTL stop $TIMER.timer 2>/dev/null || true
[ $rc = 0 ] && log "restored and disarmed" || die "restore incomplete: see journalctl -t vidfetch-media-rollback"
