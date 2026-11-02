#!/bin/sh
# Exercise the weekly cleanup service/timer and real archive moves in disposable systemd.
set -eu
src=$(cd "$(dirname "$0")/../../.." && pwd); command -v docker >/dev/null || exit 2
id=$$; c=vf-incoming-cleanup-$id
trap 'docker rm -f "$c" >/dev/null 2>&1 || true' EXIT
arch=$(docker version -f '{{.Server.Arch}}') || exit 2; image=vf-incoming-test:deb13-$arch
docker build -q --platform "linux/$arch" -t "$image" - <<'DOCKER' >/dev/null || exit 2
FROM debian:13
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd systemd-sysv dbus python3 util-linux coreutils >/dev/null && rm -rf /var/lib/apt/lists/* && systemctl mask getty.target console-getty.service systemd-logind.service >/dev/null 2>&1
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKER
docker run -d --name "$c" --platform "linux/$arch" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock -v "$src":/repo:ro "$image" >/dev/null || exit 2
i=0; until docker exec "$c" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do i=$((i+1)); [ "$i" -lt 60 ] || exit 2; sleep 1; done
docker exec -i "$c" bash -s <<'SETUP'
set -eu
mkdir -p /var/lib/vidfetch-deploy/ci-incoming /var/backups /opt/vidfetch-ci-web/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa /opt/vidfetch-web-preproduction-20261013 /usr/local/libexec/vidfetch-ci
chmod 0700 /var/lib/vidfetch-deploy/ci-incoming
touch /opt/vidfetch-ci-web/lock
printf '{"release":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n' >/opt/vidfetch-ci-web/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest.json
ln -s /opt/vidfetch-ci-web/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa /opt/vidfetch-web-preproduction-20261013/current
install -o root -g root -m 0755 /repo/deploy/ovh/media/admin/13-clean-ci-incoming.py /usr/local/libexec/vidfetch-ci/13-clean-ci-incoming.py
install -o root -g root -m 0644 /repo/deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.service /etc/systemd/system/vidfetch-ci-incoming-cleanup.service
install -o root -g root -m 0644 /repo/deploy/ovh/systemd/vidfetch-ci-incoming-cleanup.timer /etc/systemd/system/vidfetch-ci-incoming-cleanup.timer
python3 - <<'PY'
import os,time
root='/var/lib/vidfetch-deploy/ci-incoming'; now=time.time()
for i,age in enumerate((7200,6500,6000,5500,5000,4500,60,20),1):
 name=f'{i:040x}.tgz'; path=os.path.join(root,name); open(path,'wb').write(name.encode()); os.utime(path,(now-age,now-age))
active=os.path.join(root,'a'*40+'.tgz');open(active,'wb').write(b'active');os.utime(active,(now-9000,now-9000))
open(os.path.join(root,'upload-partial'),'w').write('retain')
PY
systemctl daemon-reload
systemctl enable vidfetch-ci-incoming-cleanup.timer
systemctl start vidfetch-ci-incoming-cleanup.timer
systemctl is-enabled vidfetch-ci-incoming-cleanup.timer | grep -qx enabled
SETUP
if ! docker exec "$c" systemctl start vidfetch-ci-incoming-cleanup.service; then
  docker exec "$c" systemctl status vidfetch-ci-incoming-cleanup.service --no-pager || true
  docker exec "$c" journalctl -u vidfetch-ci-incoming-cleanup.service --no-pager || true
  exit 1
fi
docker exec "$c" journalctl -u vidfetch-ci-incoming-cleanup.service --no-pager | grep -q 'moved=5'
docker exec "$c" sh -c 'test "$(find /var/backups/vidfetch-ci-incoming-* -maxdepth 1 -type f | wc -l)" -eq 5'
docker exec "$c" test -f /var/lib/vidfetch-deploy/ci-incoming/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.tgz
docker exec "$c" test -f /var/lib/vidfetch-deploy/ci-incoming/upload-partial
docker exec "$c" systemctl list-timers --all | grep -q vidfetch-ci-incoming-cleanup.timer
echo 'systemd CI incoming cleanup test passed'
