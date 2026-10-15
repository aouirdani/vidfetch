#!/usr/bin/env bash
# Usage: 10-dl-confirm.sh --external-checks-passed
# Disarms the public-download rollback timer only when:
#   * SSH still works: a NEW public-key login, written to the journal by the SSH daemon itself (root sshd or
#     sshd-session), at least CONFIRM_MARGIN seconds after the new rules went live; any source address (this
#     proves access, not who the tester is);
#   * the live ingress is the public-download one (per-address limits, SSH, refused internal ports);
#   * the public apex is unchanged for search engines (every sitemap URL indexable, robots, redirects) and
#     downloads are still closed (ready=0, no grant, media routes 503);
#   * dl.vidfetch.app answers a non-tester with a trusted certificate and only the gateway routes, which demand a grant.
# The flag records that verify-outsider.sh --public-dl passed from a non-tester network. No --force.
. "$(dirname "$0")/common.sh"; need_root
[ "${1:-}" = --external-checks-passed ] || die "run verify-outsider.sh --public-dl from a non-tester network first; it must end with ALL ... CHECKS PASSED"
take_lock
S=$(latest_dl_snapshot)
[ -e "$S/restore-started" ] || [ -e "$S/restored" ] && die "the rollback already started or ran: this window is over (10-dl-public.sh again)"
$SYSTEMCTL is-active --quiet $DL_TIMER.timer || die "rollback timer not armed (window over, cancelled, or the VPS rebooted): run 10-dl-cancel.sh, then 10-dl-public.sh again"
[ -s "$S/armed-at" ] || die "no arming record (rules not confirmed live)"; ARMED=$(cat "$S/armed-at")
[[ "$ARMED" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "corrupt arming record"
[ "$(readlink "$BASE/current")" = Caddyfile.public-dl ] || die "Caddy does not serve Caddyfile.public-dl"
cmp -s "$BASE/ingress.nft" "$BASE/ingress.nft.public-dl" || die "ingress.nft is not the public-download ingress"
if why=$(public_dl_table_problem); then die "live table: $why"; fi
[ "$(ci_profile_name)" = public ] || die "the CI profile is '$(ci_profile_name)', expected public"
[ "$(ready_value)" = 0 ] || die "ready is '$(ready_value)', expected 0 during this window"
$SYSTEMCTL is-active --quiet $CADDY_UNIT || die "Caddy is not active"
THRESH=$(awk -v a="$ARMED" -v m="$CONFIRM_MARGIN" 'BEGIN{printf "%.6f", a+m}')
SEEN=$($JOURNALCTL _UID=0 _COMM=sshd _COMM=sshd-session --since "@${ARMED%.*}" --no-pager -o short-unix 2>/dev/null \
  | awk -v t="$THRESH" '$1+0 >= t && /Accepted publickey for / { for (i=1;i<=NF;i++) if ($i=="from") print $(i+1) }' | sort -u || true)
[ -n "$SEEN" ] || die "no new public-key SSH login after the rules went live (+${CONFIRM_MARGIN}s): open a NEW ssh connection, then retry"
echo "SSH: new public-key login(s) after the change, from: $(echo $SEEN)"
fails=0
if out=$(apex_public); then printf '%s\n' "$out"; else printf '%s\n' "$out" >&2; fails=1; fi
if out=$(dl_public); then echo "dl: public with a trusted certificate; gateway routes demand a grant (401); nothing else served (404)"; else printf '%s\n' "$out" >&2; fails=1; fi
[ "$fails" = 0 ] || die "checks failed: the timer stays armed (automatic rollback at its deadline, or 10-dl-cancel.sh now)"
date +%s.%N > "$S/confirmed"
$SYSTEMCTL stop $DL_TIMER.timer
log "rollback timer disarmed: dl.vidfetch.app is public for good (downloads still closed until 11-downloads.sh open)"
