#!/usr/bin/env bash
# Closes dl.vidfetch.app again (tester-only), before or after 10-dl-confirm.sh, with the very script the rollback
# timer runs. The public apex stays public and indexable. Refused while downloads are open: run
# 11-downloads.sh close first, so ready, the CI profile and the network always agree.
. "$(dirname "$0")/common.sh"; need_root
S=$(latest_dl_snapshot)
[ "$(ready_value)" = 0 ] && [ "$(ci_profile_name)" = public ] || die "downloads are open (ready=$(ready_value), CI profile $(ci_profile_name)): run 11-downloads.sh close first"
remove_expected_file "${S:?}" confirmed
if RESTORE_FORCE=1 "$S/restore-dl.sh" "$S"; then
  $SYSTEMCTL stop $DL_TIMER.timer 2>/dev/null || true
  log "dl.vidfetch.app tester-only again and its rollback timer disarmed; the public apex is unchanged"
else
  die "restore incomplete: the rollback timer (if armed) retries; see journalctl -t vidfetch-dl-rollback"
fi
