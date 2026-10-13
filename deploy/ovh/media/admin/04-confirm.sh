#!/usr/bin/env bash
# Disarms the dead-man timer, but ONLY if sshd has logged a successful login AFTER the timer was armed,
# i.e. a NEW connection was made under the new firewall rules. Sessions opened before the change keep
# working through "ct state established", so they prove nothing. There is deliberately no --force:
# to keep the new rules without that proof, let the timer fire, fix the problem and start again.
. "$(dirname "$0")/common.sh"; need_root
$SYSTEMCTL is-active --quiet $TIMER.timer || die "timer not armed (already fired or never armed): check 'journalctl -t vidfetch-media-rollback'"
B=$(latest_backup); [ -s "$B/armed-at" ] || die "no arming record"; ARMED=$(cat "$B/armed-at")
[[ "$ARMED" =~ ^[0-9]+$ ]] || die "corrupt arming record"
LOGINS=$($JOURNALCTL -u ssh.service -t sshd --since "@$ARMED" --no-pager -o cat 2>/dev/null | grep -E '^Accepted (publickey|password|keyboard-interactive)' || true)
[ -n "$LOGINS" ] || die "no successful SSH login logged since the timer was armed: open a NEW ssh connection from another terminal, then retry"
echo "new SSH logins since arming (sources only):"; echo "$LOGINS" | sed -E 's/^Accepted [a-z-]+ for ([^ ]+) from ([^ ]+) port.*/  user=\1 from=\2/' | sort | uniq -c
$SYSTEMCTL stop $TIMER.timer; log "dead-man timer disarmed; current network state is now permanent (also at reboot: ingress.nft was replaced)"
