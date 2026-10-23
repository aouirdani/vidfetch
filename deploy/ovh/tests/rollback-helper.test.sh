#!/usr/bin/env bash
# Throwaway-container test (root inside the Docker wrapper; everything under one temporary directory):
# 12-rollback-helper.sh check, install and restore, starting from the recovery helper installed on the VPS
# (fixtures/rollback-76bb56b6.py.fixture), and every refusal. The CI sudoers and the promoter are only read.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
F=/r/deploy/ovh/tests/fixtures
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p "$W/tk" "$W/libexec/vidfetch-ci" "$W/bk" "$W/sudoers.d"
cp -R /r/deploy/ovh/media/admin "$W/tk/admin" && cp /r/deploy/ovh/ci/rollback.py "$W/tk/"
A=$W/tk/admin; DEST=$W/libexec/vidfetch-ci/rollback.py; NEW=$W/tk/rollback.py; LATEST=$W/bk/vidfetch-rollback-helper-latest
OLD=$F/rollback-76bb56b6.py.fixture; OLD_SHA=76bb56b67eb684a520764ce9aaea8de3b6ce219dbfa3fa6d292ffc6302a03cae
export VM_SKIP_ROOT=1 VM_BACKUPS="$W/bk" VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_ROLLBACK_HELPER="$DEST" VM_CI_SUDOERS="$W/sudoers.d/vidfetch-ci"
cp /r/deploy/ovh/ci/sudoers "$VM_CI_SUDOERS"; cp "$VM_CI_SUDOERS" "$W/sudoers.keep"
install -m 0755 /r/deploy/ovh/ci/promote.py "$W/libexec/vidfetch-ci/promote.py"; cp "$W/libexec/vidfetch-ci/promote.py" "$W/promote.keep"
install -m 0755 "$OLD" "$DEST"; cp "$NEW" "$W/new.keep"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
sum() { sha256sum "$1" | cut -c1-64; }
backups() { find "$W/bk" -maxdepth 1 -type d -name 'vidfetch-rollback-helper-2*' | wc -l; }
run() { bash "$A/12-rollback-helper.sh" "$@" 2>&1; }

echo "# 1. check: read-only"
[ "$(sum "$DEST")" = "$OLD_SHA" ] && ok "the helper in place is the one installed on the VPS (76bb56b6...)" || bad "fixture differs from the VPS helper"
out=$(run check); rc=$?
[ $rc = 0 ] && grep -q differs <<< "$out" && grep -q "the CI account cannot run it" <<< "$out" && [ "$(sum "$DEST")" = "$OLD_SHA" ] && [ "$(backups)" = 0 ] \
  && ok "check: reports the difference and that the CI account cannot run it; nothing written" || bad "check rc=$rc: $out"
out=$(run); [ $? != 0 ] && grep -q "check|install|restore" <<< "$out" && ok "no operation: usage, nothing done" || bad "usage: $out"

