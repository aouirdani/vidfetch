#!/usr/bin/env bash
# Run on the administrator's own machine, inside a clone of the repository — never on the VPS.
# Exports the administrator toolkit from a git ref (default: origin/main), puts it in ~/media-test-stage on the
# VPS and verifies every file by checksum. An older copy already there is kept under a dated name, never deleted.
# It touches nothing outside ~/media-test-stage of the SSH user: no sudo, no service, no firewall.
#
# Usage:  send-to-vps.sh [GIT_REF] [RENDER_DIR]
#   GIT_REF     what to export; it must contain toolkit revision 2 or later (the hardened scripts)
#   RENDER_DIR  optional directory produced by render-ingress.py (ingress.nft, media-test-ips.env,
#               Caddyfile.test-only, SHA256SUMS); it is not in Git because it names the tester IP
set -euo pipefail
REF=${1:-origin/main}; RENDER=${2:-}
TARGET=${VM_SSH_TARGET:-debian@15.235.127.165}
read -r -a SSH_OPTS <<< "${VM_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"
die() { echo "REFUSED: $*" >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
COMMIT=$(git rev-parse --verify --quiet "$REF^{commit}") || die "unknown git ref $REF (run: git fetch origin)"
REVISION=$(git show "$COMMIT:deploy/ovh/media/admin/common.sh" 2>/dev/null | sed -n 's/^TOOLKIT_REVISION=//p')
[[ "$REVISION" =~ ^[0-9]+$ ]] && [ "$REVISION" -ge 2 ] || die "$REF ($(git rev-parse --short "$COMMIT")) does not contain the hardened toolkit (revision 2). Merge the hardening pull request, then: git fetch origin"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/stage"; mkdir "$STAGE"
git archive "$COMMIT" deploy/ovh/media/admin deploy/ovh/media/install-web-secrets.sh | tar -x -C "$WORK"
mv "$WORK/deploy/ovh/media/admin" "$STAGE/admin"; mv "$WORK/deploy/ovh/media/install-web-secrets.sh" "$STAGE/install-web-secrets.sh"
NAMES="admin install-web-secrets.sh SOURCE_COMMIT SHA256SUMS.toolkit"
if [ -n "$RENDER" ]; then
  [ -d "$RENDER" ] && [ -f "$RENDER/SHA256SUMS" ] || die "$RENDER is not a rendered directory (SHA256SUMS missing)"
  ( cd "$RENDER" && shasum -a 256 -c SHA256SUMS >/dev/null ) || die "$RENDER does not match its SHA256SUMS: render it again"
  cmp -s "$RENDER/Caddyfile.test-only" <(git show "$COMMIT:deploy/ovh/media/Caddyfile.test-only") || die "the Caddyfile in $RENDER is not the one of $REF: render it again from that version"
  RNAME=$(basename "$RENDER"); [[ "$RNAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "unsupported render directory name"
  cp -R "$RENDER" "$STAGE/$RNAME"; NAMES="$NAMES $RNAME"
fi
echo "$COMMIT" > "$STAGE/SOURCE_COMMIT"
( cd "$STAGE" && find . -type f ! -name SHA256SUMS.toolkit | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f"; done > SHA256SUMS.toolkit )
echo "exporting toolkit revision $REVISION from $(git rev-parse --short "$COMMIT") to $TARGET:media-test-stage ($(wc -l < "$STAGE/SHA256SUMS.toolkit" | tr -d ' ') files)"
# 1. keep whatever is there under a dated name
ssh "${SSH_OPTS[@]}" "$TARGET" "set -e; umask 077; mkdir -p ~/media-test-stage; cd ~/media-test-stage; ts=\$(date -u +%Y%m%dT%H%M%SZ); for n in $NAMES; do if [ -e \"\$n\" ]; then mv \"\$n\" \"\$n.old-\$ts\"; echo \"kept previous \$n as \$n.old-\$ts\"; fi; done"
# 2. upload (tar keeps the executable bits), 3. verify on the VPS
# ustar + COPYFILE_DISABLE: macOS tar would otherwise add extended-attribute headers that GNU tar warns about
COPYFILE_DISABLE=1 tar --format=ustar -C "$STAGE" -cf - . | ssh "${SSH_OPTS[@]}" "$TARGET" 'umask 077; tar -C ~/media-test-stage -xf -'
ssh "${SSH_OPTS[@]}" "$TARGET" "set -e; cd ~/media-test-stage; sha256sum --check --quiet SHA256SUMS.toolkit; grep -q '^TOOLKIT_REVISION=$REVISION\$' admin/common.sh; [ -x admin/03-network.sh ]; echo \"VERIFIED on the VPS: \$(wc -l < SHA256SUMS.toolkit) files, toolkit revision $REVISION, commit \$(cut -c1-8 SOURCE_COMMIT)\""
echo "Next, on the VPS: cd ~/media-test-stage/admin && sudo --preserve-env=SSH_CONNECTION bash 00-preflight.sh"
