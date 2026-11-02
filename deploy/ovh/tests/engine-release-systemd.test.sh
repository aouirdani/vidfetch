#!/bin/sh
# Runs the real release helper inside a disposable Debian/systemd container.
set -eu
src=$(cd "$(dirname "$0")/../../.." && pwd); command -v docker >/dev/null || exit 2
id=$$; c=vf-engine-$id; t=$(mktemp -d); trap 'docker rm -f "$c" >/dev/null 2>&1 || true; rm -rf "$t"' EXIT
arch=$(docker version -f '{{.Server.Arch}}') || exit 2; image=vf-engine-test:deb13-$arch
docker build -q --platform "linux/$arch" -t "$image" - <<'DOCKER' >/dev/null || exit 2
FROM debian:13
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv dbus python3 util-linux iproute2 procps ca-certificates nodejs tar >/dev/null && rm -rf /var/lib/apt/lists/* && systemctl mask getty.target console-getty.service systemd-logind.service >/dev/null 2>&1
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKER
docker run -d --name "$c" --platform "linux/$arch" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock -v "$src":/repo:ro "$image" >/dev/null || exit 2
i=0; until docker exec "$c" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ "$i" -lt 60 ] || exit 2; sleep 1; done
# Minimal test services use the same ports and status payloads as the admin health probe.
docker exec -i "$c" bash -s <<'SETUP'
set -eu; umask 022
mkdir -p /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111/{app,backend} /opt/vidfetch-ci-web/staging /opt/vidfetch/releases/old /opt/vidfetch-web-preproduction-20261013 /var/lib/vidfetch-deploy/ci-incoming /etc/vidfetch /var/backups /etc/systemd/system
mkdir -p /usr/local/libexec/vidfetch-ci
install -o root -g root -m 0755 /repo/deploy/ovh/media/admin/guard-update.py /usr/local/libexec/vidfetch-ci/guard-update.py
install -o root -g root -m 0644 /repo/deploy/ovh/ci/release-lib.py /usr/local/libexec/vidfetch-ci/release-lib.py
R=/opt/vidfetch/releases/old
cat > "$R/vidfetch-ovh.cjs" <<'JS'
require('http').createServer((q,s)=>{s.writeHead(200,{'content-type':'application/json'});s.end(JSON.stringify({ok:true,engine:{isolationProfile:'vidfetch-uid-nft-v1'}}))}).listen(8788,'127.0.0.1')
JS
cat > "$R/vidfetch-gateway.cjs" <<'JS'
require('http').createServer((q,s)=>{if(q.url==='/download-helper?lang=fr'){s.writeHead(200);s.end('<html lang="fr">ok</html>')}else{s.writeHead(401);s.end('no')}}).listen(8789,'127.0.0.1')
JS
cp "$R/vidfetch-ovh.cjs" /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111/backend/vidfetch-ovh.cjs
cp "$R/vidfetch-gateway.cjs" /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111/backend/vidfetch-gateway.cjs
cat > /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111/app/server.js <<'JS'
const h=require('http'),f=require('fs'),p=require('path');const release=p.basename(p.dirname(p.dirname(f.realpathSync(__filename))));h.createServer((q,s)=>{s.writeHead(200,{'content-type':'application/json'});s.end(JSON.stringify({ok:true,release,downloads:{available:true}}))}).listen(3001,'127.0.0.1')
JS
python3 - <<'PY'
import hashlib,json,pathlib
r=pathlib.Path('/opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111'); files={str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in r.rglob('*') if p.is_file()}; (r/'manifest.json').write_text(json.dumps({'schema':1,'platform':'linux-x64','release':'1'*40,'files':files}))
PY
ln -s /opt/vidfetch-ci-web/releases/1111111111111111111111111111111111111111 /opt/vidfetch-web-preproduction-20261013/current
printf 'VIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app\n' >/etc/vidfetch/gateway.env; chmod 0600 /etc/vidfetch/gateway.env
printf 'VIDFETCH_CONNECTION_READY=0\n' >/etc/vidfetch/web.env; chmod 0600 /etc/vidfetch/web.env
printf '{"files":{}}\n' >/etc/vidfetch/ci-web-test-guard.json; chmod 0600 /etc/vidfetch/ci-web-test-guard.json
for pair in 'vidfetch.service engine /opt/vidfetch/releases/old/vidfetch-ovh.cjs' 'vidfetch-gateway.service gateway /opt/vidfetch/releases/old/vidfetch-gateway.cjs' 'vidfetch-web-preproduction-20261013.service web /opt/vidfetch-web-preproduction-20261013/current/app/server.js'; do
 set -- $pair; cat >"/etc/systemd/system/$1" <<UNIT
[Unit]
Description=VidFetch $2 test
[Service]
Type=simple
ExecStart=/usr/bin/node $3
Restart=on-failure
[Install]
WantedBy=multi-user.target
UNIT
done
systemctl daemon-reload; systemctl start vidfetch.service vidfetch-gateway.service vidfetch-web-preproduction-20261013.service
SETUP
docker exec "$c" mkdir -p /opt/vidfetch-ci-web/releases /opt/vidfetch-ci-web/staging /opt/vidfetch/releases /opt/vidfetch-web-preproduction-20261013 /var/backups
docker exec "$c" chown root:root /opt/vidfetch-ci-web /opt/vidfetch-ci-web/releases /opt/vidfetch-ci-web/staging /opt/vidfetch/releases /opt/vidfetch-web-preproduction-20261013 /var/backups
docker exec "$c" chmod 0755 /opt/vidfetch-ci-web /opt/vidfetch-ci-web/releases /opt/vidfetch-ci-web/staging /opt/vidfetch/releases /opt/vidfetch-web-preproduction-20261013 /var/backups
docker exec "$c" chown root:root /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json
docker exec "$c" chmod 0600 /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json
# Build the archive on the host, then copy it into the throwaway VPS container.
rid=2222222222222222222222222222222222222222; r="$t/release"; mkdir -p "$r/app" "$r/backend"
cat >"$r/app/server.js" <<'JS'
const h=require('http'),f=require('fs'),p=require('path');const release=p.basename(p.dirname(p.dirname(f.realpathSync(__filename))));h.createServer((q,s)=>{s.writeHead(200,{'content-type':'application/json'});s.end(JSON.stringify({ok:true,release,downloads:{available:true}}))}).listen(3001,'127.0.0.1')
JS
cat >"$r/backend/vidfetch-ovh.cjs" <<'JS'
require('http').createServer((q,s)=>{s.writeHead(200,{'content-type':'application/json'});s.end(JSON.stringify({ok:true,engine:{isolationProfile:'vidfetch-uid-nft-v1'}}))}).listen(8788,'127.0.0.1')
JS
cat >"$r/backend/vidfetch-gateway.cjs" <<'JS'
require('http').createServer((q,s)=>{if(q.url==='/download-helper?lang=fr'){s.writeHead(200);s.end('<html lang="fr">ok</html>')}else{s.writeHead(401);s.end('no')}}).listen(8789,'127.0.0.1')
JS
python3 - "$rid" "$r" <<'PY'
import hashlib,json,pathlib,sys
rid,r=sys.argv[1],pathlib.Path(sys.argv[2]); files={str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in r.rglob('*') if p.is_file()}; (r/'manifest.json').write_text(json.dumps({'schema':1,'platform':'linux-x64','release':rid,'files':files}))
PY
python3 - "$r" "$t/$rid.tgz" <<'PY'
import pathlib,sys,tarfile
root,out=pathlib.Path(sys.argv[1]),sys.argv[2]
with tarfile.open(out,'w:gz') as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file(): archive.add(path,arcname=str(path.relative_to(root)),recursive=False)
PY
docker exec "$c" mkdir -p /var/lib/vidfetch-deploy/ci-incoming
docker cp "$t/$rid.tgz" "$c:/var/lib/vidfetch-deploy/ci-incoming/$rid.tgz" >/dev/null
sum=$(docker exec "$c" sha256sum "/var/lib/vidfetch-deploy/ci-incoming/$rid.tgz" | cut -d' ' -f1)
[ "${#sum}" = 64 ] || { echo 'fixture archive was not created' >&2; exit 1; }
# The test container is root, matching the production helper's trusted incoming upload boundary.
cmd="VM_SYSD=/etc/systemd/system VM_CI_STORE=/opt/vidfetch-ci-web VM_CI_INCOMING=/var/lib/vidfetch-deploy/ci-incoming VM_RELEASES=/opt/vidfetch/releases VM_WEB_BASE=/opt/vidfetch-web-preproduction-20261013 VM_WEB_ENV=/etc/vidfetch/web.env VM_DOWNLOADS_LOCK=/run/vidfetch-media-test.lock VM_GUARD=/etc/vidfetch/ci-web-test-guard.json VM_GUARD_UPDATE=/usr/local/libexec/vidfetch-ci/guard-update.py VM_RELEASE_LIB=/usr/local/libexec/vidfetch-ci/release-lib.py VM_BACKUPS=/var/backups VM_NODE=/usr/bin/node VM_LOCK=/opt/vidfetch-ci-web/lock VM_SKIP_PUBLIC_ORIGIN=1 VM_SKIP_PROMOTER_READY=1 VM_SETTLE_SECONDS=1"
script=/repo/deploy/ovh/media/admin/12-engine-release.sh
run() { docker exec "$c" bash -c "$cmd bash '$script' $*"; }
docker exec "$c" sh -c "printf 'VIDFETCH_CONNECTION_READY=1\\n' >/etc/vidfetch/web.env"
if run apply "$rid" "$sum" 2>&1 | grep -q 'downloads must be closed'; then echo 'ok - apply refuses while public downloads are open'; else echo 'apply unexpectedly allowed with downloads open' >&2; exit 1; fi
docker exec "$c" sh -c "printf 'VIDFETCH_CONNECTION_READY=0\\n' >/etc/vidfetch/web.env"
run check "$rid" "$sum" | grep -q 'check operation made no changes'
echo 'ok - check verifies archive and leaves services alone'
run apply "$rid" "$sum" | grep -q 'APPLIED:'
echo 'ok - apply installs both bundles, aligns frontend and updates guard'
run apply "$rid" "$sum" | grep -q 'ALREADY APPLIED'
echo 'ok - apply is idempotent'
run rollback | grep -q 'ROLLBACK VERIFIED'
echo 'ok - rollback restores old services, pointer and guard'
echo 'systemd simulated release test passed'