echo "# 2. install refusals: nothing changed, no backup"
refuse() {   # LABEL EXPECTED [VAR=VALUE...]
  local label=$1 want=$2; shift 2
  out=$(env "$@" bash "$A/12-rollback-helper.sh" install 2>&1); local rc=$?
  [ $rc != 0 ] && grep -q -- "$want" <<< "$out" && [ "$(sum "$DEST")" = "$OLD_SHA" ] && [ "$(backups)" = 0 ] \
    && ok "install refuses: $label (helper untouched, no backup)" || bad "install with $label: rc=$rc $out"
}
echo 'vidfetch-deploy ALL=(root) NOPASSWD: /usr/local/libexec/vidfetch-ci/rollback.py' >> "$VM_CI_SUDOERS"
refuse "the CI sudoers names the rollback helper" "the CI sudoers names the rollback helper"
cp "$W/sudoers.keep" "$VM_CI_SUDOERS"
refuse "no CI sudoers to read" "CI sudoers .* not found" VM_CI_SUDOERS="$W/none"
grep -v "why = None if ready == '0'" "$W/new.keep" > "$NEW"; refuse "a rollback.py without the downloads guard" "has no downloads guard"
sed "s/os.environ.get('SUDO_USER') == 'vidfetch-deploy'/False/" "$W/new.keep" > "$NEW"; refuse "a rollback.py without the administrator check" "lost the administrator check"
printf 'def broken(:\n' > "$NEW"; refuse "a rollback.py that does not parse" "does not parse"
rm -f "$NEW"; refuse "no rollback.py in the toolkit" "rollback.py missing next to this toolkit"
cp "$W/new.keep" "$NEW"
grep -v '^def command(args):' "$W/promote.keep" > "$W/libexec/vidfetch-ci/promote.py"; refuse "an installed promoter without command()" "does not provide command() and trusted()"
cp "$W/promote.keep" "$W/libexec/vidfetch-ci/promote.py"
mv "$DEST" "$W/dest.keep"; ln -s "$W/dest.keep" "$DEST"
out=$(run install); [ $? != 0 ] && grep -q "no rollback helper at" <<< "$out" && [ -L "$DEST" ] && [ "$(sum "$W/dest.keep")" = "$OLD_SHA" ] && [ "$(backups)" = 0 ] \
  && ok "install refuses a helper path that is a symlink (target untouched)" || bad "symlinked helper: $out"
rm -f "$DEST"; mv "$W/dest.keep" "$DEST"
out=$(VM_ROLLBACK_HELPER='' run check); [ $? != 0 ] && grep -q "rollback helper path is empty" <<< "$out" && ok "stops: helper path empty" || bad "empty path: $out"
out=$(VM_ROLLBACK_HELPER=/etc/passwd run install); [ $? != 0 ] && grep -q "unexpected rollback helper path" <<< "$out" && [ -s /etc/passwd ] && ok "stops: helper path /etc/passwd (file intact)" || bad "/etc/passwd: $out"
out=$(VM_ROLLBACK_HELPER="$W/libexec/../libexec/vidfetch-ci/rollback.py" run install); [ $? != 0 ] && grep -q "unexpected rollback helper path" <<< "$out" && ok "stops: helper path with .." || bad "..: $out"
out=$(env -u VM_SKIP_ROOT bash "$A/12-rollback-helper.sh" check 2>&1); [ $? != 0 ] && grep -q "for the offline tests only" <<< "$out" && ok "refuses the path overrides outside the offline tests" || bad "override accepted: $out"

echo "# 3. install"
mkdir "$DEST.next"   # the new file cannot be put in place: the previous one must stay
out=$(run install); rc=$?
[ $rc != 0 ] && grep -q "the new helper could not be put in place: previous helper put back" <<< "$out" && [ "$(sum "$DEST")" = "$OLD_SHA" ] && [ "$(stat -c '%u %a' "$DEST")" = "0 755" ] \
  && ok "a failed install leaves the VPS helper in place, byte for byte" || bad "failed install rc=$rc: $out"
rm -f "$DEST.next/rollback.py"; rmdir "$DEST.next"; before=$(backups)
out=$(run install); rc=$?; BK=$(readlink -f "$LATEST")
[ $rc = 0 ] && cmp -s "$NEW" "$DEST" && [ "$(stat -c '%u %a' "$DEST")" = "0 755" ] && [ "$(sum "$BK/rollback.py")" = "$OLD_SHA" ] && [ "$(stat -c %a "$BK")" = 700 ] \
  && [ "$(backups)" = $((before + 1)) ] && grep -q "kept in $BK" <<< "$out" \
  && ok "install: guarded helper in place (root, 0755); the VPS helper kept byte for byte in a dated root-only (0700) backup" || bad "install rc=$rc: $out"
