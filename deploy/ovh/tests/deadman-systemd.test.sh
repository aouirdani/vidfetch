#!/bin/sh
# Host side, opt-in (about 4 minutes). A throwaway container runs a REAL systemd as PID 1 (--privileged);
# the host's systemd and firewall are never involved. Firewall and nft are stubs at their production paths.
#  1. real journald: confirm accepts only a public-key login from the tester IP, after the margin
#  2. the arming script is KILLED (kill -9) while the firewall helper hangs, the Caddy pointer is half moved,
#     the first restore attempt fails: systemd alone must still restore everything, retrying
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); id=$$; c=vidfetch-sd-$id; fail=0
trap 'docker rm -f $c >/dev/null 2>&1' EXIT
docker run -d --name $c --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw -v "$src":/r:ro jrei/systemd-debian:12 >/dev/null || exit 2
i=0; until docker exec $c systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ $i -gt 60 ] && { echo "systemd did not start"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
X() { docker exec $c sh -c "$1"; }
A=/r/deploy/ovh/media/admin; BASE=/etc/vidfetch/public-https-test
X "
mkdir -p $BASE /usr/local/libexec /usr/local/bin /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013 /etc/systemd/system/vidfetch-caddy.service.d
echo '[Service]' > /etc/systemd/system/vidfetch-caddy.service; echo x > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
echo ORIGINAL > $BASE/ingress.nft; echo CF > $BASE/Caddyfile; echo BS > $BASE/Caddyfile.bootstrap; echo AUTH > $BASE/auth.caddy; ln -sfn Caddyfile $BASE/current
echo '{\"files\":{}}' > /etc/vidfetch/ci-web-test-guard.json; echo VIDFETCH_CONNECTION_READY=0 > /etc/vidfetch/web.env
printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > $BASE/media-test-ips.env
printf 'NEW\n        tcp dport 80 accept\n        tcp dport 443 ip saddr @testers4 accept\n' > $BASE/ingress.nft.media-test
echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > /var/tmp/live-table
cat > /usr/local/libexec/vidfetch-https-test-firewall <<'F'
#!/bin/sh
if [ -f /var/tmp/fw-hang ]; then rm -f /var/tmp/fw-hang; echo hang > /var/tmp/fw-hanging; sleep 3600; fi
c=\$(cat /var/tmp/fw-fails 2>/dev/null || echo 0); if [ \"\$c\" -gt 0 ]; then echo \$((c-1)) > /var/tmp/fw-fails; echo 'fw: injected failure' >&2; exit 1; fi
if grep -q testers4 $BASE/ingress.nft; then echo 'table inet vidfetch_https_test_ingress { set testers4 {} }' > /var/tmp/live-table; else echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > /var/tmp/live-table; fi
F
cat > /usr/local/bin/nft <<'F'
#!/bin/sh
case \"\$1\" in --check) exit 0;; --file) c=\$(cat /var/tmp/nft-fails 2>/dev/null || echo 0); if [ \"\$c\" -gt 0 ]; then echo \$((c-1)) > /var/tmp/nft-fails; echo 'nft: injected failure' >&2; exit 1; fi; echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > /var/tmp/live-table; exit 0;; esac
if [ \"\$1 \$2\" = 'list ruleset' ]; then echo 'table inet x {}'; else cat /var/tmp/live-table; fi
F
chmod +x /usr/local/libexec/vidfetch-https-test-firewall /usr/local/bin/nft
" || exit 2
X "bash $A/01-backup.sh >/dev/null" || { bad "backup"; exit 1; }
B=$(docker exec $c readlink -f /var/backups/vidfetch-media-test-latest)

echo "# 1. real journald: who may confirm"
X "bash $A/03-network.sh open80 300 >/dev/null" || { bad "arm"; exit 1; }
X "systemctl is-active vidfetch-media-rollback.timer" | grep -q '^active' && ok "systemd timer armed" || bad "timer"
X "logger -t sshd 'Accepted publickey for debian from 203.0.113.9 port 50000 ssh2: ED25519 SHA256:abc'"
X "bash $A/04-confirm.sh" >/dev/null 2>&1 && bad "login inside the margin accepted" || ok "tester login inside the 3 s margin refused (real journal)"
sleep 4
X "logger -t sshd 'Accepted publickey for debian from 198.51.100.7 port 50001 ssh2: ED25519 SHA256:abc'; logger -t sshd 'Accepted password for debian from 203.0.113.9 port 50002 ssh2'; logger -t sshd 'Failed publickey for debian from 203.0.113.9 port 50003 ssh2'"
X "bash $A/04-confirm.sh" >/dev/null 2>&1 && bad "wrong IP / password accepted" || ok "other IP, password login and failed login refused (real journal)"
X "logger -t sshd 'Accepted publickey for debian from 203.0.113.9 port 50004 ssh2: ED25519 SHA256:abc'"
X "bash $A/04-confirm.sh" 2>&1 | grep -q 'new public-key login(s) from tester IP: 203.0.113.9' && ok "public-key login from the tester IP after the margin accepted (real journal)" || bad "valid login refused"
X "systemctl is-active vidfetch-media-rollback.timer" | grep -q '^active' && bad "timer still armed" || ok "timer disarmed after the proof"
X "bash $A/04-cancel.sh" >/dev/null 2>&1 && X "grep -q ORIGINAL $BASE/ingress.nft" && ok "04-cancel restores through the same restore script" || bad "cancel"

echo "# 2. arming script killed mid-apply + half-moved pointer + failing first restore attempt"
X "echo 1 > /var/tmp/fw-hang; rm -f /var/tmp/fw-hanging; bash $A/03-network.sh open80 120 >/var/tmp/arm.log 2>&1 &"
i=0; until docker exec $c test -f /var/tmp/fw-hanging; do i=$((i+1)); [ $i -gt 30 ] && { bad "the apply never started"; exit 1; }; sleep 1; done
KILL='for d in /proc/[0-9]*; do c=$(tr "\\0" " " < $d/cmdline 2>/dev/null); case "$c" in *03-netw""ork.sh*|*vidfetch-https-test-fire""wall*) kill -9 ${d#/proc/} 2>/dev/null;; esac; done; sleep 1'
X "$KILL"
X 'for d in /proc/[0-9]*; do c=$(tr "\0" " " < $d/cmdline 2>/dev/null); case "$c" in *03-netw""ork.sh*|*vidfetch-https-test-fire""wall*) echo ALIVE;; esac; done' | grep -q ALIVE && bad "arming script or helper still alive" || ok "arming script and firewall helper killed -9 (the 'SSH session' is gone)"
X "flock -n $(docker exec $c sh -c 'echo /run/vidfetch-media-test.lock') true" && ok "the lock was released with the dead process (no orphan keeps it)" || bad "lock still held by an orphan"
MARK=$(docker exec $c date +%s)
X "grep -q NEW $BASE/ingress.nft" && ok "state after the kill: ingress.nft already swapped (half applied)" || bad "precondition: file swapped"
X "systemctl is-active vidfetch-media-rollback.timer" | grep -q '^active' && ok "timer armed in systemd, independent of the dead session" || bad "timer"
X "ln -sfn Caddyfile.media-test $BASE/current; printf '[Service]\nEnvironmentFile=$BASE/media-test-ips.env\n' > /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf; systemctl daemon-reload; echo 1 > /var/tmp/fw-fails; echo 1 > /var/tmp/nft-fails"
echo "# waiting for the timer (120 s) and the retry (20 s)..."
sleep 150
X "grep -q ORIGINAL $BASE/ingress.nft" && ok "ingress.nft restored" || bad "ingress.nft NOT restored"
X "[ \"\$(readlink $BASE/current)\" = Caddyfile ]" && ok "Caddy pointer restored" || bad "pointer NOT restored"
X "[ ! -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ]" && ok "media-test drop-in removed" || bad "drop-in left"
X "grep -q testers4 /var/tmp/live-table" && bad "live table still has testers4" || ok "live table without testers4"
J=$(docker exec $c journalctl -t vidfetch-media-rollback --since "@$MARK" --no-pager -o cat 2>/dev/null)
echo "$J" | grep -q "INCOMPLETE" && ok "first attempt failed and said so (injected helper and nft failures)" || bad "no INCOMPLETE logged"
echo "$J" | grep -q "network state restored" && ok "systemd retried and the restore completed" || bad "no completion logged"
X "test -e $B/restored" && ok "'restored' marker written" || bad "marker"
X "bash $A/04-confirm.sh" >/dev/null 2>&1 && bad "confirm after restore" || ok "04-confirm refuses after the automatic restore"
exit $fail
