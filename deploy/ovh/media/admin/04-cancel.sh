#!/usr/bin/env bash
# Immediate manual restore of the network state (same code the timer runs), then disarm.
. "$(dirname "$0")/common.sh"; need_root
B=$(latest_backup); "$B/restore-network.sh" "$B"; $SYSTEMCTL stop $TIMER.timer 2>/dev/null || true; log "restored and disarmed"
