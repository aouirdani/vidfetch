#!/usr/bin/env bash
# Immediate manual restore of the network state (the very code the timer runs), then disarm.
. "$(dirname "$0")/common.sh"; need_root
B=$(latest_backup); remove_expected_file "${B:?}" confirmed
RESTORE_FORCE=1 "$B/restore-network.sh" "$B"; rc=$?
$SYSTEMCTL stop $TIMER.timer 2>/dev/null || true
# The original Caddy configuration is back: a public CI profile left behind would contradict it.
remove_public_profile && [ "$(ci_profile_name)" != public ] || { log "the public CI profile could not be removed"; rc=1; }
[ $rc = 0 ] && log "restored and disarmed" || die "restore incomplete: see journalctl -t vidfetch-media-rollback"
