#!/usr/bin/env bash
# Usage: 12-rollback-helper.sh check | install | restore
# Replaces ONLY the administrator recovery helper (/usr/local/libexec/vidfetch-ci/rollback.py) by the rollback.py
# sent with this toolkit: unless downloads are confirmed closed (ready=0), it refuses to restore a release whose
# engine or gateway is not the one in service. Nothing else changes: not promote.py, release-lib.py or dispatch.py,
# not the CI sudoers (only read: the CI account must still be unable to run this helper), not ready, not the guard.
# Nothing is restored or restarted here; the helper file is only replaced.
#   check    read-only: both fingerprints, whether they differ, and that the CI account cannot run the helper
#   install  keeps the current helper in a dated root-only backup, installs the new one (root, 0755), then checks it
#            is that file and parses; otherwise the previous one is put back at once
#   restore  puts back the helper of the latest backup made by install; the one in place is kept next to it
. "$(dirname "$0")/common.sh"; need_root
DEST=${VM_ROLLBACK_HELPER-/usr/local/libexec/vidfetch-ci/rollback.py}
SUDOERS=${VM_CI_SUDOERS-/etc/sudoers.d/vidfetch-ci}
[[ "${DEST:?rollback helper path is empty}" == /*/vidfetch-ci/rollback.py && "$DEST" != *..* && "$DEST" != *//* ]] || die "unexpected rollback helper path: $DEST"
[ -z "${VM_ROLLBACK_HELPER+set}${VM_CI_SUDOERS+set}" ] || [ "${VM_SKIP_ROOT:-0}" = 1 ] || die "VM_ROLLBACK_HELPER and VM_CI_SUDOERS are for the offline tests only"
DIR=${DEST%/rollback.py}; safe_dir "$DIR" "rollback helper directory"
SRC="$(cd "$(dirname "$0")/.." && pwd)/rollback.py"
LATEST="$BACKUPS/vidfetch-rollback-helper-latest"
digest() { sha256sum "$1" | cut -c1-64; }
parses() { python3 -c 'import ast, sys; ast.parse(open(sys.argv[1]).read())' "$1"; }
validate_source() {
  [ -f "$SRC" ] && [ ! -L "$SRC" ] || die "rollback.py missing next to this toolkit: send it again (send-to-vps.sh)"
  parses "$SRC" || die "rollback.py does not parse"
  grep -qxF "    if os.geteuid() != 0 or os.environ.get('SUDO_USER') == 'vidfetch-deploy':" "$SRC" || die "this rollback.py lost the administrator check"
  grep -qxF "        why = None if ready == '0' else incompatibility(helper, target)" "$SRC" || die "this rollback.py has no downloads guard"
  # what the new helper reads from the installed promoter, besides what the previous one already used
  grep -qx 'def command(args):' "$DIR/promote.py" && grep -qx 'def trusted(path):' "$DIR/promote.py" \
    || die "the installed promoter ($DIR/promote.py) does not provide command() and trusted(): inspect it first"
}
# The CI account runs promote.py only (its forced command and sudoers). Read here, never changed.
ci_cannot_run() {
  [ -f "$SUDOERS" ] || die "CI sudoers $SUDOERS not found: inspect before changing the recovery helper"
  ! grep -q 'rollback' "$SUDOERS" || die "the CI sudoers names the rollback helper: inspect $SUDOERS; nothing changed"
}
# in_place FILE: the helper is FILE byte for byte, a root-owned 0755 regular file, and parses
in_place() { [ -f "$DEST" ] && [ ! -L "$DEST" ] && cmp -s "$1" "$DEST" && [ "$(stat -c '%u %a' "$DEST")" = "0 755" ] && parses "$DEST"; }
put() { install -o root -g root -m 0755 "$1" "$DEST.next" && mv -f "$DEST.next" "$DEST"; }
case "${1:-}" in
  check)
    validate_source; ci_cannot_run
    [ -f "$DEST" ] || die "no rollback helper at $DEST"
    echo "installed: $(digest "$DEST")  $DEST"; echo "toolkit:   $(digest "$SRC")  $SRC"
    if cmp -s "$SRC" "$DEST"; then echo "identical: nothing to install"; else echo "differs: install would replace it (current one kept in a backup)"; fi
    echo "the CI account cannot run it: $SUDOERS does not name it" ;;
  install)
    take_lock
    validate_source; ci_cannot_run
    [ -f "$DEST" ] && [ ! -L "$DEST" ] || die "no rollback helper at $DEST"
    if cmp -s "$SRC" "$DEST"; then log "already installed"; exit 0; fi
    BK=$(mktemp -d "$BACKUPS/vidfetch-rollback-helper-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
    cp -p -- "$DEST" "$BK/rollback.py" && cmp -s "$DEST" "$BK/rollback.py" || die "backup copy failed: nothing changed"
    ln -sfn "$BK" "$LATEST"
    put "$SRC" || true
    if in_place "$SRC"; then
      log "rollback helper replaced ($(digest "$DEST" | cut -c1-12)); previous one ($(digest "$BK/rollback.py" | cut -c1-12)) kept in $BK"
    else
      put "$BK/rollback.py" || true
      in_place "$BK/rollback.py" || die "install failed AND the previous helper could not be put back: inspect $DEST (previous one in $BK)"
      die "the new helper could not be put in place: previous helper put back ($(digest "$DEST" | cut -c1-12))"
    fi ;;
  restore)
    take_lock
    BK=$(readlink -f "$LATEST" 2>/dev/null) || true
    [ -n "$BK" ] && [ -f "$BK/rollback.py" ] || die "no rollback helper backup (install was never run)"
    # only a backup made by install: a dated directory directly in BACKUPS, holding a real file
    [ "${BK%/*}" = "$(readlink -f "$BACKUPS")" ] && [[ "${BK##*/}" == vidfetch-rollback-helper-2* ]] && [ -d "$BK" ] && [ ! -L "$BK/rollback.py" ] \
      || die "unexpected rollback helper backup: $BK"
    [ -f "$DEST" ] && [ ! -L "$DEST" ] || die "no rollback helper at $DEST"
    parses "$BK/rollback.py" || die "the helper saved in $BK does not parse: nothing changed"
    if cmp -s "$BK/rollback.py" "$DEST"; then log "the helper saved in $BK is already in place"; exit 0; fi
    cp -p -- "$DEST" "$BK/rollback.py.replaced" && cmp -s "$DEST" "$BK/rollback.py.replaced" || die "could not keep the helper in place: nothing changed"
    put "$BK/rollback.py" || true
    if in_place "$BK/rollback.py"; then
      log "previous rollback helper restored from $BK (sha256 $(digest "$DEST" | cut -c1-16)); the replaced one is kept as $BK/rollback.py.replaced"
    else
      put "$BK/rollback.py.replaced" || true
      in_place "$BK/rollback.py.replaced" || die "restore failed AND the helper that was in place could not be put back: inspect $DEST"
      die "the saved helper could not be put in place: the helper that was in place is back ($(digest "$DEST" | cut -c1-12))"
    fi ;;
  *) die "check|install|restore" ;;
esac
