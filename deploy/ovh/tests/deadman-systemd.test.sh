#!/bin/sh
# Host side. PROVES the dead-man restore runs from systemd (PID 1), not from the SSH session:
# the session that arms the timer is destroyed before the timer fires. Needs Docker --privileged
# (a throwaway container with its own systemd; the host's systemd/firewall are not involved).
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); id=$$; c=vidfetch-sd-$id; fail=0
trap 'docker rm -f $c >/dev/null 2>&1' EXIT
docker run -d --name $c --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw -v "$src":/r:ro jrei/systemd-debian:12 >/dev/null || exit 2
i=0; until docker exec $c systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ $i -gt 60 ] && { echo "systemd did not start"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
docker exec $c sh -c '
mkdir -p /etc/vidfetch/public-https-test /usr/local/libexec /usr/local/bin /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013 /etc/vidfetch
echo "[Service]" > /etc/systemd/system/vidfetch-caddy.service; echo x > /var/lib/vidfetch-proxy/x
ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
echo ORIGINAL > /etc/vidfetch/public-https-test/ingress.nft; echo CF > /etc/vidfetch/public-https-test/Caddyfile; ln -s Caddyfile /etc/vidfetch/public-https-test/current
echo "NEW" > /etc/vidfetch/public-https-test/ingress.nft.media-test; echo "        tcp dport 443 accept" >> /etc/vidfetch/public-https-test/ingress.nft.media-test
echo BS > /etc/vidfetch/public-https-test/Caddyfile.bootstrap; echo AUTH > /etc/vidfetch/public-https-test/auth.caddy
cat > /usr/local/libexec/vidfetch-https-test-firewall <<F
#!/bin/sh
cp /etc/vidfetch/public-https-test/ingress.nft /var/tmp/applied.\$(date +%s).\$\$
F
chmod +x /usr/local/libexec/vidfetch-https-test-firewall
printf "#!/bin/sh\necho \"table inet vidfetch_https_test_ingress {}\"\n" > /usr/local/bin/nft; chmod +x /usr/local/bin/nft
mkdir -p /etc/vidfetch; echo "{\"files\":{}}" > /etc/vidfetch/ci-web-test-guard.json
' || exit 2
ENVV='VM_CADDY=/bin/true'
docker exec $c sh -c "export $ENVV; bash /r/deploy/ovh/media/admin/01-backup.sh >/dev/null && bash /r/deploy/ovh/media/admin/03-network.sh closed80 120 >/dev/null" || { bad "arm failed"; exit 1; }
# the arming "SSH session" (the docker exec above) is gone now; kill anything left from it
docker exec $c sh -c 'grep -q NEW /etc/vidfetch/public-https-test/ingress.nft && echo APPLIED' | grep -q APPLIED && ok "new ingress applied" || bad "apply"
docker exec $c systemctl is-active vidfetch-media-rollback.timer | grep -q '^active' && ok "timer active in systemd after the arming session ended" || bad "timer not active"
docker exec $c systemctl show vidfetch-media-rollback.timer -pTriggeredBy -pId --value >/dev/null
echo "# waiting for the timer (120 s)..."
sleep 128
docker exec $c sh -c 'grep -q ORIGINAL /etc/vidfetch/public-https-test/ingress.nft' && ok "original ingress restored by the timer with no session attached" || bad "ingress NOT restored"
docker exec $c sh -c '[ "$(readlink /etc/vidfetch/public-https-test/current)" = Caddyfile ]' && ok "Caddy pointer restored" || bad "pointer"
docker exec $c sh -c 'ls /var/tmp/applied.* | wc -l' | grep -qE '^[2-9]' && ok "firewall helper re-run by the restore" || bad "helper not re-run"
docker exec $c journalctl -t vidfetch-media-rollback --no-pager -o cat 2>/dev/null | grep -q "network state restored" && ok "restore logged to the journal" || bad "journal"
docker exec $c bash -c 'export '"$ENVV"'; bash /r/deploy/ovh/media/admin/04-confirm.sh' >/dev/null 2>&1 && bad "confirm after the timer fired should refuse" || ok "04-confirm refuses once the timer has fired"
exit $fail
