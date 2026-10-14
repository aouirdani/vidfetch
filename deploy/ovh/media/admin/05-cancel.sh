#!/usr/bin/env bash
# Immediate Caddy-only restore (the very code the Caddy rollback timer runs), then disarm. Works before and after
# 05-confirm.sh, for the media-test and the public window: a public CI profile goes away with the public Caddy.
# The network rules confirmed with 04-confirm.sh stay as they are; 04-cancel.sh restores those.
. "$(dirname "$0")/common.sh"; need_root
B=$(latest_backup); remove_expected_file "${B:?}" caddy-confirmed
if RESTORE_FORCE=1 "$(dirname "$0")/restore-caddy.sh" "$B"; then
  $SYSTEMCTL stop $CADDY_TIMER.timer 2>/dev/null || true
  log "Caddy restored and its rollback timer disarmed; network rules unchanged"
else
  die "Caddy restore incomplete: the rollback timer (if armed) stays armed and retries; see journalctl -t vidfetch-caddy-rollback"
fi
