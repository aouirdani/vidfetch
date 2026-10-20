#!/bin/sh
# Host side, opt-in (about 8 minutes). A throwaway Debian 13 container (same release as the VPS) runs a REAL systemd
# as PID 1, a REAL OpenSSH server and the REAL Caddy 2.11.7 under the production unit file
# (deploy/ovh/public-test/vidfetch-caddy.service: User vidfetch-proxy, Type=notify, sandboxing, reload over the
# admin socket). Only the firewall helper and nft are stubs. Certificates come from Caddy's internal CA, added to
# the container's trust store, so the scripts' strict TLS checks run unchanged. The host is never involved.
#  1. the VPS state: network window confirmed with a real key login; 01-backup and 03-network refuse; 05-caddy works
#  2. 05-caddy: drop-in read at reload (tester reaches the gateway, loopback refused), same Caddy PID, timer armed
#  3. 05-confirm: refused without the flag, accepted on the real origin; 05-cancel reverts Caddy only
#  4. the timer fires with no session: Caddy back to the original config, network rules untouched
#  5. Caddy down and unable to start at the first attempt: systemd retries the rollback until Caddy is back
#  6. public launch: 09-ci-helper.sh installs the public-aware promoter; 05-caddy.sh --public; the REAL promoter
#     refuses the public apex while the CI profile is closed and accepts it once 05-confirm.sh installed the public
#     profile; 05-cancel.sh and the timer bring back the protected apex AND the closed profile together
#  7. public downloads: 10-dl-public.sh opens dl.vidfetch.app with downloads closed; 10-dl-confirm.sh after a real
#     key login; 11-downloads.sh open/close moves ready and the CI profile together while the REAL promoter accepts
#     each state; 10-dl-cancel.sh and the timer bring back tester-only dl with the public apex untouched
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); id=$$; c=vidfetch-cw-$id; fail=0
trap 'docker rm -f $c >/dev/null 2>&1' EXIT
arch=$(docker version -f '{{.Server.Arch}}' 2>/dev/null) || exit 2
img=vidfetch-caddywin-test:deb13-$arch
docker build -q --platform "linux/$arch" -t "$img" - >/dev/null <<'DOCKERFILE' || { echo "could not build the test image"; exit 2; }
FROM caddy:2.11.7@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772 AS caddy
FROM debian:13
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv dbus openssh-server openssh-client util-linux procps ca-certificates curl python3 >/dev/null && rm -rf /var/lib/apt/lists/* && systemctl mask getty.target console-getty.service systemd-logind.service >/dev/null 2>&1; mkdir -p /run/sshd
COPY --from=caddy /usr/bin/caddy /opt/vidfetch/tools/caddy-2.11.7/caddy
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKERFILE
docker run -d --name $c --platform "linux/$arch" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock -v "$src":/r:ro "$img" >/dev/null || exit 2
i=0; until docker exec $c systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ $i -gt 60 ] && { echo "systemd did not start"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
X() { docker exec $c sh -c "$1"; }
A=/root/media-test-stage/admin; BASE=/etc/vidfetch/public-https-test; DROPIN=/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
# The toolkit laid out as send-to-vps.sh leaves it on the VPS: admin/ next to Caddyfile.public and promote.py.
X "mkdir -p /root/media-test-stage && cp -R /r/deploy/ovh/media/admin /root/media-test-stage/ && cp /r/deploy/ovh/media/Caddyfile.public /r/deploy/ovh/media/Caddyfile.public-dl /r/deploy/ovh/media/public-dl-ingress.py /r/deploy/ovh/ci/promote.py /root/media-test-stage/" || exit 2
# No Internet ACME in a test: the public file gets the same internal-CA issuer as the two others (below), nothing else.
X "python3 - <<'PY'
import re
for path in ('/root/media-test-stage/Caddyfile.public', '/root/media-test-stage/Caddyfile.public-dl'):
    text, n = re.subn(r'\(http01\) \{.*?\n\}\n', '(http01) {\n    tls internal\n}\n', open(path).read(), count=1, flags=re.S)
    assert n == 1
    open(path, 'w').write(text)
PY" || exit 2
X "systemctl is-active --quiet systemd-journald.service" || { echo "journald is not running in the test container"; exit 2; }
OWNIP=$(docker exec $c sh -c "hostname -I | cut -d' ' -f1")
echo "# setup: Caddy $(docker exec $c /opt/vidfetch/tools/caddy-2.11.7/caddy version | cut -d' ' -f1), tester IP = container address $OWNIP"
X "mkdir -p /root/.ssh && chmod 700 /root/.ssh && ssh-keygen -q -t ed25519 -N '' -f /root/.ssh/id_ed25519 && cat /root/.ssh/id_ed25519.pub > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys && systemctl start ssh.service" || { echo "no sshd"; exit 2; }
LOGIN() { X "ssh -4 -q -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/kh root@$OWNIP true"; }
# Caddy configurations: the live Phase 5 file and the candidate, both from the repository; only the ACME issuer
# is replaced by Caddy's internal CA (no Internet in a test).
X "python3 - <<'PY'
import re
for src, dst in (('/r/deploy/ovh/public-test/Caddyfile', '/tmp/live.caddy'), ('/r/deploy/ovh/media/Caddyfile.test-only', '/tmp/candidate.caddy')):
    text = open(src).read()
    text, n = re.subn(r'\(http01\) \{.*?\n\}\n', '(http01) {\n    tls internal\n}\n', text, count=1, flags=re.S)
    assert n == 1, src
    open(dst, 'w').write(text)
PY" || exit 2
X "
set -e
useradd --system --no-create-home --shell /usr/sbin/nologin vidfetch-proxy
mkdir -p $BASE /usr/local/libexec /usr/local/bin /opt/vidfetch-web-preproduction-20261013 /etc/systemd/system/vidfetch-caddy.service.d /srv/gw/api
ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
cp /tmp/live.caddy $BASE/Caddyfile; cp /tmp/live.caddy $BASE/Caddyfile.bootstrap; ln -sfn Caddyfile $BASE/current
printf 'basic_auth {\n    tester %s\n}\n' \"\$(/opt/vidfetch/tools/caddy-2.11.7/caddy hash-password --plaintext test-only-password)\" > $BASE/auth.caddy
chmod 644 $BASE/*; printf 'table inet vidfetch_https_test_ingress {\n    # ORIGINAL (Cloudflare only)\n}\n' > $BASE/ingress.nft
echo '{\"files\":{}}' > /etc/vidfetch/ci-web-test-guard.json; echo VIDFETCH_CONNECTION_READY=0 > /etc/vidfetch/web.env; chmod 600 /etc/vidfetch/web.env
echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > /var/tmp/live-table
cat > /usr/local/libexec/vidfetch-https-test-firewall <<'F'
#!/bin/sh
cp $BASE/ingress.nft /var/tmp/live-table
echo applied >> /var/tmp/fw-calls
F
cat > /usr/local/bin/nft <<'F'
#!/bin/sh
case \"\$1\" in --check|--file) echo \"nft \$*\" >> /var/tmp/fw-calls; exit 0;; esac
if [ \"\$1 \$2\" = 'list ruleset' ]; then echo 'table inet x {}'; else cat /var/tmp/live-table; fi
F
chmod +x /usr/local/libexec/vidfetch-https-test-firewall /usr/local/bin/nft
echo GATEWAY-REACHED > /srv/gw/api/fetch-info
cat > /etc/systemd/system/vidfetch-https-test-ingress.service <<'U'
[Unit]
Before=vidfetch-caddy.service
[Service]
Type=oneshot
RemainAfterExit=true
ExecStart=/usr/local/libexec/vidfetch-https-test-firewall apply
U
cat > /etc/systemd/system/vidfetch-web-preproduction-20261013.service <<'U'
[Service]
EnvironmentFile=/etc/vidfetch/web.env
ExecStart=/usr/bin/python3 /r/deploy/ovh/tests/fixtures/fake-frontend.py 3001
U
cat > /etc/systemd/system/fake-gateway.service <<'U'
[Service]
ExecStart=/usr/bin/python3 /r/deploy/ovh/tests/fixtures/fake-gateway.py 8789
U
sed 's#^Requires=vidfetch-web-preproduction-20261013.service vidfetch-https-test-ingress.service#Requires=vidfetch-https-test-ingress.service#' /r/deploy/ovh/public-test/vidfetch-caddy.service > /etc/systemd/system/vidfetch-caddy.service
grep -q '^Requires=vidfetch-https-test-ingress.service$' /etc/systemd/system/vidfetch-caddy.service
cp /r/deploy/ovh/ci/caddy-frontend-dependency.conf /etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf
systemctl daemon-reload
systemctl start fake-gateway.service vidfetch-caddy.service
" || { echo "setup failed"; X "journalctl -u vidfetch-caddy --no-pager | tail -20"; exit 2; }
ROOT=/var/lib/vidfetch-proxy/caddy/pki/authorities/local/root.crt
i=0; until docker exec $c test -s $ROOT; do i=$((i+1)); [ $i -gt 30 ] && { echo "Caddy internal CA not created"; X "journalctl -u vidfetch-caddy --no-pager | tail -20"; exit 2; }; sleep 1; done
X "cp $ROOT /usr/local/share/ca-certificates/vidfetch-test-caddy-root.crt && update-ca-certificates >/dev/null 2>&1" || exit 2
code() { docker exec $c curl -s -m 10 -o /dev/null -w '%{http_code}' "$@"; }     # strict TLS: never -k
i=0; until [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ]; do i=$((i+1)); [ $i -gt 30 ] && { echo "apex not served with a trusted certificate"; exit 2; }; sleep 1; done
ok "(setup) real Caddy under the production unit serves the live config: apex 401 through loopback, strict TLS"
PID0=$(docker exec $c systemctl show vidfetch-caddy -p MainPID --value)

echo "# 1. the state reached on the VPS: network window confirmed"
R=/var/tmp/render
X "mkdir -p $R && cd $R && python3 -c \"import importlib.util, ipaddress, json; spec = importlib.util.spec_from_file_location('ri', '/r/deploy/ovh/media/render-ingress.py'); r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r); g = json.load(open('/r/deploy/ovh/public-test/cloudflare-ranges.json'))['ranges']; open('ingress.nft', 'w').write(r.render([ipaddress.ip_network('$OWNIP/32')], g['4'], g['6'], True))\" && printf 'VIDFETCH_MEDIA_TEST_IPS=$OWNIP/32\n' > media-test-ips.env && cp /tmp/candidate.caddy Caddyfile.test-only && sha256sum ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS"
X "bash $A/01-backup.sh >/dev/null && bash $A/02-stage.sh $R" >/tmp/cw-stage-$id 2>&1 && grep -q 'Valid configuration' /tmp/cw-stage-$id && ok "01-backup, then 02-stage with a REAL caddy validate of the candidate (as vidfetch-proxy)" || { bad "backup/stage: $(tail -3 /tmp/cw-stage-$id)"; exit 1; }
rm -f /tmp/cw-stage-$id
B=$(docker exec $c readlink -f /var/backups/vidfetch-media-test-latest)
X "bash $A/03-network.sh open80 300 >/dev/null" || { bad "03-network"; exit 1; }
sleep 4; LOGIN && X "bash $A/04-confirm.sh >/dev/null" && X "test -e $B/confirmed" && ! X "systemctl is-active --quiet vidfetch-media-rollback.timer" && ok "network window confirmed by a REAL public-key login from the tester IP (04-confirm.sh)" || { bad "network confirm"; exit 1; }
X "bash $A/01-backup.sh" >/dev/null 2>&1 && bad "01-backup accepted" || ok "01-backup refuses, as on the VPS"
X "bash $A/03-network.sh open80 300" >/dev/null 2>&1 && bad "03 re-armed" || ok "03-network refuses, as on the VPS"
NET0=$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")

echo "# 2. 05-caddy.sh on the real Caddy"
X "bash $A/05-caddy.sh --port80-verified-from-outside 600" >/tmp/cw-05-$id 2>&1 && ok "05-caddy.sh succeeds" || { bad "05-caddy: $(tail -5 /tmp/cw-05-$id)"; X "journalctl -u vidfetch-caddy --no-pager | tail -15"; exit 1; }
rm -f /tmp/cw-05-$id
X "systemctl is-active --quiet vidfetch-caddy-rollback.timer" && X "systemctl show vidfetch-caddy-rollback.service -p ExecStart --value" | grep -q "$B/restore-caddy.sh" && ok "systemd rollback timer armed, running restore-caddy.sh from the backup" || bad "rollback timer"
[ "$(docker exec $c systemctl show vidfetch-caddy -p MainPID --value)" = "$PID0" ] && ok "same Caddy process (reload, not restart)" || bad "Caddy was restarted"
[ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 403 ] && ok "dl: trusted certificate, loopback (non-tester) refused 403 on a gateway route" || bad "dl loopback"
[ "$(docker exec $c curl -s -m 10 --resolve dl.vidfetch.app:443:$OWNIP https://dl.vidfetch.app/api/fetch-info)" = GATEWAY-REACHED ] && ok "dl: the tester IP reaches the gateway: the drop-in's tester list was read at reload" || bad "tester does not reach the gateway (drop-in env not applied?)"
[ "$(code --resolve dl.vidfetch.app:443:$OWNIP https://dl.vidfetch.app/api/health)" = 404 ] && ok "dl: tester still cannot reach an unlisted route (404)" || bad "dl unlisted route"
[ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && [ "$(code -X POST --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download-access)" = 401 ] && ok "apex: Basic Auth kept, /api/download-access behind it" || bad "apex after switch"
[ "$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")" = "$NET0" ] && ok "network untouched: same ingress.nft, same live table, no firewall call" || bad "network changed by 05-caddy"

echo "# 3. 05-confirm.sh and 05-cancel.sh"
X "bash $A/05-confirm.sh" >/dev/null 2>&1 && bad "confirm without flag" || ok "05-confirm refuses without --external-checks-passed"
OUT=$(docker exec $c bash $A/05-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q 'dl: trusted certificate' && echo "$OUT" | grep -q 'apex: Basic Auth' && ok "05-confirm accepts on the REAL origin (strict TLS through loopback)" || bad "confirm on the real origin: $OUT"
! X "systemctl is-active --quiet vidfetch-caddy-rollback.timer" && X "test -s $B/caddy-confirmed" && ok "Caddy rollback timer disarmed, confirmation recorded" || bad "state after confirm"
X "bash $A/05-cancel.sh >/dev/null" && [ "$(docker exec $c readlink $BASE/current)" = Caddyfile ] && ! X "test -e $DROPIN" && ok "05-cancel: original pointer, no drop-in" || bad "05-cancel"
[ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/)" = 000 ] && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && ok "...the real Caddy no longer serves dl; apex 401" || bad "after cancel"
[ "$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")" = "$NET0" ] && X "test -e $B/confirmed" && ok "...network rules still the confirmed ones" || bad "network changed by 05-cancel"

echo "# 4. no confirmation: the systemd timer restores Caddy alone"
X "bash $A/05-caddy.sh --port80-verified-from-outside 120 >/dev/null" || { bad "05-caddy (timer run)"; exit 1; }
[ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/)" = 403 ] && ok "(setup) media-test config live" || bad "setup 4"
echo "# waiting for the Caddy rollback timer (120 s)..."
i=0; until X "test -e $B/caddy-restored"; do i=$((i+1)); [ $i -gt 200 ] && break; sleep 1; done
[ "$(docker exec $c readlink $BASE/current)" = Caddyfile ] && ! X "test -e $DROPIN" && X "test -e $B/caddy-restored" && ok "timer fired with no session: original pointer, drop-in removed, restore recorded" || bad "timer restore"
[ "$(docker exec $c systemctl show vidfetch-caddy -p MainPID --value)" = "$PID0" ] && [ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/)" = 000 ] && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && ok "Caddy reloaded in place: dl gone, apex 401" || bad "Caddy after the timer"
[ "$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")" = "$NET0" ] && X "test -e $B/confirmed" && ! X "systemctl is-active --quiet vidfetch-media-rollback.timer" && ok "network rules untouched by the Caddy rollback (no firewall call, still confirmed)" || bad "network touched by the Caddy rollback"
X "journalctl -t vidfetch-caddy-rollback --no-pager" | grep -q 'Caddy restored' && ok "rollback logged under vidfetch-caddy-rollback" || bad "journal"
X "bash $A/05-confirm.sh --external-checks-passed" >/dev/null 2>&1 && bad "confirm after rollback" || ok "05-confirm refuses once the rollback ran"

echo "# 5. Caddy down and its configuration unreadable at the first attempt: systemd retries"
X "bash $A/05-caddy.sh --port80-verified-from-outside 120 >/dev/null" || { bad "05-caddy (retry run)"; exit 1; }
X "systemctl stop vidfetch-caddy.service; chmod 600 $BASE/Caddyfile"
echo "# waiting for the first (failing) rollback attempt..."
i=0; until X "journalctl -t vidfetch-caddy-rollback --no-pager | grep -q 'INCOMPLETE'"; do i=$((i+1)); [ $i -gt 200 ] && break; sleep 1; done
X "journalctl -t vidfetch-caddy-rollback --no-pager | grep -q 'INCOMPLETE'" && ! X "test -e $B/caddy-restored" && ok "first attempt: Caddy cannot start, restore reported INCOMPLETE (exit 1)" || bad "first attempt"
X "chmod 644 $BASE/Caddyfile"
i=0; until X "test -e $B/caddy-restored"; do i=$((i+1)); [ $i -gt 90 ] && break; sleep 1; done
X "test -e $B/caddy-restored" && X "systemctl is-active --quiet vidfetch-caddy.service" && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && ok "systemd retried (Restart=on-failure): Caddy started on the original config, apex 401" || bad "retry"

echo "# 6. public launch: Caddy and the CI promoter switch together, and come back together"
# The CI helper installed today: the promoter of the previous release (no public profile) and its library.
OLD=$(cd "$src" && git show 8675f55d:deploy/ovh/ci/promote.py 2>/dev/null) || OLD=""
[ -n "$OLD" ] || { echo "SKIP 6: previous promoter not in this clone"; exit $fail; }
X "mkdir -p /usr/local/libexec/vidfetch-ci /opt/vidfetch-ci-web && cp /r/deploy/ovh/ci/release-lib.py /usr/local/libexec/vidfetch-ci/ && echo '{\"release\":\"test\"}' > /tmp/manifest.json" || exit 2
printf '%s\n' "$OLD" | docker exec -i $c sh -c 'cat > /usr/local/libexec/vidfetch-ci/promote.py && chmod 0755 /usr/local/libexec/vidfetch-ci/promote.py'
X "bash $A/05-caddy.sh --port80-verified-from-outside --public 600" >/dev/null 2>&1 && bad "public window with the old promoter" || ok "05-caddy --public refuses while the installed promoter does not know the public profile"
OUT=$(docker exec $c bash $A/09-ci-helper.sh install 2>&1); echo "$OUT" | grep -q '"profile": "closed"' && X "grep -q '^PUBLIC_PROFILE' /usr/local/libexec/vidfetch-ci/promote.py" && ok "09-ci-helper install: public-aware promoter in place, its real status runs (profile closed)" || bad "09-ci-helper install: $OUT"
PIDS0=$(docker exec $c sh -c 'for u in ssh vidfetch-caddy vidfetch-web-preproduction-20261013 fake-gateway; do systemctl show $u -p MainPID --value; done | tr "\n" " "')
NET1=$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")
# The success marker is assembled at run time: Python 3.13 tracebacks quote the -c source, which must never match.
PROMOTE="python3 -c 'import runpy; runpy.run_path(\"/usr/local/libexec/vidfetch-ci/promote.py\")[\"origin_health\"](); print(\"ORIGIN\", \"OK\")'"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "(control) the real promoter accepts today's protected apex under the closed profile" || bad "promoter on the protected apex"
hdr() { docker exec $c curl -s -m 10 -D - -o /dev/null "$@" | tr -d '\r'; }
X "bash $A/05-caddy.sh --port80-verified-from-outside --public 600" >/tmp/cw-pub-$id 2>&1 && ok "05-caddy --public succeeds on the real Caddy" || { bad "05-caddy --public: $(tail -4 /tmp/cw-pub-$id)"; X "journalctl -u vidfetch-caddy --no-pager | tail -12"; exit 1; }
rm -f /tmp/cw-pub-$id
h=$(hdr --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)
echo "$h" | head -1 | grep -q ' 200' && ! echo "$h" | grep -qi '^x-robots-tag' && ! echo "$h" | grep -qi '^www-authenticate' && ok "apex public: 200, no credentials, no X-Robots-Tag (strict TLS through loopback)" || bad "apex public headers: $(echo "$h" | head -6 | tr '\n' ' ')"
[ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download)" = 503 ] && [ "$(code -X POST -H 'Content-Type: application/json' -d '{}' --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download-access)" = 503 ] && hdr --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download | grep -qi '^x-robots-tag: noindex' && ok "downloads stay closed: media route 503, no grant (503), noindex on the APIs" || bad "closed downloads"
[ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 403 ] && [ "$(docker exec $c curl -s -m 10 --resolve dl.vidfetch.app:443:$OWNIP https://dl.vidfetch.app/api/fetch-info)" = GATEWAY-REACHED ] && ok "dl unchanged: trusted certificate, non-tester 403, tester reaches the gateway" || bad "dl in the public window"
X "test ! -e /etc/vidfetch/ci-media-test-profile.json" && ok "during the window the CI profile is still closed" || bad "profile during the window"
X "$PROMOTE" 2>&1 | grep -q 'Origin test protection failed' && ok "the real promoter REFUSES the public apex while the CI profile is closed (no CI deploy can slip in)" || bad "promoter during the window"
OUT=$(docker exec $c bash $A/05-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q 'sitemap: 3 URL(s) checked' && echo "$OUT" | grep -q 'CI profile: public' && ok "05-confirm (public) accepts the real origin: sitemap pages, robots, redirect, closed downloads, dl; public profile installed" || bad "05-confirm public: $OUT"
! X "systemctl is-active --quiet vidfetch-caddy-rollback.timer" && ok "rollback timer disarmed" || bad "timer still armed"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "the real promoter now ACCEPTS the public apex under the public profile (CI deploys and rollback keep working)" || bad "promoter after confirm: $(docker exec $c sh -c "$PROMOTE" 2>&1 | tail -1)"
X "bash $A/05-cancel.sh >/dev/null" && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && X "test ! -e /etc/vidfetch/ci-media-test-profile.json" && ok "05-cancel: Basic Auth back AND the CI profile closed again" || bad "05-cancel public"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "...and the real promoter accepts the protected apex again (Caddy and CI agree)" || bad "promoter after cancel"
X "bash $A/05-caddy.sh --port80-verified-from-outside --public 120 >/dev/null" || { bad "05-caddy --public (timer run)"; exit 1; }
echo "# waiting for the Caddy rollback timer of the public window (120 s)..."
i=0; until X "test -e \$(readlink -f /var/backups/vidfetch-media-test-latest)/caddy-restored"; do i=$((i+1)); [ $i -gt 200 ] && break; sleep 1; done
[ "$(docker exec $c readlink $BASE/current)" = Caddyfile ] && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 401 ] && X "test ! -e /etc/vidfetch/ci-media-test-profile.json" && ok "no confirmation: the timer alone brings back the protected apex, CI profile closed" || bad "public timer rollback"
[ "$(docker exec $c sh -c "sha256sum $BASE/ingress.nft /var/tmp/live-table | cut -c1-64; cat /var/tmp/fw-calls | wc -l")" = "$NET1" ] && ok "the whole public launch touched no network rule (same ingress.nft, same live table, no firewall call)" || bad "network touched by the public launch"
PIDS1=$(docker exec $c sh -c 'for u in ssh vidfetch-caddy vidfetch-web-preproduction-20261013 fake-gateway; do systemctl show $u -p MainPID --value; done | tr "\n" " "')
[ "$PIDS1" = "$PIDS0" ] && ok "SSH, Caddy, frontend and gateway kept the same processes (reloads only, nothing restarted)" || bad "PIDs changed: $PIDS0 -> $PIDS1"

echo "# 7. public downloads on the real Caddy, with the real CI promoter"
X "bash $A/05-caddy.sh --port80-verified-from-outside --public 600 >/dev/null && bash $A/05-confirm.sh --external-checks-passed >/dev/null" && ok "(setup) public apex confirmed again, CI profile public" || { bad "setup 7"; exit 1; }
PIDS3=$(docker exec $c sh -c 'for u in ssh vidfetch-caddy fake-gateway; do systemctl show $u -p MainPID --value; done | tr "\n" " "')
X "bash $A/10-dl-public.sh 600" >/tmp/cw-dl-$id 2>&1 && ok "10-dl-public.sh succeeds (dl public, downloads closed)" || { bad "10-dl-public: $(tail -5 /tmp/cw-dl-$id)"; X "journalctl -u vidfetch-caddy --no-pager | tail -12"; exit 1; }
rm -f /tmp/cw-dl-$id
S=$(docker exec $c readlink -f /var/backups/vidfetch-public-dl-latest)
[ "$(code -X POST -H 'Content-Type: application/json' -d '{}' --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 401 ] && ok "a non-tester now reaches the gateway through the real Caddy, which demands a grant (401)" || bad "public dl gateway route"
[ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/)" = 404 ] && [ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/health)" = 404 ] && ok "dl serves nothing but the gateway routes (404)" || bad "public dl unlisted routes"
h=$(hdr --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)
echo "$h" | head -1 | grep -q ' 200' && ! echo "$h" | grep -qi '^x-robots-tag' && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download)" = 503 ] && ok "the apex is unchanged: public, indexable, media routes closed" || bad "apex during public dl"
X "grep -q dl_conn4 /var/tmp/live-table && grep -q 'tcp dport 443 ip saddr @testers4 accept' $S/ingress.nft && grep -q 'tcp dport 22 accept' $BASE/ingress.nft" && ok "live table public with per-address limits; SSH rule kept; the snapshot holds the tester ingress" || bad "ingress after open"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "the real promoter (profile public) still accepts the apex" || bad "promoter during the dl window"
X "bash $A/10-dl-confirm.sh --external-checks-passed" >/dev/null 2>&1 && bad "dl confirmed without a new SSH login" || ok "10-dl-confirm refuses without a NEW key login after the change"
sleep 4; LOGIN || bad "login"
OUT=$(docker exec $c bash $A/10-dl-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q 'SSH: new public-key login' && echo "$OUT" | grep -q 'dl: public with a trusted certificate' && echo "$OUT" | grep -q 'sitemap: 3 URL(s) checked' && ok "10-dl-confirm accepts: real key login, public apex (SEO), public dl, closed downloads" || bad "10-dl-confirm: $OUT"
! X "systemctl is-active --quiet vidfetch-dl-rollback.timer" && ok "rollback timer disarmed" || bad "dl timer still armed"
X "bash $A/11-downloads.sh open" >/dev/null 2>&1 && bad "downloads opened without secrets" || ok "11-downloads open refuses without the Turnstile and signing secrets"
X "printf 'VIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app\nTURNSTILE_SITE_KEY=0x4AAAAAAA-test-only\nTURNSTILE_SECRET_KEY=test-only-not-a-secret\nVIDFETCH_ACCESS_SIGNING_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n' >> /etc/vidfetch/web.env"
# the engine and gateway units name their bundles, and the active release manifest lists the same ones (as on the VPS)
docker exec -i $c sh -c 'cat > /root/release-fixture.sh' <<'FIX'
set -e; mkdir -p /srv/bundles; printf engine > /srv/bundles/vidfetch-ovh.cjs; printf gateway > /srv/bundles/vidfetch-gateway.cjs
for u in vidfetch:vidfetch-ovh vidfetch-gateway:vidfetch-gateway; do printf '[Service]\nExecStart=/usr/bin/env node /srv/bundles/%s.cjs\n' "${u#*:}" > "/etc/systemd/system/${u%%:*}.service"; done
systemctl daemon-reload
python3 -c 'import hashlib,json; m=json.load(open("/tmp/manifest.json")); h=lambda f: hashlib.sha256(open(f,"rb").read()).hexdigest()
m["files"]={"backend/vidfetch-ovh.cjs": h("/srv/bundles/vidfetch-ovh.cjs"), "backend/vidfetch-gateway.cjs": h("/srv/bundles/vidfetch-gateway.cjs")}; json.dump(m, open("/tmp/manifest.json","w"))'
FIX
X "bash /root/release-fixture.sh" || { bad "release fixture"; exit 1; }
X "printf 'older gateway' > /srv/bundles/vidfetch-gateway.cjs"
for cmd in "11-downloads.sh open" "set-ready.sh 1"; do
  OUT=$(docker exec $c bash $A/$cmd 2>&1) && bad "$cmd opened downloads in front of an older gateway" || {
    printf '%s' "$OUT" | grep -q 'not those of the active frontend release' && ok "$cmd refuses while the gateway in service is not the active release's" || bad "$cmd: $(printf '%s' "$OUT" | tail -1)"; }
done
X "grep -q '^VIDFETCH_CONNECTION_READY=0$' /etc/vidfetch/web.env && printf gateway > /srv/bundles/vidfetch-gateway.cjs" || bad "ready changed by a refused opening"
OUT=$(docker exec $c bash $A/11-downloads.sh open 2>&1); rc=$?
[ $rc = 0 ] && X "grep -q '^VIDFETCH_CONNECTION_READY=1$' /etc/vidfetch/web.env && grep -q public-downloads /etc/vidfetch/ci-media-test-profile.json" && ok "11-downloads open: ready=1 and CI profile public-downloads, origin checks passed" || bad "11-downloads open: $OUT"
docker exec $c curl -s -m 5 http://127.0.0.1:3001/api/health | grep -q '"available":true' && ok "the frontend (restarted alone) now offers downloads" || bad "frontend not open"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "the REAL promoter accepts the open site under public-downloads (apex and dl checks: CI deploys and rollback keep working)" || bad "promoter public-downloads: $(docker exec $c sh -c "$PROMOTE" 2>&1 | tail -1)"
OUT=$(docker exec $c bash $A/11-downloads.sh close 2>&1); rc=$?
[ $rc = 0 ] && X "grep -q '^VIDFETCH_CONNECTION_READY=0$' /etc/vidfetch/web.env && grep -q '\"profile\":\"public\"' /etc/vidfetch/ci-media-test-profile.json" && docker exec $c curl -s -m 5 http://127.0.0.1:3001/api/health | grep -q '"available":false' && ok "11-downloads close: ready=0, CI profile public, the frontend closed again" || bad "11-downloads close: $OUT"
X "$PROMOTE" 2>/dev/null | grep -q 'ORIGIN OK' && ok "the real promoter accepts the closed state under public" || bad "promoter after close"
X "bash $A/10-dl-cancel.sh >/dev/null" && [ "$(docker exec $c readlink $BASE/current)" = Caddyfile.public ] && X "cmp -s $S/ingress.nft $BASE/ingress.nft && ! grep -q dl_conn4 /var/tmp/live-table" && [ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 403 ] && ok "10-dl-cancel: tester-only dl again (non-tester 403), tester ingress byte-identical" || bad "10-dl-cancel"
[ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 200 ] && ok "...and the apex is still public (never back to Basic Auth)" || bad "apex after 10-dl-cancel"
X "bash $A/10-dl-public.sh 120 >/dev/null" || { bad "10-dl-public (timer run)"; exit 1; }
S2=$(docker exec $c readlink -f /var/backups/vidfetch-public-dl-latest)
[ "$(code -X POST -d '{}' --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 401 ] && ok "(setup) dl public again" || bad "setup timer run"
echo "# waiting for the public-download rollback timer (120 s)..."
i=0; until X "test -e $S2/restored"; do i=$((i+1)); [ $i -gt 200 ] && break; sleep 1; done
[ "$(docker exec $c readlink $BASE/current)" = Caddyfile.public ] && X "test -e $S2/restored && cmp -s $S2/ingress.nft $BASE/ingress.nft && ! grep -q dl_conn4 /var/tmp/live-table" && [ "$(code --resolve dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info)" = 403 ] && [ "$(code --resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/)" = 200 ] && ok "no confirmation: the timer alone brings back tester-only dl; the apex stays public" || bad "dl timer rollback"
X "grep -q '\"profile\":\"public\"' /etc/vidfetch/ci-media-test-profile.json && grep -q '^VIDFETCH_CONNECTION_READY=0$' /etc/vidfetch/web.env" && ok "...CI profile public and ready=0 throughout" || bad "profile or ready after the dl rollback"
PIDS4=$(docker exec $c sh -c 'for u in ssh vidfetch-caddy fake-gateway; do systemctl show $u -p MainPID --value; done | tr "\n" " "')
[ "$PIDS4" = "$PIDS3" ] && ok "SSH, Caddy and gateway kept their processes through section 7 (only the frontend restarted, by 11-downloads)" || bad "PIDs changed: $PIDS3 -> $PIDS4"
LOGIN && ok "SSH key login still accepted at the end" || bad "SSH"
exit $fail
