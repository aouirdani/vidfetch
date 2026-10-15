#!/usr/bin/env bash
# Restores ONLY the Caddy side of the media-test or public change: the config pointer (to the target recorded in
# the backup) and the media-test env drop-in, then reloads Caddy (starts it if it is down). The restored Caddy is
# never public, so a PUBLIC CI profile is removed with it (a media-test profile is never touched): Caddy and the
# CI promoter keep agreeing. It never touches nftables, ingress.nft, environments, secrets or the CI guard.
# Run by the vidfetch-caddy-rollback timer that 05-caddy.sh arms (no SSH session needed) and by 05-cancel.sh:
#   restore-caddy.sh BACKUP_DIR            restore
#   restore-caddy.sh BACKUP_DIR --check    only check that this backup can be restored (05-caddy.sh, before arming)
# Each step is independent; exit != 0 if anything could not be restored, and systemd then retries
# (Restart=on-failure).
set -uo pipefail
B=${1:?backup dir}
BASE=${VM_BASE:-/etc/vidfetch/public-https-test}; SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}
LOCKFILE=${VM_LOCK:-/run/vidfetch-media-test.lock}; WAIT=${VM_RESTORE_LOCK_WAIT:-45}
DROPIN=${VM_DROPIN-/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf}
PROFILE=${VM_PROFILE-/etc/vidfetch/ci-media-test-profile.json}
PUBLIC_JSON='{"profile":"public","apex":"public-indexable","dl":"testers-only"}'
UNIT=vidfetch-caddy.service
say() { logger -t vidfetch-caddy-rollback "$*" 2>/dev/null || true; echo "$*"; }
fails=0; bad() { say "STEP FAILED: $*"; fails=$((fails+1)); }
# Path safety: this script removes exactly one file, Caddy's media-test drop-in, and never a directory.
: "${B:?backup directory is empty}" "${BASE:?BASE is empty}" "${DROPIN:?DROPIN is empty}" "${PROFILE:?PROFILE is empty}"
case "$DROPIN" in /*/vidfetch-caddy.service.d/media-test.conf) ;; *) say "unexpected drop-in path: $DROPIN"; exit 1 ;; esac
case "$PROFILE" in /*/ci-media-test-profile.json) ;; *) say "unexpected CI profile path: $PROFILE"; exit 1 ;; esac
for checked in "$DROPIN" "$BASE" "$B" "$PROFILE"; do case "$checked" in /*) ;; *) say "path must be absolute: $checked"; exit 1 ;; esac; case "$checked" in *..*|*//*) say "unexpected path: $checked"; exit 1 ;; esac; done
[ -d "$BASE" ] && [ ! -L "$BASE" ] || { say "BASE is not a real directory: $BASE"; exit 1; }
[ -d "$B" ] && [ ! -L "$B" ] && [ -f "$B/current.target" ] || { say "invalid backup $B"; exit 1; }
# The pointer goes back to what the backup recorded: a configuration file of $BASE, never the media-test one.
TARGET=$(cat "$B/current.target"); NAME=${TARGET#"$BASE"/}
[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [ "$NAME" != Caddyfile.media-test ] && [ "$NAME" != Caddyfile.public ] && [ "$NAME" != Caddyfile.public-dl ] && [ -f "$BASE/$NAME" ] \
  || { say "unexpected Caddy target in $B/current.target: '$TARGET'"; exit 1; }
if [ "${2:-}" = --check ]; then echo "Caddy restore possible from $B: pointer back to $TARGET, drop-in removed"; exit 0; fi
date +%s.%N > "$B/caddy-restore-started"   # from now on 05-confirm.sh refuses: this Caddy window is over
# Wait for a running operation (05-caddy.sh, 05-confirm.sh) so we do not interleave with it; never give up restoring.
# RESTORE_LOCK_HELD=1: the caller (05-caddy.sh, on a failed reload) already holds the lock.
if [ -z "${RESTORE_LOCK_HELD:-}" ]; then
  exec 9>"$LOCKFILE" 2>/dev/null && { flock -w "$WAIT" 9 || say "WARNING: lock still busy after ${WAIT}s: restoring anyway"; }
fi
if [ -e "$B/caddy-confirmed" ] && [ -z "${RESTORE_FORCE:-}" ]; then rm -f -- "${B:?}/caddy-restore-started"; say "Caddy window confirmed in the meantime: nothing to restore"; exit 0; fi
say "restoring the Caddy pointer and drop-in from $B (network rules untouched)"
# 1. pointer, then the CI profile that must follow it, then the env drop-in
if ln -sfn "$TARGET" "$BASE/current"; then :; else bad "caddy pointer"; fi
if [ -f "$PROFILE" ] && [ ! -L "$PROFILE" ] && [ "$(cat "$PROFILE")" = "$PUBLIC_JSON" ]; then
  if rm -f -- "${PROFILE:?}"; then say "public CI profile removed (CI back to the closed profile)"; else bad "public CI profile removal"; fi
fi
if [ -e "$DROPIN" ] || [ -L "$DROPIN" ]; then
  if [ -f "$DROPIN" ] && [ ! -L "$DROPIN" ] && rm -f -- "${DROPIN:?}" && $SYSTEMCTL daemon-reload; then :; else bad "drop-in removal (only a regular file named media-test.conf is ever removed)"; fi
fi
# 2. reload (one retry), or start Caddy if it is down: the apex must come back with its original configuration
if $SYSTEMCTL is-active --quiet $UNIT; then
  $SYSTEMCTL reload $UNIT || { sleep 3; $SYSTEMCTL reload $UNIT; } || bad "caddy reload"
else
  say "Caddy is not running: starting it with the restored configuration"
  $SYSTEMCTL reset-failed $UNIT 2>/dev/null || true
  $SYSTEMCTL start $UNIT || bad "caddy start"
fi
# 3. verify what we can, never trusting the exit codes alone
[ "$(readlink "$BASE/current")" = "$TARGET" ] || bad "pointer verification"
[ ! -e "$DROPIN" ] || bad "drop-in still present"
if [ -f "$PROFILE" ] && [ "$(cat "$PROFILE")" = "$PUBLIC_JSON" ]; then bad "public CI profile still present"; fi
$SYSTEMCTL is-active --quiet $UNIT || bad "caddy not active"
if [ "$fails" = 0 ]; then date +%s.%N > "$B/caddy-restored"; say "Caddy restored (original configuration, no media-test drop-in); network rules unchanged"; exit 0; fi
say "Caddy restore INCOMPLETE ($fails step(s)); systemd retries, otherwise run: restore-caddy.sh $B"; exit 1
