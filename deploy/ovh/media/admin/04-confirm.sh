#!/usr/bin/env bash
# Disarms the dead-man timer after YOU verified a fresh SSH login and the tester checks.
. "$(dirname "$0")/common.sh"; need_root
$SYSTEMCTL is-active --quiet $TIMER.timer || die "timer not armed (already fired or never armed): check 'journalctl -t vidfetch-media-rollback'"
$SYSTEMCTL stop $TIMER.timer; log "dead-man timer disarmed; current network state is now permanent (also at reboot: ingress.nft was replaced)"
