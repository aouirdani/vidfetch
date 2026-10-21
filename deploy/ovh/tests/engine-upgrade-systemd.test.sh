#!/bin/sh
# Host side, opt-in (about 5 minutes). Upgrade and rollback of the ENGINE with 13-engine.sh (PR B,
# docs/VIDFETCH-MOTEUR-REVUE-SPEC.md §3 B2) on Debian 13 with a REAL systemd, the engine and gateway units as on the
# VPS (hardening, worker user, Requires=vidfetch.service on the gateway, BindsTo the egress unit), the REAL gateway
# bundle built from this checkout, and stand-in engines that serve the health answer the scripts read.
# A throwaway privileged container plays the VPS; nothing outside it is touched. Exit 2 = environment.
# Written before 13-engine.sh exists: it fails (exit 1) until the implementation is there.
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); cd "$src" || exit 2
[ -f deploy/ovh/media/admin/13-engine.sh ] || { echo "not ok - 13-engine.sh is not implemented yet (PR B: this test is written first)"; exit 1; }
command -v docker >/dev/null && command -v node >/dev/null || exit 2
id=$$; c=vidfetch-eng-$id; T=$(mktemp -d); fail=0
trap 'docker rm -f $c >/dev/null 2>&1; rm -f -- "$T/gateway.cjs" "$T/setup.sh"; rmdir -- "$T" 2>/dev/null' EXIT
node backend/gateway/build.mjs "$T/gateway.cjs" >/dev/null 2>&1 || { echo "cannot build the gateway bundle (node_modules missing?)"; exit 2; }
arch=$(docker version -f '{{.Server.Arch}}' 2>/dev/null) || exit 2
img=vidfetch-engine-test:deb13-node22-$arch
docker build -q --platform "linux/$arch" -t "$img" - >/dev/null <<'DOCKERFILE' || { echo "could not build the test image"; exit 2; }
FROM node:22-bookworm-slim AS node
FROM debian:13
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv dbus python3 iproute2 procps util-linux nftables ca-certificates libstdc++6 >/dev/null && rm -rf /var/lib/apt/lists/* && systemctl mask getty.target console-getty.service systemd-logind.service >/dev/null 2>&1
COPY --from=node /usr/local/bin/node /opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKERFILE
docker run -d --name $c --platform "linux/$arch" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock \
  -v "$src":/r:ro -v "$T":/t:ro "$img" >/dev/null || exit 2
i=0; until docker exec $c systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ $i -gt 60 ] && { echo "systemd did not start"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
X() { docker exec $c bash -c "umask 022; $1"; }     # docker exec starts with umask 0000; the VPS creates root files 0644
E=/r/deploy/ovh/media/admin/13-engine.sh
R=/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4
OLD=$R/vidfetch-ovh.cjs
CANARY=CANARY-WORKER-SECRET-7a2e

cat > "$T/setup.sh" <<'SETUP'
set -e
umask 022
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-gateway
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-worker
R=/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4; mkdir -p $R /etc/vidfetch /var/backups /opt/vidfetch-ci-web/releases
N=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node
# stand-in engines: the health answer the gateway relays and the scripts read; MARK tells them apart
engine() {  # engine FILE MARK ISOLATION(js literal) [exit]
  if [ "${4:-}" = exit ]; then printf '// broken engine %s\nprocess.exit(1);\n' "$2" > "$1"
  else cat > "$1" <<JS
// Stand-in engine $2: only the health endpoint the gateway and the administrator scripts read.
require("node:http").createServer((req, res) => {
  if (req.url === "/api/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, engine: { isolationProfile: $3, ytDlp: "test", build: "$2" } })); }
  else { res.writeHead(404); res.end("{}"); }
}).listen(8788, "127.0.0.1");
JS
  fi
  chmod 0644 "$1"
}
engine $R/vidfetch-ovh.cjs old '"vidfetch-uid-nft-v1"'
install -o root -g root -m 0644 /t/gateway.cjs $R/vidfetch-gateway.cjs
engine /root/engine-new.cjs new '"vidfetch-uid-nft-v1"'
engine /root/engine-broken.cjs broken null exit
engine /root/engine-noiso.cjs noiso null
KEY=$(python3 -c 'import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="))')
printf 'VIDFETCH_GATEWAY_ENABLED=1\nVIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app\nVIDFETCH_SITE_ORIGINS=https://vidfetch.app\nVIDFETCH_QUOTA_DB=/var/lib/vidfetch-gateway/quota.sqlite\nVIDFETCH_ISOLATION_MODE=uid-nft\nVIDFETCH_PRIVATE_BACKEND=http://127.0.0.1:8788\nVIDFETCH_QUEUE_ENABLED=1\nVIDFETCH_ACCESS_SIGNING_KEY=%s\n' "$KEY" > /etc/vidfetch/gateway.env
printf 'LC_ALL=C.UTF-8\nVIDFETCH_ISOLATION_PROFILE=/etc/vidfetch/isolation.json\nUNRELATED_SECRET=%s\n' "$1" > /etc/vidfetch/worker.env
chmod 0600 /etc/vidfetch/gateway.env /etc/vidfetch/worker.env
printf '{"version":"vidfetch-uid-nft-v1","workerUid":%s,"gatewayUid":%s,"rulesVerified":true}\n' "$(id -u vidfetch-worker)" "$(id -u vidfetch-gateway)" > /etc/vidfetch/isolation.json
chmod 0644 /etc/vidfetch/isolation.json; echo 'nameserver 127.0.0.53' > /etc/vidfetch/resolv.conf
printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env; chmod 0600 /etc/vidfetch/web.env   # downloads closed, as in the window
echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json; chmod 0600 /etc/vidfetch/ci-web-test-guard.json
# an egress table standing for the worker's nft policy: it must be identical after every operation
nft add table inet vidfetch_egress; nft add chain inet vidfetch_egress output '{ type filter hook output priority 0; policy accept; }'
nft add rule inet vidfetch_egress output meta skuid vidfetch-worker ip daddr 10.0.0.0/8 counter drop
cat > /etc/systemd/system/vidfetch-egress.service <<UNIT
[Unit]
Description=VidFetch worker egress policy (test stand-in)
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/true
UNIT
# The engine unit is the repository template (backend/preproduction/ovh/vidfetch.service): same hardening and dependencies.
cat > /etc/systemd/system/vidfetch.service <<UNIT
[Unit]
Description=VidFetch isolated video engine (OVH, loopback only)
After=network-online.target vidfetch-egress.service
Wants=network-online.target
Requires=vidfetch-egress.service
BindsTo=vidfetch-egress.service
StartLimitIntervalSec=300
StartLimitBurst=3

[Service]
Type=simple
User=vidfetch-worker
Group=vidfetch-worker
WorkingDirectory=/var/lib/vidfetch-worker
EnvironmentFile=/etc/vidfetch/worker.env
ExecStart=$N --max-old-space-size=192 $R/vidfetch-ovh.cjs
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
KillMode=control-group
StateDirectory=vidfetch-worker
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
BindReadOnlyPaths=/etc/vidfetch/resolv.conf:/etc/resolv.conf
MemoryAccounting=true
MemoryHigh=768M
MemoryMax=1G
MemorySwapMax=0
CPUAccounting=true
CPUQuota=150%
TasksMax=128
LimitNOFILE=1024
Nice=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
# The gateway unit as read on the VPS on 13 Oct 2026 (same as gateway-upgrade-systemd.test.sh): Requires= the engine.
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
# a stand-in for the frontend: its PID must never change during an engine operation
printf '[Unit]\nDescription=frontend stand-in\n[Service]\nExecStart=/bin/sleep infinity\n' > /etc/systemd/system/vidfetch-web-preproduction-20261013.service
# frontend releases as the CI promoter leaves them; previous.json names the predecessor of the active one
release() {  # release SHA ENGINE_FILE
  d=/opt/vidfetch-ci-web/releases/$1; mkdir -p $d/backend
  install -o root -g root -m 0644 "$2" $d/backend/vidfetch-ovh.cjs; install -o root -g root -m 0644 $R/vidfetch-gateway.cjs $d/backend/vidfetch-gateway.cjs
  e=$(sha256sum $d/backend/vidfetch-ovh.cjs | cut -c1-64); g=$(sha256sum $d/backend/vidfetch-gateway.cjs | cut -c1-64)
  printf '{"release":"%s","files":{"backend/vidfetch-gateway.cjs":"%s","backend/vidfetch-ovh.cjs":"%s"}}' "$1" "$g" "$e" > $d/manifest.json
  echo "$e"
}
release 0000000000000000000000000000000000000000 $R/vidfetch-ovh.cjs > /root/old.sha
release 1111111111111111111111111111111111111111 /root/engine-new.cjs > /root/new.sha
release 2222222222222222222222222222222222222222 /root/engine-broken.cjs > /root/broken.sha
release 3333333333333333333333333333333333333333 /root/engine-noiso.cjs > /root/noiso.sha
printf '{"release":"0000000000000000000000000000000000000000","path":"/opt/vidfetch-ci-web/releases/0000000000000000000000000000000000000000"}\n' > /opt/vidfetch-ci-web/previous.json
mkdir -p /opt/vidfetch-web-preproduction-20261013
ln -sfn /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current
systemctl daemon-reload; systemctl start vidfetch-egress.service vidfetch.service vidfetch-gateway.service vidfetch-web-preproduction-20261013.service
SETUP
docker exec $c bash /t/setup.sh "$CANARY" >/dev/null 2>&1 || { echo "setup failed"; docker exec $c bash -c 'systemctl status vidfetch vidfetch-gateway --no-pager | tail -20'; exit 2; }
i=0; until X "ss -Hltn | grep -q '127.0.0.1:8789'" && X "ss -Hltn | grep -q '127.0.0.1:8788'"; do i=$((i+1)); [ $i -gt 30 ] && { echo "engine or gateway did not start"; X "journalctl -u vidfetch -u vidfetch-gateway --no-pager | tail -12"; exit 2; }; sleep 1; done
EXPECTED=$(docker exec $c cat /root/new.sha)
NEWPATH=/opt/vidfetch/releases/engine-$(echo "$EXPECTED" | cut -c1-16)/vidfetch-ovh.cjs
DROPIN=/etc/systemd/system/vidfetch.service.d/20-engine-release.conf
GWBUNDLE=$R/vidfetch-gateway.cjs
pideng() { docker exec $c systemctl show vidfetch.service -p MainPID --value; }
pidgw() { docker exec $c systemctl show vidfetch-gateway.service -p MainPID --value; }
pidweb() { docker exec $c systemctl show vidfetch-web-preproduction-20261013.service -p MainPID --value; }
running() { docker exec $c bash -c 'tr "\0" "\n" < /proc/$(systemctl show '"$1"' -p MainPID --value)/cmdline | grep "\.cjs$"'; }
state() { docker exec $c bash -c 'find /etc/systemd/system/vidfetch.service /etc/systemd/system/vidfetch.service.d /etc/systemd/system/vidfetch-gateway.service /etc/systemd/system/vidfetch-gateway.service.d /etc/vidfetch '"$R"' -type f -exec sha256sum {} + 2>/dev/null | sort; stat -c "%n %a %u:%g" /etc/vidfetch/worker.env /etc/vidfetch/gateway.env /etc/vidfetch/isolation.json; nft -s list table inet vidfetch_egress | sha256sum'; }
proc_facts() { docker exec $c bash -c 'p=$(systemctl show vidfetch.service -p MainPID --value); echo "user=$(stat -c %U /proc/$p) $(grep -E "^(NoNewPrivs|CapEff):" /proc/$p/status | tr -s "\t " " " | tr "\n" " ")"'; }
ENG0=$(pideng); GW0=$(pidgw); WEB0=$(pidweb); S0=$(state)
[ "$(running vidfetch.service)" = "$OLD" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] || { echo "the starting state is not the expected one"; exit 2; }

echo "# 1. check is read-only and describes the gap"
OUT=$(docker exec $c bash $E check "$EXPECTED" 2>&1)
echo "$OUT" | grep -q "VERDICT: upgrade needed and possible" && ok "check: upgrade needed and possible" || bad "check verdict: $(echo "$OUT" | tail -3)"
echo "$OUT" | grep -q "engine_health=200 ok=True isolation=vidfetch-uid-nft-v1" && echo "$OUT" | grep -q "alive=True" && ok "check: engine healthy with its isolation proof, gateway alive" || bad "check probes: $(echo "$OUT" | grep -E 'engine_health|alive')"
echo "$OUT" | grep -q "$CANARY" && bad "check printed a secret" || ok "check prints no secret"
[ "$(state)" = "$S0" ] && [ "$(pideng)" = "$ENG0" ] && [ "$(pidgw)" = "$GW0" ] && ok "check changed nothing and restarted nothing" || bad "check had side effects"

echo "# 2. refusals: nothing is changed"
BADSHA=$(echo "$EXPECTED" | sed 's/^./0/; s/.$/0/')
refuse() { label=$1; want=$2; shift 2; R2=$(docker exec $c bash $E "$@" 2>&1) && bad "ACCEPTED: $label" || { echo "$R2" | grep -q -- "$want" && ok "refuses $label" || bad "refused for another reason ($label): $R2"; }; }
refuse "an expected SHA-256 the release copy does not have" "does not have the expected SHA-256" upgrade "$BADSHA"
refuse "a malformed SHA-256" "64 hexadecimal characters" upgrade short
X "python3 - <<'PY'
import json; p='/opt/vidfetch-web-preproduction-20261013/current/manifest.json'; d=json.load(open(p)); open('/root/manifest.keep','w').write(json.dumps(d)); d['files']['backend/vidfetch-ovh.cjs']='0'*64; open(p,'w').write(json.dumps(d))
PY"
refuse "when the release manifest does not list the expected engine" "manifest does not list the expected SHA-256" upgrade "$EXPECTED"
X "cp /root/manifest.keep /opt/vidfetch-web-preproduction-20261013/current/manifest.json"
# both the active release and its predecessor (previous.json) announce another gateway than the one in service
X "python3 - <<'PY'
import json, shutil
for p in ['/opt/vidfetch-web-preproduction-20261013/current/manifest.json', '/opt/vidfetch-ci-web/releases/0000000000000000000000000000000000000000/manifest.json']:
    shutil.copy2(p, p + '.keep'); d = json.load(open(p)); d['files']['backend/vidfetch-gateway.cjs'] = 'f' * 64; open(p, 'w').write(json.dumps(d))
PY"
refuse "when the gateway in service belongs neither to the active release nor to its predecessor" "gateway in service" upgrade "$EXPECTED"
X "for m in /opt/vidfetch-web-preproduction-20261013/current/manifest.json /opt/vidfetch-ci-web/releases/0000000000000000000000000000000000000000/manifest.json; do mv -- \"\$m.keep\" \"\$m\"; done"
# helpers are stopped by PID: a pattern-based kill would also match the shell that runs it
for port in 8788 8789; do
  X "python3 -c 'import socket,time; s=socket.create_connection((\"127.0.0.1\",$port)); time.sleep(60)' >/dev/null 2>&1 & echo \$! > /root/conn.pid"; sleep 1
  refuse "while a connection is open on port $port" "established connection(s) on port $port" upgrade "$EXPECTED"
  X 'kill $(cat /root/conn.pid)'
done
X 'cp /bin/sleep /tmp/ffprobe; /tmp/ffprobe 60 >/dev/null 2>&1 & echo $! > /root/media.pid'; sleep 1
refuse "while a media process (ffprobe) is running" "a media process" upgrade "$EXPECTED"
X 'kill $(cat /root/media.pid); systemd-run --quiet --unit=vidfetch-media-rollback --on-active=600s /bin/true'
refuse "while the network dead-man timer is armed" "dead-man timer is armed" upgrade "$EXPECTED"
X "systemctl stop vidfetch-media-rollback.timer"
for value in 1 ''; do
  X "sed -i '/^VIDFETCH_CONNECTION_READY=/d' /etc/vidfetch/web.env; [ -z '$value' ] || echo 'VIDFETCH_CONNECTION_READY=$value' >> /etc/vidfetch/web.env"
  refuse "while downloads are open or not known to be closed (ready='$value')" "downloads are open" upgrade "$EXPECTED"
done
X "printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env; chmod 0600 /etc/vidfetch/web.env"
[ "$(state)" = "$S0" ] && [ "$(pideng)" = "$ENG0" ] && [ "$(pidgw)" = "$GW0" ] && X "[ ! -e /etc/systemd/system/vidfetch.service.d ]" && ok "after every refusal: same files, same processes, no drop-in directory" || bad "a refusal had side effects"
# an engine that does not run as the worker user is refused before anything changes (restored right after)
X "mkdir -p /etc/systemd/system/vidfetch.service.d; printf '[Service]\nUser=root\n' > /etc/systemd/system/vidfetch.service.d/05-stray.conf; systemctl daemon-reload; systemctl restart vidfetch.service vidfetch-gateway.service"; sleep 2
refuse "while the engine does not run as vidfetch-worker" "vidfetch-worker" upgrade "$EXPECTED"
X "rm -f /etc/systemd/system/vidfetch.service.d/05-stray.conf; rmdir /etc/systemd/system/vidfetch.service.d; systemctl daemon-reload; systemctl restart vidfetch.service vidfetch-gateway.service"; sleep 2
ENG0=$(pideng); GW0=$(pidgw); [ "$(state)" = "$S0" ] && [ "$(proc_facts | cut -d' ' -f1)" = user=vidfetch-worker ] || { echo "could not restore the starting state"; exit 1; }

echo "# 3. upgrade"
OUT=$(docker exec -e VM_ENGINE_SETTLE=4 $c bash $E upgrade "$EXPECTED" 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "UPGRADED" && ok "upgrade succeeds" || bad "upgrade failed (rc=$rc): $(echo "$OUT" | tail -6)"
ENG1=$(pideng); GW1=$(pidgw)
[ "$ENG1" != "$ENG0" ] && [ "$(running vidfetch.service)" = "$NEWPATH" ] && [ "$(docker exec $c sha256sum "$NEWPATH" | cut -c1-64)" = "$EXPECTED" ] && ok "a new engine process runs the expected bundle from its own root-owned directory" || bad "engine running: $(running vidfetch.service)"
proc_facts | grep -q "^user=vidfetch-worker CapEff: 0000000000000000 NoNewPrivs: 1" && ok "the new engine runs as vidfetch-worker with NoNewPrivs=1 and no capability" || bad "engine process: $(proc_facts)"
echo "$OUT" | grep -q "engine_health=200 ok=True isolation=vidfetch-uid-nft-v1" && ok "the new engine answers with its isolation proof" || bad "engine health: $(echo "$OUT" | grep engine_health)"
[ "$GW1" != "$GW0" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] && ok "the gateway was restarted (Requires=) on its unchanged bundle" || bad "gateway: pid $GW0 -> $GW1, running $(running vidfetch-gateway.service)"
echo "$OUT" | grep -q "alive=True" && echo "$OUT" | grep -q "deployment_signed=200 draining=False active=False" && echo "$OUT" | grep -Eq "deployment_unsigned=40[13]" && ok "gateway endpoints after the restart: alive, signed /auth/deployment 200, unsigned refused" || bad "gateway endpoints: $(echo "$OUT" | grep -E 'alive|deployment')"
[ "$(pidweb)" = "$WEB0" ] && ok "the frontend was not restarted" || bad "frontend restarted"
X "[ \"\$(ss -Hltn | awk '{print \$4}' | grep -E ':878[89]\$' | sort | tr '\n' ' ')\" = '127.0.0.1:8788 127.0.0.1:8789 ' ]" && ok "engine and gateway listen on loopback only" || bad "listeners: $(X "ss -Hltn | grep 878")"
X "[ \"\$(stat -c '%U:%G %a' $DROPIN)\" = 'root:root 644' ] && [ \"\$(grep -c '^ExecStart=' $DROPIN)\" = 2 ] && grep -q '$NEWPATH' $DROPIN && [ \"\$(ls /etc/systemd/system/vidfetch.service.d | wc -l)\" = 1 ]" && ok "one root-owned drop-in overriding ExecStart only" || bad "drop-in: $(X "cat $DROPIN" 2>&1 | tail -3)"
[ "$(state | grep -v 'vidfetch.service.d/')" = "$S0" ] && ok "unit files, worker.env, gateway.env, isolation.json (content, mode, owner), the old release directory and the egress rules are identical" || bad "unexpected change outside the engine drop-in"
B=$(docker exec $c readlink -f /var/backups/vidfetch-engine-upgrade-latest)
X "[ \"\$(stat -c %a $B)\" = 700 ] && cd $B && sha256sum --check --quiet MANIFEST.sha256 && [ -f systemd/vidfetch.service ] && [ -f env/worker.env ] && [ -f release/vidfetch-ovh.cjs ] && [ \"\$(cat gateway-bundle.path)\" = '$GWBUNDLE' ] && [ -f data/quota.sqlite ] && [ \"\$(cat dropin-dir.state)\" = absent ]" && ok "backup: engine unit, worker.env, engine in use, gateway bundle recorded, quota ledger; root-only; manifest verifies" || bad "backup content: $(X "ls -R $B" | tr '\n' ' ' | cut -c1-200)"
X "setpriv --reuid=65534 --regid=65534 --clear-groups cat $B/env/worker.env" >/dev/null 2>&1 && bad "an unprivileged user can read the backed-up environment" || ok "an unprivileged user cannot read the backup"
echo "$OUT" | grep -q "$CANARY" && bad "upgrade printed a secret" || ok "the upgrade output contains no secret value"
X "journalctl --no-pager -o cat --since '-10min' | grep -c '$CANARY'" | grep -q '^0$' && ok "no secret in the journal" || bad "secret in the journal"
X "[ \"\$(cat /etc/vidfetch/ci-web-test-guard.json)\" = '{\"files\":{}}' ]" && echo "$OUT" | grep -q "guard-update.py add $DROPIN $NEWPATH" && ok "the CI guard is untouched; the reconciliation command is printed for later" || bad "guard handling"
docker exec $c bash $E check "$EXPECTED" 2>&1 | grep -q "already is the expected bundle" && ok "check now reports the expected bundle" || bad "check after upgrade"
docker exec $c bash $E upgrade "$EXPECTED" 2>&1 | grep -q "nothing to do" && [ "$(pideng)" = "$ENG1" ] && [ "$(pidgw)" = "$GW1" ] && ok "a second upgrade does nothing and restarts nothing" || bad "second upgrade"

echo "# 4. rollback"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=0\$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env"
refuse "a rollback while downloads are open (ready=1)" "downloads are open" rollback
[ "$(pideng)" = "$ENG1" ] && [ "$(running vidfetch.service)" = "$NEWPATH" ] && ok "...the upgraded engine keeps running untouched" || bad "rollback refusal touched the engine"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=1\$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env"
# as if 08-gateway.sh upgrade had run after this engine upgrade: the gateway must be rolled back first
X "mkdir -p /etc/systemd/system/vidfetch-gateway.service.d; cp $GWBUNDLE /root/gw-later.cjs; echo '// later' >> /root/gw-later.cjs; install -d -m 0755 /opt/vidfetch/releases/gateway-later; install -m 0644 /root/gw-later.cjs /opt/vidfetch/releases/gateway-later/vidfetch-gateway.cjs; printf '[Service]\nExecStart=\nExecStart=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node --max-old-space-size=96 /opt/vidfetch/releases/gateway-later/vidfetch-gateway.cjs\n' > /etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf; systemctl daemon-reload; systemctl restart vidfetch-gateway.service"; sleep 2
refuse "an engine rollback while a later gateway runs (08-gateway.sh rollback first)" "08-gateway.sh rollback" rollback
X "rm -f /etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf; rmdir /etc/systemd/system/vidfetch-gateway.service.d; systemctl daemon-reload; systemctl restart vidfetch-gateway.service"; sleep 2
OUT=$(docker exec $c bash $E rollback 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "rollback succeeds and verifies itself" || bad "rollback (rc=$rc): $(echo "$OUT" | tail -4)"
[ "$(running vidfetch.service)" = "$OLD" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] && [ "$(state)" = "$S0" ] && X "[ ! -e /etc/systemd/system/vidfetch.service.d ]" && ok "previous engine running, gateway on its bundle; units, environments and files exactly as before; drop-in and its (empty) directory gone" || bad "state after rollback: $(running vidfetch.service)"
proc_facts | grep -q "^user=vidfetch-worker CapEff: 0000000000000000 NoNewPrivs: 1" && ok "the restored engine keeps its isolation" || bad "restored engine: $(proc_facts)"
X "[ -f $NEWPATH ]" && [ "$(pidweb)" = "$WEB0" ] && ok "the new engine directory is kept (nothing deleted); frontend untouched" || bad "new dir or frontend"

echo "# 5. an engine that does not work is rolled back automatically"
for bad_engine in broken noiso; do
  X "ln -sfn /opt/vidfetch-ci-web/releases/$( [ $bad_engine = broken ] && echo 2222222222222222222222222222222222222222 || echo 3333333333333333333333333333333333333333) /opt/vidfetch-web-preproduction-20261013/current"
  OUT=$(docker exec -e VM_ENGINE_SETTLE=4 $c bash $E upgrade "$(docker exec $c cat /root/$bad_engine.sha)" 2>&1); rc=$?
  [ $rc != 0 ] && echo "$OUT" | grep -q "FAILED:" && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "engine '$bad_engine': upgrade fails and rolls back by itself" || bad "engine $bad_engine (rc=$rc): $(echo "$OUT" | tail -5)"
  [ "$(running vidfetch.service)" = "$OLD" ] && [ "$(state)" = "$S0" ] && X "systemctl is-active --quiet vidfetch && systemctl is-active --quiet vidfetch-gateway && ! systemctl is-failed --quiet vidfetch" && ok "...previous engine and gateway running and healthy, files as before, no unit left failed" || bad "state after automatic rollback ($bad_engine): $(running vidfetch.service)"
done

echo "# 6. interruption and neighbours"
X "ln -sfn /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current; mkdir -p /etc/systemd/system/vidfetch.service.d; printf '[Service]\nEnvironment=NEIGHBOUR=1\n' > /etc/systemd/system/vidfetch.service.d/10-other.conf; systemctl daemon-reload"
S_N=$(state)
docker exec -d -e VM_ENGINE_SETTLE=40 $c bash -c "echo \$\$ > /root/upgrade.pid; exec bash $E upgrade $EXPECTED > /root/interrupt.log 2>&1"
i=0; until [ "$(running vidfetch.service 2>/dev/null)" = "$NEWPATH" ]; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done
X 'kill -TERM $(cat /root/upgrade.pid)'; i=0; until X "grep -q 'ROLLBACK' /root/interrupt.log"; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done; sleep 3
X "grep -q 'ROLLBACK VERIFIED' /root/interrupt.log" && [ "$(running vidfetch.service)" = "$OLD" ] && ok "SIGTERM during the settling period: the script rolls back before exiting" || bad "interrupt: $(X 'tail -4 /root/interrupt.log')"
[ "$(state)" = "$S_N" ] && X "[ -f /etc/systemd/system/vidfetch.service.d/10-other.conf ] && [ ! -e $DROPIN ]" && ok "a neighbouring drop-in that existed before is untouched and its directory is kept; only our file is removed" || bad "neighbour drop-in"
[ "$(pidweb)" = "$WEB0" ] && ok "through all of this the frontend process never changed" || bad "frontend pid changed"
exit $fail
