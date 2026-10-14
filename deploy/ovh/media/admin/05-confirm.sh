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
# Public window (pointer on Caddyfile.public): the apex checks become those of a public, indexable site with
# closed downloads (every sitemap URL, robots.txt, redirects, closed routes, frontend reporting downloads closed);
# the external flag then records verify-outsider.sh --public. Only when everything passes, the public CI profile is
# installed BEFORE the confirmation is recorded and the timer stopped: a failure at any point leaves the timer
# armed, and its rollback removes that profile again, so Caddy and the CI profile always agree.
. "$(dirname "$0")/common.sh"; need_root
[ "${1:-}" = --external-checks-passed ] || die "run the external checks first (media-test: verify-tester.sh <TESTER_IP> and verify-outsider.sh; public: verify-outsider.sh --public); they must end with ALL ... CHECKS PASSED"
take_lock
B=$(latest_backup)
require_current_backup "$B"
caddy_restored_marker "$B" && die "the Caddy rollback already started or ran: this window is over (run 05-caddy.sh again)"
$SYSTEMCTL is-active --quiet $CADDY_TIMER.timer || die "Caddy rollback timer not armed (window over, cancelled, or the VPS rebooted): run 05-cancel.sh, then 05-caddy.sh again"
[ -s "$B/caddy-armed-at" ] || die "no arming record for this Caddy window"
case "$(readlink "$BASE/current")" in
  Caddyfile.media-test) MODE=media-test ;;
  Caddyfile.public) MODE=public; case "$(ci_profile_name)" in closed|public) ;; *) die "unexpected CI profile '$(ci_profile_name)' for a public window" ;; esac ;;
  *) die "Caddy does not point at a staged configuration" ;;
esac
[ -f "$DROPIN" ] && [ ! -L "$DROPIN" ] && [ "$(cat "$DROPIN")" = "$(dropin_text)" ] || die "the media-test drop-in is missing or not the expected one"
$SYSTEMCTL is-active --quiet $CADDY_UNIT || die "Caddy is not active"
if why=$(network_window_problem "$B"); then die "network rules: $why"; fi
tester_list >/dev/null
fails=0
if out=$(dl_gated); then echo "dl: trusted certificate, non-tester refused (403) on every route, noindex + no-referrer"; else printf '%s\n' "$out" >&2; fails=1; fi
if [ "$MODE" = media-test ]; then
  if out=$(apex_protected media); then echo "apex: Basic Auth, noindex, media routes closed, sitemap 404"; else printf '%s\n' "$out" >&2; fails=1; fi
else
  if out=$(apex_public); then printf '%s\n' "$out"; else printf '%s\n' "$out" >&2; fails=1; fi
fi
[ "$fails" = 0 ] || die "origin checks failed: the timer stays armed (automatic rollback at its deadline, or 05-cancel.sh now)"
if [ "$MODE" = public ]; then
  write_public_profile || die "could not install the public CI profile: the timer stays armed"
  [ "$(ci_profile_name)" = public ] || die "public CI profile not in place: the timer stays armed"
  echo "CI profile: public (the promoter now expects this public apex with downloads closed)"
fi
date +%s.%N > "$B/caddy-confirmed"   # under the lock: a restore that was waiting for it will see this and stand down
$SYSTEMCTL stop $CADDY_TIMER.timer
log "Caddy rollback timer disarmed: the $MODE Caddy configuration is now permanent (also at reboot). Revert it with 05-cancel.sh (the CI profile follows)."