[ "$(find "$W/libexec/vidfetch-ci" -mindepth 1 | sed "s|$W/libexec/vidfetch-ci/||" | sort | tr '\n' ' ')" = "promote.py rollback.py " ] \
  && ok "nothing else in the helper directory (no .next, no __pycache__)" || bad "extra files: $(ls -A "$W/libexec/vidfetch-ci")"
cmp -s "$W/sudoers.keep" "$VM_CI_SUDOERS" && cmp -s "$W/promote.keep" "$W/libexec/vidfetch-ci/promote.py" && ok "the CI sudoers and the promoter are untouched" || bad "CI files changed"
out=$(run install); [ $? = 0 ] && grep -q "already installed" <<< "$out" && [ "$(backups)" = $((before + 1)) ] && ok "install again: already installed, no new backup" || bad "second install: $out"
out=$(run check); grep -q identical <<< "$out" && ok "check after install: identical" || bad "check after install: $out"

echo "# 4. restore"
mkdir "$DEST.next"
out=$(run restore); rc=$?
[ $rc != 0 ] && grep -q "the helper that was in place is back" <<< "$out" && cmp -s "$NEW" "$DEST" && ok "a failed restore leaves the guarded helper in place" || bad "failed restore rc=$rc: $out"
rm -f "$DEST.next/rollback.py" "$DEST.next/rollback.py.replaced"; rmdir "$DEST.next"
out=$(run restore); rc=$?
[ $rc = 0 ] && [ "$(sum "$DEST")" = "$OLD_SHA" ] && [ "$(stat -c '%u %a' "$DEST")" = "0 755" ] && cmp -s "$BK/rollback.py.replaced" "$NEW" && grep -q "restored from $BK (sha256 ${OLD_SHA:0:16})" <<< "$out" \
  && ok "restore: the VPS helper is back byte for byte (0755); the replaced one is kept next to the backup" || bad "restore rc=$rc: $out"
out=$(run restore); [ $? = 0 ] && grep -q "already in place" <<< "$out" && [ "$(sum "$DEST")" = "$OLD_SHA" ] && ok "restore again: already in place, nothing changed" || bad "second restore: $out"
out=$(run install); [ $? = 0 ] && cmp -s "$NEW" "$DEST" && ok "install after restore: the guarded helper again" || bad "reinstall: $out"

echo "# 5. restore takes only a backup made by install"
mkdir -p "$W/outside/x" "$W/bk/other-dir"; printf 'print(1)\n' > "$W/outside/x/rollback.py"; printf 'print(1)\n' > "$W/bk/other-dir/rollback.py"
for target in "$W/outside/x" "$W/bk/other-dir"; do
  ln -sfn "$target" "$LATEST"
  out=$(run restore); [ $? != 0 ] && grep -q "unexpected rollback helper backup" <<< "$out" && cmp -s "$NEW" "$DEST" && [ ! -e "$target/rollback.py.replaced" ] \
    && ok "restore refuses a backup link to ${target#"$W"/} (helper and that directory untouched)" || bad "restore accepted ${target#"$W"/}: $out"
done
d=$(mktemp -d "$W/bk/vidfetch-rollback-helper-20990101T000000Z.XXXXXX"); printf 'def broken(:\n' > "$d/rollback.py"; ln -sfn "$d" "$LATEST"
out=$(run restore); [ $? != 0 ] && grep -q "does not parse: nothing changed" <<< "$out" && cmp -s "$NEW" "$DEST" && ok "restore refuses a saved helper that does not parse" || bad "unparsable backup: $out"
rm -f "$LATEST"; out=$(run restore); [ $? != 0 ] && grep -q "no rollback helper backup" <<< "$out" && cmp -s "$NEW" "$DEST" && ok "restore without any backup: refused" || bad "no backup: $out"
! grep -n -E '\brm +(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)' "$A/12-rollback-helper.sh" && ok "no recursive removal in 12-rollback-helper.sh" || bad "recursive rm"
exit $fail
