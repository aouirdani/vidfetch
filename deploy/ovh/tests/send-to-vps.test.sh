#!/bin/sh
# Host side. Exercises send-to-vps.sh against a throwaway container running a real OpenSSH server that plays
# the VPS (user "debian", an older copy of the scripts already in ~/media-test-stage). Exit 2 = environment.
set -u
src=$(cd "$(dirname "$0")/../../.." && pwd); cd "$src" || exit 2
command -v docker >/dev/null && command -v ssh >/dev/null && command -v ssh-keygen >/dev/null && command -v shasum >/dev/null || exit 2
id=$$; c=vidfetch-sshvps-$id; T=$(mktemp -d); fail=0
trap 'docker rm -f $c >/dev/null 2>&1; rm -rf "$T"' EXIT
arch=$(docker version -f '{{.Server.Arch}}' 2>/dev/null) || exit 2
img=vidfetch-ssh-test:deb13-$arch
docker build -q --platform "linux/$arch" -t "$img" - >/dev/null <<'DOCKERFILE' || exit 2
FROM debian:13
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openssh-server >/dev/null && rm -rf /var/lib/apt/lists/* && mkdir -p /run/sshd && useradd -m -s /bin/bash debian && usermod -p '*' debian
CMD ["/usr/sbin/sshd", "-D", "-e"]
DOCKERFILE
ssh-keygen -q -t ed25519 -N '' -f "$T/key" || exit 2
docker run -d --name $c --platform "linux/$arch" -p 127.0.0.1::22 "$img" >/dev/null || exit 2
docker exec -i $c sh -c 'mkdir -m 700 /home/debian/.ssh && cat > /home/debian/.ssh/authorized_keys && chown -R debian:debian /home/debian/.ssh && chmod 600 /home/debian/.ssh/authorized_keys' < "$T/key.pub" || exit 2
docker exec $c test -s /home/debian/.ssh/authorized_keys || { echo "could not install the test key"; exit 2; }
port=$(docker port $c 22/tcp | head -1 | sed 's/.*://')
OPTS="-p $port -i $T/key -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=10"
R() { ssh $OPTS debian@127.0.0.1 "$1"; }
i=0; until R true 2>/dev/null; do i=$((i+1)); [ $i -gt 30 ] && { echo "sshd not reachable"; exit 2; }; sleep 1; done
ok() { echo "ok - $1"; }; bad() { echo "not ok - $1"; fail=1; }
send() { VM_SSH_TARGET=debian@127.0.0.1 VM_SSH_OPTS="$OPTS" bash deploy/ovh/media/admin/send-to-vps.sh "$@"; }

# an older copy is already on the "VPS" (what was transferred before the hardening)
R 'mkdir -p ~/media-test-stage/admin && echo "TOOLKIT_REVISION=1" > ~/media-test-stage/admin/common.sh && echo "old confirm" > ~/media-test-stage/admin/04-confirm.sh && echo old > ~/media-test-stage/install-web-secrets.sh'
# a rendered directory (fake tester IP from a documentation range, never committed)
mkdir "$T/render-open80"; printf 'table inet vidfetch_https_test_ingress {}\n' > "$T/render-open80/ingress.nft"; printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > "$T/render-open80/media-test-ips.env"
cp deploy/ovh/media/Caddyfile.test-only "$T/render-open80/"; ( cd "$T/render-open80" && shasum -a 256 ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS )
head=$(git rev-parse HEAD)

# a commit without the toolkit; explicit identity because CI runners have no git user configured
empty=$(GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid git commit-tree "$(git mktree </dev/null)" -m 'no toolkit' </dev/null) || exit 2
[ -n "$empty" ] || exit 2
send "$empty" >/dev/null 2>&1 && bad "a ref without the hardened toolkit was sent" || ok "refuses a git ref that does not contain toolkit revision 2"
R 'grep -q "TOOLKIT_REVISION=1" ~/media-test-stage/admin/common.sh && ! ls ~/media-test-stage | grep -q old-' && ok "...and leaves the VPS copy untouched" || bad "remote changed on refusal"
send no-such-ref >/dev/null 2>&1 && bad "unknown ref accepted" || ok "refuses an unknown git ref"
echo tampered >> "$T/render-open80/ingress.nft"; send HEAD "$T/render-open80" >/dev/null 2>&1 && bad "tampered render dir sent" || ok "refuses a rendered directory that does not match its SHA256SUMS"
printf 'table inet vidfetch_https_test_ingress {}\n' > "$T/render-open80/ingress.nft"
cp -R "$T/render-open80" "$T/render-stale"; echo '# other version' >> "$T/render-stale/Caddyfile.test-only"; ( cd "$T/render-stale" && shasum -a 256 ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS )
send HEAD "$T/render-stale" >/dev/null 2>&1 && bad "render dir from another Caddyfile version sent" || ok "refuses a rendered Caddyfile that is not the one of the exported version"
R 'grep -q "TOOLKIT_REVISION=1" ~/media-test-stage/admin/common.sh' && ok "VPS copy still untouched after the refusals" || bad "remote changed"

out=$(send HEAD "$T/render-open80" 2>&1); rc=$?
[ $rc = 0 ] && echo "$out" | grep -q "VERIFIED on the VPS" && ok "sends and verifies the toolkit" || bad "send failed (rc=$rc): $out"
R 'grep -q "^TOOLKIT_REVISION=2$" ~/media-test-stage/admin/common.sh && grep -q "_COMM=sshd-session" ~/media-test-stage/admin/04-confirm.sh' && ok "the VPS now holds the hardened scripts (revision 2, trusted-journal confirm)" || bad "new scripts not in place"
R 'd=$(ls -d ~/media-test-stage/admin.old-* | head -1) && grep -q "old confirm" "$d/04-confirm.sh" && ls ~/media-test-stage | grep -q "install-web-secrets.sh.old-"' && ok "the previous copy is kept under a dated name, not deleted" || bad "old copy not preserved"
R "[ \"\$(cat ~/media-test-stage/SOURCE_COMMIT)\" = $head ] && cd ~/media-test-stage && sha256sum --check --quiet SHA256SUMS.toolkit" && ok "source commit recorded and every file matches its checksum on the VPS" || bad "checksum / commit"
R 'cd ~/media-test-stage/admin && for f in 00-preflight.sh 01-backup.sh 03-network.sh 04-confirm.sh 07-restore-full.sh restore-network.sh; do [ -x $f ] || exit 1; done; bash -n 03-network.sh' && ok "scripts arrive executable and parse on the VPS" || bad "modes"
R 'cd ~/media-test-stage/render-open80 && sha256sum --check --quiet SHA256SUMS && grep -q 203.0.113.9 media-test-ips.env' && ok "rendered directory delivered intact" || bad "render dir"
R '[ "$(ls -A ~ | grep -v -e "^\.ssh$" -e "^\.bash" -e "^\.profile$" -e "^\.cache$" | tr "\n" " ")" = "media-test-stage " ]' && ok "nothing is written outside ~/media-test-stage" || bad "extra files: $(R 'ls -A ~ | tr "\n" " "')"
R '[ -z "$(find ~/media-test-stage -newer ~/.ssh/authorized_keys -perm /077 ! -name "*.old-*" ! -path "*.old-*/*")" ]' && ok "what was uploaded is readable by the SSH user only" || bad "permissions: $(R 'find ~/media-test-stage -perm /077 | head -3')"
sleep 1; send HEAD "$T/render-open80" >/dev/null 2>&1 && R '[ "$(ls -d ~/media-test-stage/admin.old-* | wc -l)" = 2 ] && grep -q "^TOOLKIT_REVISION=2$" ~/media-test-stage/admin/common.sh' && ok "a second run keeps the previous copy again and verifies" || bad "second run"
exit $fail
