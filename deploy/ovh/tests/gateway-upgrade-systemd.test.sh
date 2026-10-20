#!/bin/sh
# Host side, opt-in (about 4 minutes). Upgrade and rollback of the gateway on Debian 13 with a REAL systemd, the
# REAL bundle that runs on the VPS today (fixture) and the REAL gateway bundle built from this checkout, under
# Node 22. A throwaway privileged container plays the VPS; nothing outside it is touched. Exit 2 = environment.
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); cd "$src" || exit 2
command -v docker >/dev/null && command -v node >/dev/null || exit 2
id=$$; c=vidfetch-gw-$id; T=$(mktemp -d); fail=0
trap 'docker rm -f $c >/dev/null 2>&1; rm -f -- "$T/new-gateway.cjs" "$T/setup.sh"; rmdir -- "$T" 2>/dev/null' EXIT
node backend/gateway/build.mjs "$T/new-gateway.cjs" >/dev/null 2>&1 || { echo "cannot build the gateway bundle (node_modules missing?)"; exit 2; }
OLD_FIXTURE=deploy/ovh/tests/fixtures/gateway-live-20261012.cjs.fixture
arch=$(docker version -f '{{.Server.Arch}}' 2>/dev/null) || exit 2
img=vidfetch-gateway-test:deb13-node22-$arch
docker build -q --platform "linux/$arch" -t "$img" - >/dev/null <<'DOCKERFILE' || { echo "could not build the test image"; exit 2; }
FROM node:22-bookworm-slim AS node
FROM debian:13
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv dbus python3 iproute2 procps util-linux ca-certificates libstdc++6 >/dev/null && rm -rf /var/lib/apt/lists/* && systemctl mask getty.target console-getty.service systemd-logind.service >/dev/null 2>&1
COPY --from=node /usr/local/bin/node /opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKERFILE
docker run -d --name $c --platform "linux/$arch" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock \
  -v "$src":/r:ro -v "$T":/t:ro "$img" >/dev/null || exit 2
i=0; until docker exec $c systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ $i -gt 60 ] && { echo "systemd did not start"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
X() { docker exec $c bash -c "umask 022; $1"; }     # docker exec starts with umask 0000; the VPS creates root files 0644
G=/r/deploy/ovh/media/admin/08-gateway.sh
OLD=/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4/vidfetch-gateway.cjs
CANARY=CANARY-GATEWAY-SECRET-5d1c

cat > "$T/setup.sh" <<'SETUP'
set -e
umask 022
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-gateway
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-worker
R=/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4; mkdir -p $R /etc/vidfetch /var/backups
install -o root -g root -m 0644 /r/deploy/ovh/tests/fixtures/gateway-live-20261012.cjs.fixture $R/vidfetch-gateway.cjs
cat > $R/vidfetch-ovh.cjs <<'JS'
// Stand-in engine for the test: only the health endpoint the gateway relays.
require("node:http").createServer((req, res) => {
  if (req.url === "/api/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, engine: { isolationProfile: "vidfetch-uid-nft-v1", ytDlp: "test" } })); }
  else { res.writeHead(404); res.end("{}"); }
}).listen(8788, "127.0.0.1");
JS
chmod 0644 $R/vidfetch-ovh.cjs
KEY=$(python3 -c 'import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="))')
printf 'VIDFETCH_GATEWAY_ENABLED=1\nVIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app\nVIDFETCH_SITE_ORIGINS=https://vidfetch.app\nVIDFETCH_QUOTA_DB=/var/lib/vidfetch-gateway/quota.sqlite\nVIDFETCH_ISOLATION_MODE=uid-nft\nVIDFETCH_PRIVATE_BACKEND=http://127.0.0.1:8788\nVIDFETCH_QUEUE_ENABLED=1\nVIDFETCH_ACCESS_SIGNING_KEY=%s\nUNRELATED_SECRET=%s\n' "$KEY" "$1" > /etc/vidfetch/gateway.env
chmod 0600 /etc/vidfetch/gateway.env; : > /etc/vidfetch/worker.env; chmod 0600 /etc/vidfetch/worker.env
printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env; chmod 0600 /etc/vidfetch/web.env   # downloads closed, as during a gateway change
echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json; chmod 0600 /etc/vidfetch/ci-web-test-guard.json
N=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node
cat > /etc/systemd/system/vidfetch.service <<UNIT
[Unit]
Description=VidFetch isolated video engine (test stand-in)
[Service]
Type=simple
User=vidfetch-worker
Group=vidfetch-worker
EnvironmentFile=/etc/vidfetch/worker.env
ExecStart=$N --max-old-space-size=192 $R/vidfetch-ovh.cjs
Restart=on-failure
RestartSec=10
[Install]
WantedBy=multi-user.target
UNIT
# The gateway unit is the one read on the VPS on 13 Oct 2026, unchanged except nothing: same hardening, limits, paths.
cat > /etc/systemd/system/vidfetch-gateway.service <<UNIT
[Unit]
Description=VidFetch authenticated admission and streaming gateway (loopback only)
After=vidfetch.service
Requires=vidfetch.service
StartLimitIntervalSec=300
StartLimitBurst=3

[Service]
Type=simple
User=vidfetch-gateway
Group=vidfetch-gateway
WorkingDirectory=/var/lib/vidfetch-gateway
EnvironmentFile=/etc/vidfetch/gateway.env
ExecStart=$N --max-old-space-size=96 $R/vidfetch-gateway.cjs
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
KillMode=control-group
StateDirectory=vidfetch-gateway
StateDirectoryMode=0700
UMask=0077
NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryAccounting=true
MemoryHigh=192M
MemoryMax=256M
MemorySwapMax=0
CPUAccounting=true
CPUQuota=50%
TasksMax=64
LimitNOFILE=1024
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
# active frontend release holding the expected gateway bundle, as the CI promoter leaves it
release() {  # release NAME GATEWAY_FILE -> prints the gateway sha256
  d=/opt/vidfetch-ci-web/releases/$1; mkdir -p $d/backend
  install -o root -g root -m 0644 "$2" $d/backend/vidfetch-gateway.cjs; install -o root -g root -m 0644 $R/vidfetch-ovh.cjs $d/backend/vidfetch-ovh.cjs
  g=$(sha256sum $d/backend/vidfetch-gateway.cjs | cut -c1-64); e=$(sha256sum $d/backend/vidfetch-ovh.cjs | cut -c1-64)
  printf '{"release":"%s","files":{"backend/vidfetch-gateway.cjs":"%s","backend/vidfetch-ovh.cjs":"%s"}}' "$1" "$g" "$e" > $d/manifest.json
  echo "$g"
}
release 1111111111111111111111111111111111111111 /t/new-gateway.cjs > /root/expected.sha
echo 'process.exit(1);' > /root/broken.cjs;  release 2222222222222222222222222222222222222222 /root/broken.cjs > /root/broken.sha
release 3333333333333333333333333333333333333333 $R/vidfetch-gateway.cjs > /root/stale.sha      # parses and serves, but is the OLD code
mkdir -p /opt/vidfetch-web-preproduction-20261013
ln -sfn /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current
systemctl daemon-reload; systemctl start vidfetch.service vidfetch-gateway.service
SETUP
docker exec $c bash /t/setup.sh "$CANARY" >/dev/null 2>&1 || { echo "setup failed"; docker exec $c bash -c 'systemctl status vidfetch-gateway --no-pager | tail -15'; exit 2; }
i=0; until X "ss -Hltn | grep -q '127.0.0.1:8789'" ; do i=$((i+1)); [ $i -gt 30 ] && { echo "the old gateway did not start"; X "journalctl -u vidfetch-gateway --no-pager | tail -12"; exit 2; }; sleep 1; done
EXPECTED=$(docker exec $c cat /root/expected.sha); OLDSHA=$(docker exec $c sha256sum $OLD | cut -c1-64)
NEWPATH=/opt/vidfetch/releases/gateway-$(echo "$EXPECTED" | cut -c1-16)/vidfetch-gateway.cjs
DROPIN=/etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf
pidgw() { docker exec $c systemctl show vidfetch-gateway.service -p MainPID --value; }
pideng() { docker exec $c systemctl show vidfetch.service -p MainPID --value; }
running() { docker exec $c bash -c 'tr "\0" "\n" < /proc/$(systemctl show vidfetch-gateway.service -p MainPID --value)/cmdline | grep "\.cjs$"'; }
state() { docker exec $c bash -c 'find /etc/systemd/system/vidfetch-gateway.service /etc/systemd/system/vidfetch-gateway.service.d /etc/systemd/system/vidfetch.service /etc/vidfetch /opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4 -type f -exec sha256sum {} + 2>/dev/null | sort; stat -c "%n %a %u:%g" /etc/vidfetch/gateway.env'; }
ENG0=$(pideng); GW0=$(pidgw); S0=$(state)

echo "# 1. check is read-only and describes the gap"
OUT=$(docker exec $c bash $G check "$EXPECTED" 2>&1)
[ "$OLDSHA" = a703f269641fc6c38fce74d4e7ff7f47ef5fe54a64b3e104dbab2082481dc1d5 ] && ok "the container runs the exact bundle that is live on the VPS (a703f269…)" || bad "old bundle hash $OLDSHA"
echo "$OUT" | grep -q "VERDICT: upgrade needed and possible" && ok "check: upgrade needed and possible" || bad "check verdict: $(echo "$OUT" | tail -3)"
echo "$OUT" | grep -q "deployment_signed=404" && echo "$OUT" | grep -q "helper_fr=200 localized=False" && ok "check shows what the live gateway lacks: no /auth/deployment, helper not translated" || bad "check endpoints: $(echo "$OUT" | grep -E 'deployment|helper')"
echo "$OUT" | grep -q "alive=True" && echo "$OUT" | grep -q "api_health_anonymous=401" && echo "$OUT" | grep -q "engine_health=200 ok=True" && ok "check: gateway alive (helper 200, anonymous API refused), engine healthy" || bad "check liveness: $(echo "$OUT" | grep -E 'alive|api_health|engine_health')"
echo "$OUT" | grep -q "$CANARY" && bad "check printed a secret" || ok "check prints variable names only"
[ "$(state)" = "$S0" ] && [ "$(pidgw)" = "$GW0" ] && [ "$(pideng)" = "$ENG0" ] && ok "check changed nothing and restarted nothing" || bad "check had side effects"

echo "# 2. refusals: nothing is changed"
BADSHA=$(echo "$EXPECTED" | sed 's/^./0/; s/.$/0/')
refuse() { label=$1; want=$2; shift 2; R=$(docker exec $c bash $G "$@" 2>&1) && bad "ACCEPTED: $label" || { echo "$R" | grep -q -- "$want" && ok "refuses $label" || bad "refused for another reason ($label): $R"; }; }
refuse "an expected SHA-256 the release copy does not have" "does not have the expected SHA-256" upgrade "$BADSHA"
refuse "a malformed SHA-256" "64 hexadecimal characters" upgrade short
X "python3 - <<'PY'
import json; p='/opt/vidfetch-web-preproduction-20261013/current/manifest.json'; d=json.load(open(p)); open('/root/manifest.keep','w').write(json.dumps(d)); d['files']['backend/vidfetch-ovh.cjs']='0'*64; open(p,'w').write(json.dumps(d))
PY"
refuse "when the running engine is not the engine of the release (out of scope)" "not the engine of the release" upgrade "$EXPECTED"
X "cp /root/manifest.keep /opt/vidfetch-web-preproduction-20261013/current/manifest.json"
# helpers are stopped by PID: a pattern-based kill would also match the shell that runs it
X "python3 -c 'import socket,time; s=socket.create_connection((\"127.0.0.1\",8789)); time.sleep(60)' >/dev/null 2>&1 & echo \$! > /root/conn.pid"; sleep 1
refuse "while a client connection is open on the gateway port" "established connection(s) on port 8789" upgrade "$EXPECTED"
X 'kill $(cat /root/conn.pid); cp /bin/sleep /tmp/ffprobe; /tmp/ffprobe 60 >/dev/null 2>&1 & echo $! > /root/media.pid'; sleep 1
refuse "while a media process (ffprobe) is running" "a media process" upgrade "$EXPECTED"
X 'kill $(cat /root/media.pid); systemd-run --quiet --unit=vidfetch-media-rollback --on-active=600s /bin/true'
refuse "while the network dead-man timer is armed" "dead-man timer is armed" upgrade "$EXPECTED"
X "systemctl stop vidfetch-media-rollback.timer"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=0\$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env"
refuse "while downloads are open (ready=1): a frontend must never face an older gateway" "downloads are open" upgrade "$EXPECTED"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=1\$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env"
[ "$(state)" = "$S0" ] && [ "$(pidgw)" = "$GW0" ] && [ "$(pideng)" = "$ENG0" ] && X "[ ! -e /etc/systemd/system/vidfetch-gateway.service.d ]" && ok "after every refusal: same files, same processes, no drop-in directory" || bad "a refusal had side effects"

echo "# 3. upgrade"
OUT=$(docker exec -e VM_GATEWAY_SETTLE=4 $c bash $G upgrade "$EXPECTED" 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "UPGRADED" && ok "upgrade succeeds" || bad "upgrade failed (rc=$rc): $(echo "$OUT" | tail -6)"
GW1=$(pidgw)
[ "$GW1" != "$GW0" ] && [ "$(running)" = "$NEWPATH" ] && [ "$(docker exec $c sha256sum "$NEWPATH" | cut -c1-64)" = "$EXPECTED" ] && ok "a new gateway process runs the expected bundle from its own root-owned directory" || bad "running: $(running)"
[ "$(pideng)" = "$ENG0" ] && ok "the engine was not restarted" || bad "engine restarted"
echo "$OUT" | grep -q "deployment_signed=200 draining=False active=False" && echo "$OUT" | grep -Eq "deployment_unsigned=40[13]" && echo "$OUT" | grep -q "helper_fr=200 localized=True" && echo "$OUT" | grep -q "engine_health=200 ok=True" && ok "endpoints: authenticated /auth/deployment 200 (signing key and ledger work), unauthenticated refused, helper translated, engine healthy" || bad "endpoints: $(echo "$OUT" | grep -E 'deployment|helper|engine')"
X "[ \"\$(stat -c '%U:%G %a' $DROPIN)\" = 'root:root 644' ] && [ \"\$(grep -c '^ExecStart=' $DROPIN)\" = 2 ] && grep -q '$NEWPATH' $DROPIN && [ \"\$(ls /etc/systemd/system/vidfetch-gateway.service.d | wc -l)\" = 1 ]" && ok "one root-owned drop-in overriding ExecStart only" || bad "drop-in: $(X "cat $DROPIN" 2>&1 | tail -3)"
S1=$(state)
[ "$(echo "$S1" | grep -v 'service.d/')" = "$S0" ] && ok "unit file, environment file (content, mode, owner) and the old release directory are byte-identical" || { bad "unexpected change"; }
B=$(docker exec $c readlink -f /var/backups/vidfetch-gateway-upgrade-latest)
X "[ \"\$(stat -c %a $B)\" = 700 ] && cd $B && sha256sum --check --quiet MANIFEST.sha256 && [ -f systemd/vidfetch-gateway.service ] && [ -f env/gateway.env ] && [ -f release/vidfetch-gateway.cjs ] && [ -f release/vidfetch-ovh.cjs ] && [ -f data/quota.sqlite ] && [ \"\$(cat dropin-dir.state)\" = absent ]" && ok "backup: unit, environment, both executables in use, quota ledger; root-only; manifest verifies" || bad "backup content: $(X "ls -R $B" | tr '\n' ' ' | cut -c1-200)"
X "setpriv --reuid=65534 --regid=65534 --clear-groups cat $B/env/gateway.env" >/dev/null 2>&1 && bad "an unprivileged user can read the backed-up environment" || ok "an unprivileged user cannot read the backup"
echo "$OUT" | grep -q "$CANARY" && bad "upgrade printed a secret" || ok "the upgrade output contains no secret value"
X "journalctl --no-pager -o cat --since '-10min' | grep -c '$CANARY'" | grep -q '^0$' && ok "no secret in the journal" || bad "secret in the journal"
X "[ \"\$(cat /etc/vidfetch/ci-web-test-guard.json)\" = '{\"files\":{}}' ]" && echo "$OUT" | grep -q "guard-update.py add $DROPIN $NEWPATH" && ok "the CI guard is untouched; the reconciliation command is printed for later" || bad "guard handling"
docker exec $c bash $G check "$EXPECTED" 2>&1 | grep -q "already is the expected bundle" && ok "check now reports the expected bundle" || bad "check after upgrade"
docker exec $c bash $G upgrade "$EXPECTED" 2>&1 | grep -q "nothing to do" && [ "$(pidgw)" = "$GW1" ] && ok "a second upgrade does nothing and restarts nothing" || bad "second upgrade"

echo "# 4. rollback"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=0\$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env"
GWU=$(pidgw); refuse "a rollback while downloads are open (ready=1)" "downloads are open" rollback
[ "$(pidgw)" = "$GWU" ] && [ "$(running)" = "$NEWPATH" ] && ok "...the upgraded gateway keeps running untouched" || bad "rollback refusal touched the gateway"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=1\$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env"
OUT=$(docker exec $c bash $G rollback 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "rollback succeeds and verifies itself" || bad "rollback (rc=$rc): $(echo "$OUT" | tail -4)"
[ "$(running)" = "$OLD" ] && [ "$(state)" = "$S0" ] && X "[ ! -e /etc/systemd/system/vidfetch-gateway.service.d ]" && ok "previous bundle running; unit, environment and files exactly as before; drop-in and its (empty) directory gone" || bad "state after rollback: $(running)"
docker exec $c bash $G check "$EXPECTED" 2>&1 | grep -q "deployment_signed=404" && ok "the old behaviour is back (/auth/deployment 404)" || bad "old behaviour"
[ "$(pideng)" = "$ENG0" ] && X "[ -f $NEWPATH ]" && ok "engine still untouched; the new release directory is kept, nothing was deleted" || bad "engine or new dir"

echo "# 5. upgrade with the audience change, then rollback"
OUT=$(docker exec -e VM_GATEWAY_SETTLE=4 $c bash $G upgrade "$EXPECTED" --origin-dl 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "origin_host=dl.vidfetch.app" && echo "$OUT" | grep -q "deployment_signed=200" && ok "upgrade --origin-dl: one restart, gateway answers for dl.vidfetch.app" || bad "origin upgrade (rc=$rc): $(echo "$OUT" | tail -5)"
X "diff <(grep -v '^VIDFETCH_GATEWAY_ORIGIN=' $B/env/gateway.env) <(grep -v '^VIDFETCH_GATEWAY_ORIGIN=' /etc/vidfetch/gateway.env) >/dev/null && grep -q '^VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app\$' /etc/vidfetch/gateway.env && [ \"\$(stat -c '%a %u:%g' /etc/vidfetch/gateway.env)\" = '600 0:0' ] && [ \"\$(ls /etc/vidfetch/ | grep -c 'gateway.env')\" = 1 ]" && ok "only the origin line changed; key and other values, mode and owner preserved; no stray copy left in /etc/vidfetch" || bad "environment after --origin-dl: $(X 'ls /etc/vidfetch')"
echo "$OUT" | grep -q "guard-update.py accept /etc/vidfetch/gateway.env" && ok "the guard command for the environment file is printed too" || bad "guard accept hint"
docker exec $c bash $G rollback >/dev/null 2>&1; [ "$(state)" = "$S0" ] && [ "$(running)" = "$OLD" ] && ok "rollback restores the environment byte-for-byte (origin back to api)" || bad "rollback after --origin-dl"

echo "# 6. a bundle that does not work is rolled back automatically"
X "ln -sfn /opt/vidfetch-ci-web/releases/2222222222222222222222222222222222222222 /opt/vidfetch-web-preproduction-20261013/current"
OUT=$(docker exec -e VM_GATEWAY_SETTLE=4 $c bash $G upgrade "$(docker exec $c cat /root/broken.sha)" 2>&1); rc=$?
[ $rc != 0 ] && echo "$OUT" | grep -q "FAILED:" && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "a bundle that exits at start: upgrade fails and rolls back by itself" || bad "broken bundle (rc=$rc): $(echo "$OUT" | tail -5)"
[ "$(running)" = "$OLD" ] && [ "$(state)" = "$S0" ] && X "systemctl is-active --quiet vidfetch-gateway && ! systemctl is-failed --quiet vidfetch-gateway" && ok "...the previous gateway is running, healthy, files as before, unit not left in a failed state" || bad "state after automatic rollback: $(running)"
X "ln -sfn /opt/vidfetch-ci-web/releases/3333333333333333333333333333333333333333 /opt/vidfetch-web-preproduction-20261013/current"
OUT=$(docker exec -e VM_GATEWAY_SETTLE=4 $c bash $G upgrade "$(docker exec $c cat /root/stale.sha)" 2>&1); rc=$?
case "$OUT" in *"nothing to do"*) ok "a release whose gateway equals the running one is a no-op" ;; *) bad "stale release: $(echo "$OUT" | tail -3)";; esac
[ "$(state)" = "$S0" ] && ok "...and changes nothing" || bad "stale release changed files"

echo "# 7. interruption and neighbours"
X "ln -sfn /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current; mkdir -p /etc/systemd/system/vidfetch-gateway.service.d; printf '[Service]\nEnvironment=NEIGHBOUR=1\n' > /etc/systemd/system/vidfetch-gateway.service.d/10-other.conf; systemctl daemon-reload"
S_N=$(state)
docker exec -d -e VM_GATEWAY_SETTLE=40 $c bash -c "echo \$\$ > /root/upgrade.pid; exec bash $G upgrade $EXPECTED > /root/interrupt.log 2>&1"
i=0; until [ "$(running 2>/dev/null)" = "$NEWPATH" ]; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done
X 'kill -TERM $(cat /root/upgrade.pid)'; i=0; until X "grep -q 'ROLLBACK' /root/interrupt.log"; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done; sleep 3
X "grep -q 'ROLLBACK VERIFIED' /root/interrupt.log" && [ "$(running)" = "$OLD" ] && ok "SIGTERM during the settling period: the script rolls back before exiting" || bad "interrupt: $(X 'tail -4 /root/interrupt.log')"
[ "$(state)" = "$S_N" ] && X "[ -f /etc/systemd/system/vidfetch-gateway.service.d/10-other.conf ] && [ ! -e $DROPIN ]" && ok "a neighbouring drop-in that existed before is untouched and its directory is kept; only our file is removed" || bad "neighbour drop-in"
[ "$(pideng)" = "$ENG0" ] && ok "through all of this the engine process never changed" || bad "engine pid changed"
exit $fail
