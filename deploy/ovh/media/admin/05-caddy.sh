#!/usr/bin/env bash
# Usage: 05-caddy.sh --port80-verified-from-outside [SECONDS=900, 120..1800]
# Caddy window. It runs AFTER the network window was confirmed (04-confirm.sh) and never touches nftables or
# ingress.nft: the confirmed network rules stay exactly as they are, whatever happens here.
#  1) arms a dead-man timer of its own (vidfetch-caddy-rollback, systemd: independent of any SSH session) running
#     restore-caddy.sh, copied into the backup: without 05-confirm.sh, the original Caddy configuration comes back;
#  2) writes the env drop-in, switches the pointer to the staged config and reloads (no restart, certificates kept).
# Caddy requests the dl certificate (HTTP-01) at reload: port 80 must ALREADY be reachable from the Internet,
# otherwise failed validations count against Let's Encrypt limits.
. "$(dirname "$0")/common.sh"; need_root
[ "${1:-}" = --port80-verified-from-outside ] || die "confirm from another network that http://dl.vidfetch.app/ answers 308 first"
SECS=${2:-900}
[[ "$SECS" =~ ^[0-9]+$ ]] && [ "$SECS" -ge 120 ] && [ "$SECS" -le 1800 ] || die "SECONDS must be 120..1800"
B=$(latest_backup)
take_lock
require_current_backup "$B"
# --- the network window: confirmed, still live, not restored
if why=$(network_window_problem "$B"); then die "$why"; fi
grep -q '^        tcp dport 80 accept$' "$BASE/ingress.nft" || die "port 80 is not open in the applied ingress (open80 is needed for HTTP-01)"
# --- the Caddy side: still original, nothing pending
$SYSTEMCTL is-active --quiet $CADDY_TIMER.timer && die "the Caddy rollback timer is already armed: run 05-confirm.sh or 05-cancel.sh"
$SYSTEMCTL is-active --quiet $CADDY_TIMER.service && die "the Caddy restore is running: wait for it"
[ "$(readlink "$BASE/current")" = "$(cat "$B/current.target")" ] || die "the Caddy pointer differs from the backup: run 05-cancel.sh first"
[ ! -e "$DROPIN" ] && [ ! -L "$DROPIN" ] || die "the media-test drop-in already exists: run 05-cancel.sh first"
DROPDIR=${DROPIN%/*}   # validated by common.sh: an absolute .../vidfetch-caddy.service.d
[ -e "$DROPDIR" ] || install -d -o root -g root -m 0755 "${DROPDIR:?}"
[ -d "$DROPDIR" ] && [ ! -L "$DROPDIR" ] || die "the Caddy drop-in directory is not a real directory: $DROPDIR"
$SYSTEMCTL is-active --quiet $CADDY_UNIT || die "Caddy is not running"
# --- the staged configuration: present, still protective, valid with the tester list it will get
[ -f "$BASE/Caddyfile.media-test" ] || die "run 02-stage.sh"
grep -q 'import /etc/vidfetch/public-https-test/auth.caddy' "$BASE/Caddyfile.media-test" || die "Basic Auth import missing from the staged config"
grep -q 'X-Robots-Tag "noindex, nofollow"' "$BASE/Caddyfile.media-test" || die "noindex missing from the staged config"
LIST=$(tester_list)
runuser -u vidfetch-proxy -- env "VIDFETCH_MEDIA_TEST_IPS=$LIST" XDG_CONFIG_HOME=/var/lib/vidfetch-proxy XDG_DATA_HOME=/var/lib/vidfetch-proxy \
  "$CADDY" validate --config "$BASE/Caddyfile.media-test" --adapter caddyfile >/dev/null 2>&1 || die "caddy validate fails on the staged config: run 02-stage.sh again"
# --- the apex must already be protected, otherwise 05-confirm.sh would prove nothing about this change
if ! out=$(apex_protected base); then printf '%s\n' "$out" >&2; die "the apex is not protected as expected BEFORE the change: nothing done"; fi
# --- arm first, change second
for marker in caddy-armed-at caddy-restore-started caddy-restored caddy-confirmed; do remove_expected_file "${B:?}" "$marker"; done
install -o root -g root -m 0700 "$(dirname "$0")/restore-caddy.sh" "$B/restore-caddy.sh"
cmp -s "$(dirname "$0")/restore-caddy.sh" "$B/restore-caddy.sh" || die "could not copy restore-caddy.sh into the backup"
"$B/restore-caddy.sh" "$B" --check >/dev/null || die "the Caddy restore would not work from $B: nothing done"
$SYSTEMCTL reset-failed $CADDY_TIMER.service 2>/dev/null || true
systemd-run --quiet --unit=$CADDY_TIMER --on-active="${SECS}s" --timer-property=AccuracySec=1s --collect \
  -p Restart=on-failure -p RestartSec=20s -p TimeoutStartSec=600 \
  --description="VidFetch media-test Caddy rollback" "$B/restore-caddy.sh" "$B"
$SYSTEMCTL is-active --quiet $CADDY_TIMER.timer || die "the Caddy rollback timer is not active: nothing changed"
date +%s.%N > "$B/caddy-armed-at"
log "ARMED: the original Caddy configuration returns automatically in ${SECS}s unless you run 05-confirm.sh (network rules are not part of it)"
# From here on, any failure brings the original configuration back at once (this script holds the lock the restore
# would otherwise wait for). The timer is disarmed only if that restore completed; otherwise it stays armed and retries.
restore_now() {
  log "$1: restoring the original Caddy configuration now"
  if RESTORE_FORCE=1 RESTORE_LOCK_HELD=1 "$B/restore-caddy.sh" "$B"; then $SYSTEMCTL stop $CADDY_TIMER.timer || true; else log "restore incomplete: the rollback timer stays armed"; fi
  exit 1
}
{ dropin_text > "$DROPIN.new" && chmod 0644 "$DROPIN.new" && mv -f "$DROPIN.new" "$DROPIN"; } || restore_now "drop-in write FAILED"
$SYSTEMCTL daemon-reload || restore_now "daemon-reload FAILED"
ln -sfn Caddyfile.media-test "$BASE/current" || restore_now "pointer switch FAILED"
$SYSTEMCTL reload $CADDY_UNIT || restore_now "reload FAILED"
sleep 3
$SYSTEMCTL is-active --quiet $CADDY_UNIT || restore_now "Caddy is not active after the reload"
log "Caddy reloaded on the media-test configuration. Watch issuance: journalctl -u $CADDY_UNIT --since '-3min' --no-pager | grep -iE 'obtain|certificate|acme|error'"
log "On a validation error: 05-cancel.sh at once (do not let Caddy retry). When the certificate is there: verify-tester.sh from the tester machine, verify-outsider.sh from 4G, then 05-confirm.sh --external-checks-passed"
$SYSTEMCTL list-timers $CADDY_TIMER.timer --no-pager | sed -n 1,3p
