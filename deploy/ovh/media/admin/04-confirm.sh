#!/usr/bin/env bash
# Disarms the dead-man timer only on PROOF of a new, valid SSH login:
#   * written to the journal by the SSH daemon itself (root, executable sshd/sshd-session), not by a forged line,
#   * public-key authentication (no password: a human could finish typing one on a pre-change connection),
#   * logged by sshd at least CONFIRM_MARGIN seconds AFTER the new rules went live (microsecond timestamps),
#   * from an IPv4 listed in the tester configuration ($BASE/media-test-ips.env), exact match.
# Sessions opened before the change keep working (ct state established) and prove nothing. No --force.
. "$(dirname "$0")/common.sh"; need_root
take_lock
B=$(latest_backup)
restored_marker "$B" && die "the automatic restore already started or ran: the window is over (re-run 03-network.sh)"
$SYSTEMCTL is-active --quiet $TIMER.timer || die "timer not armed: check 'journalctl -t vidfetch-media-rollback'"
[ -s "$B/armed-at" ] || die "no arming record (rules not confirmed live)"; ARMED=$(cat "$B/armed-at")
[[ "$ARMED" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "corrupt arming record"
[ -f "$BASE/media-test-ips.env" ] || die "tester configuration missing"
LIST=$(sed -n 's/^VIDFETCH_MEDIA_TEST_IPS=//p' "$BASE/media-test-ips.env" | tail -n1)
[[ "$LIST" =~ ^([0-9]{1,3}(\.[0-9]{1,3}){3}/32)( [0-9]{1,3}(\.[0-9]{1,3}){3}/32)*$ ]] || die "tester list must be /32 IPv4 entries"
[ "$LIST" = "192.0.2.1/32" ] && die "placeholder tester list"
THRESH=$(awk -v a="$ARMED" -v m="$CONFIRM_MARGIN" 'BEGIN{printf "%.6f", a+m}')
SINCE=${ARMED%.*}
# Trusted journal fields only (set by journald from the sender's credentials, not by the sender): entries written
# by a root process whose executable is sshd or sshd-session (OpenSSH >= 9.8, e.g. Debian 13, logs logins from
# sshd-session). A line forged with `logger -t sshd ...` has _COMM=logger and is therefore ignored.
SEEN=$($JOURNALCTL _UID=0 _COMM=sshd _COMM=sshd-session --since "@$SINCE" --no-pager -o short-unix 2>/dev/null \
  | awk -v t="$THRESH" '$1+0 >= t && /Accepted publickey for / { for (i=1;i<=NF;i++) if ($i=="from") print $(i+1) }' | sort | uniq -c || true)
OK=""
for entry in $LIST; do ip=${entry%/32}; echo "$SEEN" | awk -v ip="$ip" '$2==ip {found=1} END{exit !found}' && OK="$OK $ip"; done
if [ -z "$OK" ]; then
  echo "public-key logins since ${THRESH} (armed ${ARMED} + ${CONFIRM_MARGIN}s margin), by source:" >&2; echo "${SEEN:-  (none)}" >&2
  die "no new public-key SSH login from a tester IP ($LIST) after the rules went live: open a NEW connection from the tester machine, then retry"
fi
echo "new public-key login(s) from tester IP:$OK"
date +%s.%N > "$B/confirmed"        # under the lock: a restore that was waiting for it will see this and stand down
$SYSTEMCTL stop $TIMER.timer; log "dead-man timer disarmed; the current network state is now permanent (also at reboot: ingress.nft was replaced)"
