#!/usr/bin/env bash
# Immediate manual restore of the network state (the very code the timer runs), then disarm.
. "$(dirname "$0")/common.sh"; need_root
B=$(latest_backup); remove_expected_file "${B:?}" confirmed
RESTORE_FORCE=1 "$B/restore-network.sh" "$B"; rc=$?
$SYSTEMCTL stop $TIMER.timer 2>/dev/null || true
# Emergency close of everything: the original network and Caddy are back, so downloads close (ready=0) and no public
# CI profile may stay behind (public or public-downloads would both contradict the protected apex).
if [ "$(ready_value)" != 0 ]; then bash "$(dirname "$0")/set-ready.sh" 0 >/dev/null || { log "set-ready.sh 0 failed"; rc=1; }; fi
P=$(ci_profile_path); case "$(ci_profile_name)" in public|public-downloads) remove_expected_file "${P%/*}" "${P##*/}" ;; esac
[ "$(ci_profile_name)" != public ] && [ "$(ci_profile_name)" != public-downloads ] || { log "the public CI profile could not be removed"; rc=1; }
[ $rc = 0 ] && log "restored and disarmed" || die "restore incomplete: see journalctl -t vidfetch-media-rollback"
