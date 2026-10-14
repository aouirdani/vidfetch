#!/usr/bin/env bash
# Usage: 05-confirm.sh --external-checks-passed
# Disarms the Caddy rollback timer only after checks of the REAL origin made from this VPS through loopback,
# under the public hostnames, with strict TLS (system CA store + hostname), as the CI promoter does:
#   * dl.vidfetch.app presents a trusted certificate and refuses a non-tester (loopback) with 403 on every route,
#     gateway routes included, with noindex / no-referrer;
#   * the apex keeps Basic Auth (401 + Basic challenge), noindex, closed media routes (503) and no sitemap (404);
#   * Caddy is active, on the staged config, with the exact env drop-in; the confirmed network rules are intact.
# The flag records that verify-tester.sh (tester machine) and verify-outsider.sh (4G) both passed: those checks
# need other networks and cannot be made from the VPS. No --force.
. "$(dirname "$0")/common.sh"; need_root
[ "${1:-}" = --external-checks-passed ] || die "run verify-tester.sh <TESTER_IP> on the tester machine and verify-outsider.sh from 4G first; both must end with ALL ... CHECKS PASSED"
take_lock
B=$(latest_backup)
require_current_backup "$B"
caddy_restored_marker "$B" && die "the Caddy rollback already started or ran: this window is over (run 05-caddy.sh again)"
$SYSTEMCTL is-active --quiet $CADDY_TIMER.timer || die "Caddy rollback timer not armed (window over, cancelled, or the VPS rebooted): run 05-cancel.sh, then 05-caddy.sh again"
[ -s "$B/caddy-armed-at" ] || die "no arming record for this Caddy window"
[ "$(readlink "$BASE/current")" = Caddyfile.media-test ] || die "Caddy does not point at the staged configuration"
[ -f "$DROPIN" ] && [ ! -L "$DROPIN" ] && [ "$(cat "$DROPIN")" = "$(dropin_text)" ] || die "the media-test drop-in is missing or not the expected one"
$SYSTEMCTL is-active --quiet $CADDY_UNIT || die "Caddy is not active"
if why=$(network_window_problem "$B"); then die "network rules: $why"; fi
tester_list >/dev/null
fails=0
if out=$(dl_gated); then echo "dl: trusted certificate, non-tester refused (403) on every route, noindex + no-referrer"; else printf '%s\n' "$out" >&2; fails=1; fi
if out=$(apex_protected media); then echo "apex: Basic Auth, noindex, media routes closed, sitemap 404"; else printf '%s\n' "$out" >&2; fails=1; fi
[ "$fails" = 0 ] || die "origin checks failed: the timer stays armed (automatic rollback at its deadline, or 05-cancel.sh now)"
date +%s.%N > "$B/caddy-confirmed"   # under the lock: a restore that was waiting for it will see this and stand down
$SYSTEMCTL stop $CADDY_TIMER.timer
log "Caddy rollback timer disarmed: the media-test Caddy configuration is now permanent (also at reboot). Revert it alone with 05-cancel.sh."
