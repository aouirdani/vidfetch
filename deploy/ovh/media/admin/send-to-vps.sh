#!/usr/bin/env bash
# Run on the administrator's own machine, inside a clone of the repository — never on the VPS.
# Sends the administrator toolkit from a git ref (default: origin/main) to ~/media-test-stage on the VPS and
# verifies every file there by checksum. An older copy already there is kept under a dated name, never deleted.
# It touches nothing outside ~/media-test-stage of the SSH user: no sudo, no service, no firewall.
# Nothing is written on this machine either: files are streamed straight from git objects, so there is no
# working directory to clean up and this script deletes nothing, locally or remotely.
#
# Usage:  send-to-vps.sh [GIT_REF] [RENDER_DIR]
#   GIT_REF     what to send; it must contain toolkit revision 2 or later (the hardened scripts)
#   RENDER_DIR  optional directory produced by render-ingress.py (ingress.nft, media-test-ips.env,
#               Caddyfile.test-only, SHA256SUMS); it is not in Git because it names the tester IP
set -euo pipefail
REF=${1:-origin/main}; RENDER=${2:-}
TARGET=${VM_SSH_TARGET:-debian@15.235.127.165}
read -r -a SSH_OPTS <<< "${VM_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"
die() { echo "REFUSED: $*" >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
COMMIT=$(git rev-parse --verify --quiet "$REF^{commit}") || die "unknown git ref $REF (run: git fetch origin)"
PREFIX=deploy/ovh/media; ADMIN=$PREFIX/admin; INSTALLER=$PREFIX/install-web-secrets.sh
# The public launch also needs the public Caddy configuration and the CI promoter that knows the public profile.
# Both land at the top of ~/media-test-stage; nothing is installed by this script. So does the administrator
# recovery helper (rollback.py), which only 12-rollback-helper.sh installs.
PUBLIC=$PREFIX/Caddyfile.public; PROMOTER=deploy/ovh/ci/promote.py; ROLLBACK=deploy/ovh/ci/rollback.py
PUBLIC_DL=$PREFIX/Caddyfile.public-dl; DL_INGRESS=$PREFIX/public-dl-ingress.py
SOURCES="$ADMIN $INSTALLER"
for extra in "$PUBLIC" "$PROMOTER" "$PUBLIC_DL" "$DL_INGRESS" "$ROLLBACK"; do git cat-file -e "$COMMIT:$extra" 2>/dev/null && SOURCES="$SOURCES $extra"; done
REVISION=$(git show "$COMMIT:$ADMIN/common.sh" 2>/dev/null | sed -n 's/^TOOLKIT_REVISION=//p')
[[ "$REVISION" =~ ^[0-9]+$ ]] && [ "$REVISION" -ge 2 ] || die "$REF ($(git rev-parse --short "$COMMIT")) does not contain the hardened toolkit (revision 2). Merge the hardening pull request, then: git fetch origin"
NAMES="admin install-web-secrets.sh Caddyfile.public promote.py Caddyfile.public-dl public-dl-ingress.py rollback.py SOURCE_COMMIT SHA256SUMS.toolkit"
RNAME=""
if [ -n "$RENDER" ]; then
  RENDER=${RENDER%/}
  [ -d "$RENDER" ] && [ -f "$RENDER/SHA256SUMS" ] || die "$RENDER is not a rendered directory (SHA256SUMS missing)"
  ( cd "$RENDER" && shasum -a 256 -c SHA256SUMS >/dev/null ) || die "$RENDER does not match its SHA256SUMS: render it again"
  cmp -s "$RENDER/Caddyfile.test-only" <(git show "$COMMIT:$PREFIX/Caddyfile.test-only") || die "the Caddyfile in $RENDER is not the one of $REF: render it again from that version"
  RNAME=$(basename "$RENDER"); [[ "$RNAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "unsupported render directory name"
  NAMES="$NAMES $RNAME"
fi
# Expected SHA-256 of every file as it will sit in ~/media-test-stage, computed from the git objects themselves.
checksums() {
  # shellcheck disable=SC2086
  git ls-tree -r --name-only "$COMMIT" $SOURCES | LC_ALL=C sort | while IFS= read -r path; do
    printf '%s  ./%s\n' "$(git cat-file blob "$COMMIT:$path" | shasum -a 256 | cut -c1-64)" "${path#deploy/ovh/*/}"
  done
  printf '%s  ./SOURCE_COMMIT\n' "$(printf '%s\n' "$COMMIT" | shasum -a 256 | cut -c1-64)"
  if [ -n "$RNAME" ]; then
    ( cd "$(dirname "$RENDER")" && find "$RNAME" -type f | LC_ALL=C sort | while IFS= read -r file; do printf '%s  ./%s\n' "$(shasum -a 256 "$file" | cut -c1-64)" "$file"; done )
  fi
}
SUMS=$(checksums)
COUNT=$(printf '%s\n' "$SUMS" | wc -l | tr -d ' ')
[ "$COUNT" -ge 15 ] || die "unexpectedly few files to send ($COUNT)"
remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }
echo "sending toolkit revision $REVISION from $(git rev-parse --short "$COMMIT") to $TARGET:media-test-stage ($COUNT files)"
# 1. the staging directory is private to the SSH user; whatever is there is kept under a dated name
remote "set -e; umask 077; mkdir -p ~/media-test-stage; cd ~/media-test-stage; chmod 700 .; ts=\$(date -u +%Y%m%dT%H%M%SZ); for n in $NAMES; do if [ -e \"\$n\" ]; then mv -- \"\$n\" \"\$n.old-\$ts\"; echo \"kept previous \$n as \$n.old-\$ts\"; fi; done"
# 2. the toolkit, streamed from the commit (executable bits come from git); deploy/ovh/media/ is stripped on arrival
# shellcheck disable=SC2086
git archive "$COMMIT" $SOURCES | remote 'umask 077; tar -C ~/media-test-stage --strip-components=3 -xf -'
# 3. the rendered directory, as a plain ustar stream (no macOS extended-attribute headers)
if [ -n "$RNAME" ]; then COPYFILE_DISABLE=1 tar --format=ustar -C "$(dirname "$RENDER")" -cf - "$RNAME" | remote 'umask 077; tar -C ~/media-test-stage -xf -'; fi
# 4. what was sent, and the checksums to verify it against
printf '%s\n' "$COMMIT" | remote 'umask 077; cat > ~/media-test-stage/SOURCE_COMMIT'
printf '%s\n' "$SUMS" | remote 'umask 077; cat > ~/media-test-stage/SHA256SUMS.toolkit'
# 5. verification on the VPS
remote "set -e; cd ~/media-test-stage; sha256sum --check --quiet SHA256SUMS.toolkit; grep -q '^TOOLKIT_REVISION=$REVISION\$' admin/common.sh; [ -x admin/03-network.sh ]; [ -x admin/08-gateway.sh ]; echo \"VERIFIED on the VPS: \$(wc -l < SHA256SUMS.toolkit) files, toolkit revision $REVISION, commit \$(cut -c1-8 SOURCE_COMMIT)\""
echo "Next, on the VPS: cd ~/media-test-stage/admin && sudo --preserve-env=SSH_CONNECTION bash 00-preflight.sh"
