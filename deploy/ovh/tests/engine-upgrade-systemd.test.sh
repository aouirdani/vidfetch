#!/bin/sh
# Host side, opt-in (about 8 minutes). 13-engine.sh check | upgrade | rollback | observe (PR B,
# docs/VIDFETCH-MOTEUR-REVUE-SPEC.md v3 §3 B2 and B3) on Debian 13 with a REAL systemd and the units as read on the VPS
# on 21/10/2026:
#   - the engine runs as vidfetch-worker with the full hardening, and Requires= and BindsTo= vidfetch-egress.service;
#   - the egress unit's ExecStop REMOVES the worker's egress rules, as egress-control.py stop does;
#   - the gateway has Requires=vidfetch.service and runs through 20-gateway-release.conf (the drop-in 08-gateway.sh
#     wrote on 13/10);
#   - both units have StartLimitBurst=3 within 300 s.
# The REAL gateway bundle is built from this checkout; stand-in engines serve the health answer the scripts read.
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
OBS=/var/lib/vidfetch-admin/observations

cat > "$T/setup.sh" <<'SETUP'
set -e
umask 022
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-gateway
useradd --system --user-group --no-create-home --shell /usr/sbin/nologin vidfetch-worker
R=/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4; mkdir -p $R /etc/vidfetch /var/backups /opt/vidfetch-ci-web/releases
N=/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node
# stand-in engines: the health answer the gateway relays and the scripts read; MARK tells them apart. GET /__warn
# writes one line at priority warning to the journal ("<4>" prefix, StandardError=journal), for the observation tests.
engine() {  # engine FILE MARK ISOLATION(js literal) [exit]
  if [ "${4:-}" = exit ]; then printf '// broken engine %s\nprocess.exit(1);\n' "$2" > "$1"
  else cat > "$1" <<JS
// Stand-in engine $2: only the health endpoint the gateway and the administrator scripts read.
require("node:http").createServer((req, res) => {
  if (req.url === "/api/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, engine: { isolationProfile: $3, ytDlp: "test", build: "$2" } })); }
  else if (req.url === "/__warn") { process.stderr.write("<4>stand-in engine $2: test warning\n"); res.writeHead(204); res.end(); }
  else { res.writeHead(404); res.end("{}"); }
}).listen(8788, "127.0.0.1");
JS
  fi
  chmod 0644 "$1"
}
engine $R/vidfetch-ovh.cjs old '"vidfetch-uid-nft-v1"'
engine /root/engine-new.cjs new '"vidfetch-uid-nft-v1"'
engine /root/engine-broken.cjs broken null exit
engine /root/engine-noiso.cjs noiso null
# the gateway: the unit names the old directory; the drop-in written by 08-gateway.sh on 13/10 runs gateway-<16>/
install -o root -g root -m 0644 /t/gateway.cjs $R/vidfetch-gateway.cjs
G=$(sha256sum /t/gateway.cjs | cut -c1-16); install -d -m 0755 /opt/vidfetch/releases/gateway-$G
install -o root -g root -m 0644 /t/gateway.cjs /opt/vidfetch/releases/gateway-$G/vidfetch-gateway.cjs
KEY=$(python3 -c 'import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="))')
printf 'VIDFETCH_GATEWAY_ENABLED=1\nVIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app\nVIDFETCH_SITE_ORIGINS=https://vidfetch.app\nVIDFETCH_QUOTA_DB=/var/lib/vidfetch-gateway/quota.sqlite\nVIDFETCH_ISOLATION_MODE=uid-nft\nVIDFETCH_PRIVATE_BACKEND=http://127.0.0.1:8788\nVIDFETCH_QUEUE_ENABLED=1\nVIDFETCH_ACCESS_SIGNING_KEY=%s\n' "$KEY" > /etc/vidfetch/gateway.env
printf 'LC_ALL=C.UTF-8\nVIDFETCH_ISOLATION_PROFILE=/etc/vidfetch/isolation.json\nUNRELATED_SECRET=%s\n' "$1" > /etc/vidfetch/worker.env
chmod 0600 /etc/vidfetch/gateway.env /etc/vidfetch/worker.env
printf '{"version":"vidfetch-uid-nft-v1","workerUid":%s,"gatewayUid":%s,"rulesVerified":true}\n' "$(id -u vidfetch-worker)" "$(id -u vidfetch-gateway)" > /etc/vidfetch/isolation.json
chmod 0644 /etc/vidfetch/isolation.json; echo 'nameserver 127.0.0.53' > /etc/vidfetch/resolv.conf
printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env; chmod 0600 /etc/vidfetch/web.env   # downloads closed, as in the window
echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json; chmod 0600 /etc/vidfetch/ci-web-test-guard.json
# the worker's egress policy, loaded and REMOVED by its unit (as egress-control.py start|stop on the VPS)
cat > /etc/vidfetch/egress.nft <<'NFT'
table inet vidfetch_egress {
	chain output {
		type filter hook output priority 0; policy accept;
		meta skuid "vidfetch-worker" ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 } counter drop comment "private4"
		meta skuid "vidfetch-worker" meta nfproto ipv6 counter drop comment "ipv6"
	}
}
NFT
cat > /etc/systemd/system/vidfetch-egress.service <<UNIT
[Unit]
Description=VidFetch dedicated UID egress policy (test stand-in: stop removes the rules)
Before=vidfetch.service
[Service]
Type=oneshot
RemainAfterExit=true
ExecStart=/usr/sbin/nft -f /etc/vidfetch/egress.nft
ExecStop=/usr/sbin/nft delete table inet vidfetch_egress
[Install]
WantedBy=multi-user.target
UNIT
# The engine unit as read on the VPS on 21/10/2026 (systemctl cat vidfetch.service).
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
# The gateway unit as read on the VPS on 21/10/2026 (systemctl cat vidfetch-gateway.service), with its drop-in.
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
mkdir -p /etc/systemd/system/vidfetch-gateway.service.d
printf '# Installed by 08-gateway.sh on 2026-10-13T22:26:38Z. Previous bundle: %s/vidfetch-gateway.cjs\n[Service]\nExecStart=\nExecStart=%s --max-old-space-size=96 /opt/vidfetch/releases/gateway-%s/vidfetch-gateway.cjs\n' "$R" "$N" "$G" > /etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf
# a stand-in for the frontend: its PID must never change during an engine operation
printf '[Unit]\nDescription=frontend stand-in\n[Service]\nExecStart=/bin/sleep infinity\n' > /etc/systemd/system/vidfetch-web-preproduction-20261013.service
# frontend releases as the CI promoter leaves them; previous.json names the predecessor of the active one
release() {  # release SHA ENGINE_FILE
  d=/opt/vidfetch-ci-web/releases/$1; mkdir -p $d/backend
  install -o root -g root -m 0644 "$2" $d/backend/vidfetch-ovh.cjs; install -o root -g root -m 0644 /t/gateway.cjs $d/backend/vidfetch-gateway.cjs
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
docker exec $c bash /t/setup.sh "$CANARY" >/dev/null 2>&1 || { echo "setup failed"; docker exec $c bash -c 'systemctl status vidfetch-egress vidfetch vidfetch-gateway --no-pager | tail -20'; exit 2; }
i=0; until X "ss -Hltn | grep -q '127.0.0.1:8789'" && X "ss -Hltn | grep -q '127.0.0.1:8788'"; do i=$((i+1)); [ $i -gt 30 ] && { echo "engine or gateway did not start"; X "journalctl -u vidfetch -u vidfetch-gateway --no-pager | tail -12"; exit 2; }; sleep 1; done
EXPECTED=$(docker exec $c cat /root/new.sha)
NEWPATH=/opt/vidfetch/releases/engine-$(echo "$EXPECTED" | cut -c1-16)/vidfetch-ovh.cjs
DROPIN=/etc/systemd/system/vidfetch.service.d/20-engine-release.conf
GW_DROPIN=/etc/systemd/system/vidfetch-gateway.service.d/20-gateway-release.conf
GWBUNDLE=$(docker exec $c bash -c 'grep -o "/opt/vidfetch/releases/gateway-[0-9a-f]*/vidfetch-gateway.cjs" '"$GW_DROPIN")
pideng() { docker exec $c systemctl show vidfetch.service -p MainPID --value; }
pidgw() { docker exec $c systemctl show vidfetch-gateway.service -p MainPID --value; }
pidweb() { docker exec $c systemctl show vidfetch-web-preproduction-20261013.service -p MainPID --value; }
running() { docker exec $c bash -c 'tr "\0" "\n" < /proc/$(systemctl show '"$1"' -p MainPID --value)/cmdline | grep "\.cjs$"'; }
# what must never change: unit files and drop-ins, environments, isolation profile, the old release directory, the
# egress rules (stateless listing) and the egress unit's activation time (it is never stopped or restarted)
state() { docker exec $c bash -c 'find /etc/systemd/system/vidfetch.service /etc/systemd/system/vidfetch.service.d /etc/systemd/system/vidfetch-gateway.service /etc/systemd/system/vidfetch-gateway.service.d /etc/systemd/system/vidfetch-egress.service /etc/vidfetch '"$R"' -type f -exec sha256sum {} + 2>/dev/null | sort; stat -c "%n %a %u:%g" /etc/vidfetch/worker.env /etc/vidfetch/gateway.env /etc/vidfetch/isolation.json; nft -s list table inet vidfetch_egress | sha256sum; systemctl show vidfetch-egress.service -p ActiveEnterTimestampMonotonic -p ActiveState'; }
proc_facts() { docker exec $c bash -c 'p=$(systemctl show vidfetch.service -p MainPID --value); echo "user=$(stat -c %U /proc/$p) $(grep -E "^(NoNewPrivs|CapEff):" /proc/$p/status | tr -s "\t " " " | tr "\n" " ")"'; }
drops() { docker exec $c bash -c 'nft list table inet vidfetch_egress | grep -o "packets [0-9]*" | awk "{s+=\$2} END {print s+0}"'; }
units_sound() { X "! systemctl is-failed --quiet vidfetch && ! systemctl is-failed --quiet vidfetch-gateway && [ \"\$(systemctl show vidfetch -p Result --value)\" = success ] && [ \"\$(systemctl show vidfetch-gateway -p Result --value)\" = success ]"; }
ENG0=$(pideng); GW0=$(pidgw); WEB0=$(pidweb); S0=$(state)
[ "$(running vidfetch.service)" = "$OLD" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] || { echo "the starting state is not the expected one"; exit 2; }

echo "# 1. check is read-only, describes the gap and proves the egress policy is effective"
D0=$(drops); OUT=$(docker exec $c bash $E check "$EXPECTED" 2>&1)
echo "$OUT" | grep -q "VERDICT: upgrade needed and possible" && ok "check: upgrade needed and possible" || bad "check verdict: $(echo "$OUT" | tail -3)"
echo "$OUT" | grep -q "engine_health=200 ok=True isolation=vidfetch-uid-nft-v1" && echo "$OUT" | grep -q "alive=True" && ok "check: engine healthy with its isolation proof, gateway alive" || bad "check probes: $(echo "$OUT" | grep -E 'engine_health|alive')"
echo "$OUT" | grep -q "egress_probe=dropped" && [ "$(drops)" -gt "$D0" ] && ok "check: a probe from the worker uid to a private address is dropped by the live egress rules (counter moved)" || bad "egress probe: $(echo "$OUT" | grep egress) drops $D0 -> $(drops)"
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
docker exec -e VM_MIN_FREE_MIB=999999999 $c bash $E check "$EXPECTED" 2>&1 | grep -q "free" && ok "check refuses when the release disk has less free space than required" || bad "disk space check"
[ "$(state)" = "$S0" ] && [ "$(pideng)" = "$ENG0" ] && [ "$(pidgw)" = "$GW0" ] && X "[ ! -e /etc/systemd/system/vidfetch.service.d ]" && ok "after every refusal: same files, same processes, no engine drop-in directory" || bad "a refusal had side effects"
# an engine that does not run as the worker user is refused before anything changes (restored right after)
X "mkdir -p /etc/systemd/system/vidfetch.service.d; printf '[Service]\nUser=root\n' > /etc/systemd/system/vidfetch.service.d/05-stray.conf; systemctl daemon-reload; systemctl restart vidfetch.service vidfetch-gateway.service"; sleep 2
refuse "while the engine does not run as vidfetch-worker" "vidfetch-worker" upgrade "$EXPECTED"
X "rm -f /etc/systemd/system/vidfetch.service.d/05-stray.conf; rmdir /etc/systemd/system/vidfetch.service.d; systemctl daemon-reload; systemctl reset-failed vidfetch.service vidfetch-gateway.service; systemctl restart vidfetch.service vidfetch-gateway.service"; sleep 2
# a unit that is already failed is a fault to investigate: refused, and its failed state is NOT reset by the tool
X "mkdir -p /etc/systemd/system/vidfetch-gateway.service.d; printf '[Service]\nRestart=no\n' > /etc/systemd/system/vidfetch-gateway.service.d/05-test-norestart.conf; systemctl daemon-reload; systemctl kill -s KILL vidfetch-gateway.service"; sleep 2
refuse "while the gateway unit is failed" "failed" upgrade "$EXPECTED"
X "[ \"\$(systemctl show vidfetch-gateway -p Result --value)\" = signal ]" && ok "...and the tool did not reset-failed it (the fault stays visible)" || bad "the failed state was reset by the tool"
X "rm -f /etc/systemd/system/vidfetch-gateway.service.d/05-test-norestart.conf; systemctl daemon-reload; systemctl reset-failed vidfetch-gateway.service; systemctl start vidfetch-gateway.service"; sleep 2
ENG0=$(pideng); GW0=$(pidgw); [ "$(state)" = "$S0" ] && [ "$(proc_facts | cut -d' ' -f1)" = user=vidfetch-worker ] && units_sound || { echo "could not restore the starting state"; exit 1; }

echo "# 3. upgrade"
D0=$(drops); OUT=$(docker exec -e VM_ENGINE_SETTLE=4 $c bash $E upgrade "$EXPECTED" 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "UPGRADED" && ok "upgrade succeeds" || bad "upgrade failed (rc=$rc): $(echo "$OUT" | tail -6)"
ENG1=$(pideng); GW1=$(pidgw)
[ "$ENG1" != "$ENG0" ] && [ "$(running vidfetch.service)" = "$NEWPATH" ] && [ "$(docker exec $c sha256sum "$NEWPATH" | cut -c1-64)" = "$EXPECTED" ] && ok "a new engine process runs the expected bundle from its own root-owned directory" || bad "engine running: $(running vidfetch.service)"
proc_facts | grep -q "^user=vidfetch-worker CapEff: 0000000000000000 NoNewPrivs: 1" && ok "the new engine runs as vidfetch-worker with NoNewPrivs=1 and no capability" || bad "engine process: $(proc_facts)"
echo "$OUT" | grep -q "engine_health=200 ok=True isolation=vidfetch-uid-nft-v1" && ok "the new engine answers with its isolation proof" || bad "engine health: $(echo "$OUT" | grep engine_health)"
echo "$OUT" | grep -q "egress_probe=dropped" && [ "$(drops)" -gt "$D0" ] && ok "after the switch, the egress rules still drop the worker's private-address traffic" || bad "egress after the switch: $(echo "$OUT" | grep egress)"
[ "$GW1" != "$GW0" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] && ok "the gateway was restarted (Requires=) on its unchanged bundle, through its unchanged drop-in" || bad "gateway: pid $GW0 -> $GW1, running $(running vidfetch-gateway.service)"
echo "$OUT" | grep -q "alive=True" && echo "$OUT" | grep -q "deployment_signed=200 draining=False active=False" && echo "$OUT" | grep -Eq "deployment_unsigned=40[13]" && ok "gateway endpoints after the restart: alive, signed /auth/deployment 200, unsigned refused" || bad "gateway endpoints: $(echo "$OUT" | grep -E 'alive|deployment')"
[ "$(pidweb)" = "$WEB0" ] && ok "the frontend was not restarted" || bad "frontend restarted"
X "[ \"\$(ss -Hltn | awk '{print \$4}' | grep -E ':878[89]\$' | sort | tr '\n' ' ')\" = '127.0.0.1:8788 127.0.0.1:8789 ' ]" && ok "engine and gateway listen on loopback only" || bad "listeners: $(X "ss -Hltn | grep 878")"
X "[ \"\$(stat -c '%U:%G %a' $DROPIN)\" = 'root:root 644' ] && [ \"\$(grep -c '^ExecStart=' $DROPIN)\" = 2 ] && grep -q '$NEWPATH' $DROPIN && [ \"\$(ls /etc/systemd/system/vidfetch.service.d | wc -l)\" = 1 ]" && ok "one root-owned drop-in overriding ExecStart only" || bad "drop-in: $(X "cat $DROPIN" 2>&1 | tail -3)"
[ "$(state | grep -v 'vidfetch.service.d/')" = "$S0" ] && ok "units, gateway drop-in, environments, isolation.json, the old release directory, the egress rules and the egress unit (never restarted) are identical" || bad "unexpected change outside the engine drop-in"
units_sound && ok "both units active with Result=success after the stop/start (start limit not reached)" || bad "a unit is failed after the upgrade"
B=$(docker exec $c readlink -f /var/backups/vidfetch-engine-upgrade-latest)
X "[ \"\$(stat -c %a $B)\" = 700 ] && cd $B && sha256sum --check --quiet MANIFEST.sha256 && [ -f systemd/vidfetch.service ] && [ -f env/worker.env ] && [ -f release/vidfetch-ovh.cjs ] && [ \"\$(cat gateway-bundle.path)\" = '$GWBUNDLE' ] && [ -f data/quota.sqlite ] && [ \"\$(cat dropin-dir.state)\" = absent ] && [ -f upgraded ]" && ok "backup: engine unit, worker.env, engine in use, gateway bundle recorded, quota ledger, 'upgraded' time; root-only; manifest verifies" || bad "backup content: $(X "ls -R $B" | tr '\n' ' ' | cut -c1-200)"
X "grep -c '^reset-failed ' $B/events.log" | grep -qx 2 && X "grep -q '^reset-failed vidfetch.service (before: ' $B/events.log && grep -q '^reset-failed vidfetch-gateway.service (before: ' $B/events.log" && ok "exactly one reset-failed per unit, each logged with the unit's state before it" || bad "reset-failed log: $(X "cat $B/events.log" | tr '\n' ' ')"
X "setpriv --reuid=65534 --regid=65534 --clear-groups cat $B/env/worker.env" >/dev/null 2>&1 && bad "an unprivileged user can read the backed-up environment" || ok "an unprivileged user cannot read the backup"
echo "$OUT" | grep -q "$CANARY" && bad "upgrade printed a secret" || ok "the upgrade output contains no secret value"
X "journalctl --no-pager -o cat --since '-10min' | grep -c '$CANARY'" | grep -q '^0$' && ok "no secret in the journal" || bad "secret in the journal"
X "[ \"\$(cat /etc/vidfetch/ci-web-test-guard.json)\" = '{\"files\":{}}' ]" && echo "$OUT" | grep -q "guard-update.py add $DROPIN $NEWPATH" && ok "the CI guard is untouched; the reconciliation command is printed for later" || bad "guard handling"
echo "$OUT" | grep -q "13-engine.sh observe" && ok "the next step printed is the 15-minute observation" || bad "observe not named as the next step"
docker exec $c bash $E check "$EXPECTED" 2>&1 | grep -q "already is the expected bundle" && ok "check now reports the expected bundle" || bad "check after upgrade"
docker exec $c bash $E upgrade "$EXPECTED" 2>&1 | grep -q "nothing to do" && [ "$(pideng)" = "$ENG1" ] && [ "$(pidgw)" = "$GW1" ] && ok "a second upgrade does nothing and restarts nothing" || bad "second upgrade"

echo "# 4. observe (read-only; VM_OBSERVE_MIN and VM_OBSERVE_INTERVAL shorten it for the test only)"
OB="-e VM_OBSERVE_MIN=20 -e VM_OBSERVE_INTERVAL=4"
observe_bg() { docker exec -d $OB $c bash -c "exec bash $E observe 20 > /root/observe.log 2>&1; echo \$? > /root/observe.rc"; X "rm -f /root/observe.rc"; }
observe_wait() { i=0; until X "[ -f /root/observe.rc ]"; do i=$((i+1)); [ $i -gt 60 ] && break; sleep 1; done; }
X "flock /run/vidfetch-media-test.lock sleep 40 >/dev/null 2>&1 &"; sleep 1     # observe takes no lock: an operation may hold it
OUT=$(docker exec $OB $c bash $E observe 20 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "OBSERVED OK" && ok "observe: OBSERVED OK after the full duration, even while the toolkit lock is held" || bad "observe OK (rc=$rc): $(echo "$OUT" | tail -4)"
X "[ \"\$(stat -c '%a %U' $OBS)\" = '700 root' ] && f=\$(ls $OBS | tail -1) && [ \"\$(stat -c '%a %U' $OBS/\$f)\" = '600 root' ] && python3 -c \"import json,sys; d=json.load(open('$OBS/'+sys.argv[1])); assert d['result']=='ok' and d['engine']['sha256']=='$EXPECTED' and d['duration_s']>=20\" \$f" && ok "observe writes a root-only record: result, duration, bundles in service" || bad "observation record: $(X "ls -la $OBS")"
[ "$(pideng)" = "$ENG1" ] && [ "$(pidgw)" = "$GW1" ] && [ "$(state | grep -v 'vidfetch.service.d/')" = "$S0" ] && ok "observe restarted nothing and changed nothing" || bad "observe had side effects"
refuse "an observation shorter than 900 s outside the tests" "900" observe 899
# failures: each is reported, recorded, and NOTHING is done about it (no rollback, no reset-failed, ready unchanged)
fails_with() {  # fails_with LABEL CHECK ACTION
  observe_bg; sleep 6; X "$3"; observe_wait
  OUT=$(X "cat /root/observe.log"); rc=$(X "cat /root/observe.rc")
  [ "$rc" != 0 ] && echo "$OUT" | grep -q "OBSERVATION FAILED: $2" && echo "$OUT" | grep -q "13-engine.sh rollback" && echo "$OUT" | grep -qi "downloads stay closed" \
    && ok "observe fails on $1 ($2), prints the rollback procedure without running it" || bad "observe on $1 (rc=$rc): $(echo "$OUT" | tail -4)"
  X "f=\$(ls $OBS | tail -1); python3 -c \"import json,sys; d=json.load(open('$OBS/'+sys.argv[1])); assert d['result']=='failed' and d['failed_check'].startswith('$2')\" \$f" && ok "...recorded as failed ($2)" || bad "failed record for $1"
  [ "$(running vidfetch.service)" = "$NEWPATH" ] && X "grep -q '^VIDFETCH_CONNECTION_READY=0' /etc/vidfetch/web.env" && ok "...no automatic rollback, downloads still closed" || bad "observe acted on $1"
}
fails_with "a gateway restart" O1 "systemctl kill -s KILL vidfetch-gateway.service"
sleep 12; GW1=$(pidgw)
fails_with "a warning in the engine's journal" O6 "python3 -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8788/__warn\")'"
fails_with "removed egress rules" O5 "nft delete table inet vidfetch_egress"
X "nft -f /etc/vidfetch/egress.nft"
fails_with "a bundle rewritten after its process started (drift)" O2 "touch $NEWPATH"
X "systemctl reset-failed vidfetch.service vidfetch-gateway.service; systemctl restart vidfetch.service vidfetch-gateway.service"; sleep 3; ENG1=$(pideng); GW1=$(pidgw)

echo "# 5. rollback"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=0\$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env"
refuse "a rollback while downloads are open (ready=1)" "downloads are open" rollback
[ "$(pideng)" = "$ENG1" ] && [ "$(running vidfetch.service)" = "$NEWPATH" ] && ok "...the upgraded engine keeps running untouched" || bad "rollback refusal touched the engine"
X "sed -i 's/^VIDFETCH_CONNECTION_READY=1\$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env"
# as if 08-gateway.sh upgrade had run after this engine upgrade: the gateway must be rolled back first
X "cp $GW_DROPIN /root/gw-dropin.keep; cp $GWBUNDLE /root/gw-later.cjs; echo '// later' >> /root/gw-later.cjs; install -d -m 0755 /opt/vidfetch/releases/gateway-later; install -m 0644 /root/gw-later.cjs /opt/vidfetch/releases/gateway-later/vidfetch-gateway.cjs; sed -i 's#$GWBUNDLE#/opt/vidfetch/releases/gateway-later/vidfetch-gateway.cjs#' $GW_DROPIN; systemctl daemon-reload; systemctl restart vidfetch-gateway.service"; sleep 2
refuse "an engine rollback while a later gateway runs (08-gateway.sh rollback first)" "08-gateway.sh rollback" rollback
X "cp /root/gw-dropin.keep $GW_DROPIN; systemctl daemon-reload; systemctl reset-failed vidfetch-gateway.service; systemctl restart vidfetch-gateway.service"; sleep 2
OUT=$(docker exec $c bash $E rollback 2>&1); rc=$?
[ $rc = 0 ] && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "rollback succeeds and verifies itself" || bad "rollback (rc=$rc): $(echo "$OUT" | tail -4)"
[ "$(running vidfetch.service)" = "$OLD" ] && [ "$(running vidfetch-gateway.service)" = "$GWBUNDLE" ] && [ "$(state)" = "$S0" ] && X "[ ! -e /etc/systemd/system/vidfetch.service.d ]" && ok "previous engine running, gateway on its bundle; units, environments, egress unit and rules exactly as before; engine drop-in and its (empty) directory gone" || bad "state after rollback: $(running vidfetch.service)"
proc_facts | grep -q "^user=vidfetch-worker CapEff: 0000000000000000 NoNewPrivs: 1" && units_sound && ok "the restored engine keeps its isolation; no unit failed" || bad "restored engine: $(proc_facts)"
X "[ -f $NEWPATH ] && [ -f $OLD ]" && [ "$(pidweb)" = "$WEB0" ] && ok "both engine bundles are kept (nothing deleted); frontend untouched" || bad "bundles or frontend"
X "[ -f \$(readlink -f /var/backups/vidfetch-engine-upgrade-latest)/rolled-back ]" && ok "the rollback leaves its 'rolled-back' time, which the observation gate reads" || bad "no rolled-back marker"

echo "# 6. an engine that does not work is rolled back automatically; the start limit never leaves a unit stopped"
for bad_engine in broken noiso; do
  X "ln -sfn /opt/vidfetch-ci-web/releases/$( [ $bad_engine = broken ] && echo 2222222222222222222222222222222222222222 || echo 3333333333333333333333333333333333333333) /opt/vidfetch-web-preproduction-20261013/current"
  OUT=$(docker exec -e VM_ENGINE_SETTLE=4 $c bash $E upgrade "$(docker exec $c cat /root/$bad_engine.sha)" 2>&1); rc=$?
  [ $rc != 0 ] && echo "$OUT" | grep -q "FAILED:" && echo "$OUT" | grep -q "ROLLBACK VERIFIED" && ok "engine '$bad_engine': upgrade fails and rolls back by itself" || bad "engine $bad_engine (rc=$rc): $(echo "$OUT" | tail -5)"
  [ "$(running vidfetch.service)" = "$OLD" ] && [ "$(state)" = "$S0" ] && units_sound && ok "...previous engine and gateway running, files and egress as before, no unit failed" || bad "state after automatic rollback ($bad_engine): $(running vidfetch.service)"
done
# within these 5 minutes: upgrade, observe restarts, rollback, two automatic rollbacks = far more than 3 starts per unit
X "ln -sfn /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current"
OUT=$(docker exec -e VM_ENGINE_SETTLE=4 $c bash $E upgrade "$EXPECTED" 2>&1); rc=$?
[ $rc = 0 ] && units_sound && ok "another upgrade right after: still possible, no unit stuck on its start limit" || bad "upgrade after many starts (rc=$rc): $(echo "$OUT" | tail -4)"
X "for d in /opt/vidfetch/releases/engine-*; do [ -f \$d/vidfetch-ovh.cjs ] || exit 1; done; [ \$(ls -d /opt/vidfetch/releases/engine-* | wc -l) -ge 3 ]" && ok "every engine bundle ever installed is still there (old bundles are never removed)" || bad "a bundle directory disappeared"
docker exec $c bash $E rollback >/dev/null 2>&1

echo "# 7. interruption and neighbours"
X "mkdir -p /etc/systemd/system/vidfetch.service.d; printf '[Service]\nEnvironment=NEIGHBOUR=1\n' > /etc/systemd/system/vidfetch.service.d/10-other.conf; systemctl daemon-reload"
S_N=$(state)
docker exec -d -e VM_ENGINE_SETTLE=40 $c bash -c "echo \$\$ > /root/upgrade.pid; exec bash $E upgrade $EXPECTED > /root/interrupt.log 2>&1"
i=0; until [ "$(running vidfetch.service 2>/dev/null)" = "$NEWPATH" ]; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done
X 'kill -TERM $(cat /root/upgrade.pid)'; i=0; until X "grep -q 'ROLLBACK' /root/interrupt.log"; do i=$((i+1)); [ $i -gt 40 ] && break; sleep 1; done; sleep 3
X "grep -q 'ROLLBACK VERIFIED' /root/interrupt.log" && [ "$(running vidfetch.service)" = "$OLD" ] && ok "SIGTERM during the 60 s settling period: the script rolls back before exiting" || bad "interrupt: $(X 'tail -4 /root/interrupt.log')"
[ "$(state)" = "$S_N" ] && X "[ -f /etc/systemd/system/vidfetch.service.d/10-other.conf ] && [ ! -e $DROPIN ]" && ok "a neighbouring drop-in that existed before is untouched and its directory is kept; only our file is removed" || bad "neighbour drop-in"
[ "$(pidweb)" = "$WEB0" ] && ok "through all of this the frontend process never changed" || bad "frontend pid changed"
X "[ \"\$(systemctl show vidfetch-egress.service -p NRestarts --value)\" = 0 ] && ! journalctl -u vidfetch-egress --no-pager -o cat | grep -q 'Stopping\|Stopped'" && ok "the egress unit was never stopped, restarted or reloaded" || bad "the egress unit was touched"
exit $fail
