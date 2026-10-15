#!/usr/bin/env bash
# Usage: 09-ci-helper.sh check | install | rollback
# Replaces ONLY the CI promoter helper (/usr/local/libexec/vidfetch-ci/promote.py) by the promote.py sent with this
# toolkit, which knows the public and public-downloads profiles. Nothing else of the CI installation changes: not
# release-lib.py, not dispatch.py or rollback.py, not sudoers, not the deploy account, not the guard. The profile in
# force does not change either: with no profile file, the promoter stays on the closed profile.
#   check     read-only: shows both versions, whether they differ, and the profile in force
#   install   keeps the current helper in a dated root-only backup, installs the new one, then runs `status`
#             (read-only) through it; unless it reports the profile in force, the previous helper is put back at once
#   rollback  puts back the helper of the latest backup made by install, only if it applies the profile in force:
#             its source must define that profile exactly (otherwise nothing changes), then its own status must
#             report it (otherwise the helper that was in place is put back at once)
. "$(dirname "$0")/common.sh"; need_root
DEST=$CI_HELPER
[[ "${DEST:?CI helper path is empty}" == /*/vidfetch-ci/promote.py && "$DEST" != *..* && "$DEST" != *//* ]] || die "unexpected CI helper path: $DEST"
[ -z "${VM_CI_HELPER+set}" ] || [ "${VM_SKIP_ROOT:-0}" = 1 ] || die "VM_CI_HELPER is for the offline tests only"
DIR=${DEST%/promote.py}; safe_dir "$DIR" "CI helper directory"
SRC="$(cd "$(dirname "$0")/.." && pwd)/promote.py"
LATEST="$BACKUPS/vidfetch-ci-helper-latest"
digest() { sha256sum "$1" | cut -c1-64; }
# helper_knows FILE PROFILE: the helper FILE defines PROFILE exactly as these scripts write it (common.sh). Every
# helper applies closed (no profile file); the one from before the CI profiles (88fbe237) applies nothing else.
helper_knows() {
  local line
  case "$2" in
    closed) return 0 ;;
    media-test) line="MEDIA_PROFILE = {'profile': 'media-test', 'apex': 'basic-auth-noindex', 'dl': 'testers-only'}" ;;
    public) line="PUBLIC_PROFILE = {'profile': 'public', 'apex': 'public-indexable', 'dl': 'testers-only'}" ;;
    public-downloads) line="PUBLIC_DL_PROFILE = {'profile': 'public-downloads', 'apex': 'public-indexable', 'dl': 'public'}" ;;
    *) return 1 ;;
  esac
  grep -qxF -- "$line" "$1"
}
validate_source() {
  [ -f "$SRC" ] && [ ! -L "$SRC" ] || die "promote.py missing next to this toolkit: send it again (send-to-vps.sh)"
  python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read())' "$SRC" || die "promote.py does not parse"
  helper_knows "$SRC" public || die "this promote.py has no public profile"
  helper_knows "$SRC" public-downloads || die "this promote.py has no public-downloads profile"
  helper_knows "$SRC" media-test || die "this promote.py lost the media-test profile"
}
# status_ok FILE [restored]: the helper's read-only status is valid JSON naming the active release and reporting the
# profile in force (ACTIVE, as these scripts read it). Only the helper from before the CI profiles (88fbe237, on the
# VPS until 14 October) prints no "profile" at all: accepted only when it is the one being restored and the profile
# in force is closed, the only one it applies.
status_ok() {
  "$DEST" status > "$1" 2>&1 && python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
active, mode = sys.argv[2], sys.argv[3]
if not isinstance(d.get("release"), str) or not d["release"]:
    sys.exit("status names no release")
if ("profile" in d or mode != "restored" or active != "closed") and d.get("profile") != active:
    sys.exit("status reports profile %r, in force: %r" % (d.get("profile"), active))
' "$1" "${ACTIVE:?}" "${2:-new}"
}
case "${1:-}" in
  check)
    validate_source
    [ -f "$DEST" ] || die "no CI helper at $DEST"
    echo "installed: $(digest "$DEST")  $DEST"; echo "toolkit:   $(digest "$SRC")  $SRC"
    if cmp -s "$SRC" "$DEST"; then echo "identical: nothing to install"; else echo "differs: install would replace it (current one kept in a backup)"; fi
    echo "CI profile in force: $(ci_profile_name)" ;;
  install)
    take_lock
    validate_source
    [ -f "$DEST" ] && [ ! -L "$DEST" ] || die "no CI helper at $DEST"
    if cmp -s "$SRC" "$DEST"; then log "already installed"; exit 0; fi
    ACTIVE=$(ci_profile_name)
    BK=$(mktemp -d "$BACKUPS/vidfetch-ci-helper-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
    cp -p -- "$DEST" "$BK/promote.py"; cmp -s "$DEST" "$BK/promote.py" || die "backup copy failed"
    ln -sfn "$BK" "$LATEST"
    install -o root -g root -m 0755 "$SRC" "$DEST.next" && mv -f "$DEST.next" "$DEST"
    if status_ok "$BK/status.json"; then
      log "CI helper replaced ($(digest "$DEST" | cut -c1-12)); previous one kept in $BK. Status through the new helper:"; cat "$BK/status.json"
    else
      install -o root -g root -m 0755 "$BK/promote.py" "$DEST.next" && mv -f "$DEST.next" "$DEST"
      die "the new helper failed its status check (CI profile in force: $ACTIVE): previous helper put back ($(digest "$DEST" | cut -c1-12))"
    fi ;;
  rollback)
    take_lock
    BK=$(readlink -f "$LATEST" 2>/dev/null) || true
    [ -n "$BK" ] && [ -f "$BK/promote.py" ] || die "no CI helper backup (install was never run)"
    # only a backup made by install: a dated directory directly in BACKUPS, holding a real file
    [ "${BK%/*}" = "$(readlink -f "$BACKUPS")" ] && [[ "${BK##*/}" == vidfetch-ci-helper-2* ]] && [ -d "$BK" ] && [ ! -L "$BK/promote.py" ] \
      || die "unexpected CI helper backup: $BK"
    [ -f "$DEST" ] && [ ! -L "$DEST" ] || die "no CI helper at $DEST"
    ACTIVE=$(ci_profile_name)
    if ! helper_knows "$BK/promote.py" "$ACTIVE"; then
      case "$ACTIVE" in
        public) hint="revert the public window first (05-cancel.sh)" ;;
        public-downloads) hint="close downloads first (11-downloads.sh close)" ;;
        *) hint="inspect the CI profile file first" ;;
      esac
      die "the CI profile in force is '$ACTIVE' and the helper saved in $BK does not define it: nothing changed; $hint"
    fi
    cp -p -- "$DEST" "$BK/promote.py.replaced" && cmp -s "$DEST" "$BK/promote.py.replaced" || die "could not keep the helper in place: nothing changed"
    install -o root -g root -m 0755 "$BK/promote.py" "$DEST.next" && mv -f "$DEST.next" "$DEST"
    if cmp -s "$BK/promote.py" "$DEST" && status_ok "$BK/status-after-rollback.json" restored; then
      log "previous CI helper restored from $BK (sha256 $(digest "$DEST" | cut -c1-16)); CI profile in force: $ACTIVE; status: $(cat "$BK/status-after-rollback.json")"
    else
      install -o root -g root -m 0755 "$BK/promote.py.replaced" "$DEST.next" && mv -f "$DEST.next" "$DEST"
      cmp -s "$BK/promote.py.replaced" "$DEST" || die "rollback failed AND the helper that was in place could not be put back: inspect $DEST"
      die "the restored helper does not apply the '$ACTIVE' profile ($(head -c 300 "$BK/status-after-rollback.json" 2>/dev/null | tr '\n' ' ')): the helper that was in place is back ($(digest "$DEST" | cut -c1-12))"
    fi ;;
  *) die "check|install|rollback" ;;
esac
