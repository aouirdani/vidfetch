#!/usr/bin/env bash
# Usage: 09-ci-helper.sh check | install | rollback
# Replaces ONLY the CI promoter helper (/usr/local/libexec/vidfetch-ci/promote.py) by the promote.py sent with this
# toolkit, which adds the public profile. Nothing else of the CI installation changes: not release-lib.py, not
# dispatch.py or rollback.py, not sudoers, not the deploy account, not the guard. The profile in force does not
# change either: with no profile file, the promoter stays on the closed profile.
#   check     read-only: shows both versions and whether they differ
#   install   keeps the current helper in a dated root-only backup, installs the new one, then runs `status`
#             (read-only) through it; if that fails the previous helper is put back at once
#   rollback  puts back the helper of the latest backup made by install
. "$(dirname "$0")/common.sh"; need_root
DEST=$CI_HELPER
[[ "${DEST:?CI helper path is empty}" == /*/vidfetch-ci/promote.py && "$DEST" != *..* && "$DEST" != *//* ]] || die "unexpected CI helper path: $DEST"
[ -z "${VM_CI_HELPER+set}" ] || [ "${VM_SKIP_ROOT:-0}" = 1 ] || die "VM_CI_HELPER is for the offline tests only"
DIR=${DEST%/promote.py}; safe_dir "$DIR" "CI helper directory"
SRC="$(cd "$(dirname "$0")/.." && pwd)/promote.py"
LATEST="$BACKUPS/vidfetch-ci-helper-latest"
digest() { sha256sum "$1" | cut -c1-64; }
validate_source() {
  [ -f "$SRC" ] && [ ! -L "$SRC" ] || die "promote.py missing next to this toolkit: send it again (send-to-vps.sh)"
  python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read())' "$SRC" || die "promote.py does not parse"
  grep -q "^PUBLIC_PROFILE = {'profile': 'public', 'apex': 'public-indexable', 'dl': 'testers-only'}$" "$SRC" || die "this promote.py has no public profile"
  grep -q "^MEDIA_PROFILE = {'profile': 'media-test', 'apex': 'basic-auth-noindex', 'dl': 'testers-only'}$" "$SRC" || die "this promote.py lost the media-test profile"
}
# status_ok FILE [restored]: the helper's read-only status is valid JSON naming the active release. The new helper must
# also report its profile. The helper installed before the CI profiles existed (commit 88fbe237, still on the VPS
# on 14 October) prints no "profile" field at all: that is accepted only when it is the one being restored.
status_ok() {
  "$DEST" status > "$1" 2>&1 && python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
assert isinstance(d.get("release"), str) and d["release"]
if sys.argv[2] != "restored" or "profile" in d:
    assert d.get("profile") in ("closed", "media-test", "public")
' "$1" "${2:-new}"
}
case "${1:-}" in
  check)
    validate_source
    [ -f "$DEST" ] || die "no CI helper at $DEST"
    echo "installed: $(digest "$DEST")  $DEST"; echo "toolkit:   $(digest "$SRC")  $SRC"
    if cmp -s "$SRC" "$DEST"; then echo "identical: nothing to install"; else echo "differs: install would replace it (current one kept in a backup)"; fi ;;
  install)
    take_lock
    validate_source
    [ -f "$DEST" ] && [ ! -L "$DEST" ] || die "no CI helper at $DEST"
    if cmp -s "$SRC" "$DEST"; then log "already installed"; exit 0; fi
    BK=$(mktemp -d "$BACKUPS/vidfetch-ci-helper-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
    cp -p -- "$DEST" "$BK/promote.py"; cmp -s "$DEST" "$BK/promote.py" || die "backup copy failed"
    ln -sfn "$BK" "$LATEST"
    install -o root -g root -m 0755 "$SRC" "$DEST.next" && mv -f "$DEST.next" "$DEST"
    if status_ok "$BK/status.json"; then
      log "CI helper replaced ($(digest "$DEST" | cut -c1-12)); previous one kept in $BK. Status through the new helper:"; cat "$BK/status.json"
    else
      install -o root -g root -m 0755 "$BK/promote.py" "$DEST.next" && mv -f "$DEST.next" "$DEST"
      die "the new helper failed its status check: previous helper put back ($(digest "$DEST" | cut -c1-12))"
    fi ;;
  rollback)
    take_lock
    [ "$(ci_profile_name)" != public ] || die "the public CI profile is in force and the previous helper does not know it: revert the public window first (05-cancel.sh)"
    BK=$(readlink -f "$LATEST" 2>/dev/null) || true
    [ -n "$BK" ] && [ -f "$BK/promote.py" ] || die "no CI helper backup (install was never run)"
    install -o root -g root -m 0755 "$BK/promote.py" "$DEST.next" && mv -f "$DEST.next" "$DEST"
    cmp -s "$BK/promote.py" "$DEST" || die "rollback copy failed"
    status_ok "$BK/status-after-rollback.json" restored || die "the restored helper fails its status check: inspect $DEST"
    log "previous CI helper restored from $BK (sha256 $(digest "$DEST" | cut -c1-16)); status: $(cat "$BK/status-after-rollback.json")" ;;
  *) die "check|install|rollback" ;;
esac
