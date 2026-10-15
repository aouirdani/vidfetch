#!/usr/bin/env bash
# Throwaway container only (it creates canary files under / and /etc). Proves that no administrator script
# creates or removes anything at a path assembled from an empty or unexpected value.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
A=/r/deploy/ovh/media/admin
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
W=$(mktemp -d)
REAL=/etc/systemd/system; GWD=$REAL/vidfetch-gateway.service.d; CADDYD=$REAL/vidfetch-caddy.service.d
mkdir -p "$REAL" /etc/vidfetch/public-https-test "$CADDYD" /var/backups
# Canaries: exactly where an empty SYSD or GW_UNIT would have pointed, plus neighbours that must survive.
mkdir -p /.d /vidfetch-gateway.service.d /vidfetch-caddy.service.d "$REAL/.d" "$W/elsewhere"
for f in /.d/canary /vidfetch-gateway.service.d/canary /vidfetch-caddy.service.d/canary "$REAL/.d/canary" "$REAL/ssh.service" "$REAL/vidfetch.service" \
         "$CADDYD/ci-frontend.conf" /etc/vidfetch/web.env /etc/vidfetch/public-https-test/Caddyfile "$W/elsewhere/keep"; do echo "keep $f" > "$f"; done
snap() { find /.d /vidfetch-gateway.service.d /vidfetch-caddy.service.d /etc/systemd /etc/vidfetch /etc/passwd "$W/elsewhere" \( -type f -o -type l -o -type d \) -print0 2>/dev/null | sort -z | xargs -0 ls -ld --time-style=+ 2>/dev/null | awk '{print $1, $NF}' ; find /.d /vidfetch-gateway.service.d /vidfetch-caddy.service.d /etc/systemd /etc/vidfetch "$W/elsewhere" -type f -exec sha256sum {} + 2>/dev/null | sort; }
S0=$(snap)
untouched() { [ "$(snap)" = "$S0" ] && ok "$1" || { bad "$1"; diff <(echo "$S0") <(snap) | head -5; }; }
# call a helper from common.sh in its own shell: die() exits, so each case is isolated
helper() { bash -c '. "$1/common.sh"; shift; "$@"' _ "$A" "$@"; }
refused() { local label=$1; shift; local out rc; out=$("$@" 2>&1); rc=$?; [ $rc != 0 ] && ok "refused: $label" || bad "ACCEPTED: $label (output: $out)"; }

echo "# 1. dropin_dir: empty and invalid values"
refused "empty systemd directory"            helper dropin_dir "" vidfetch-gateway.service
refused "empty unit name"                    helper dropin_dir "$REAL" ""
refused "relative systemd directory"         helper dropin_dir etc/systemd/system vidfetch-gateway.service
refused "systemd directory /"                helper dropin_dir / vidfetch-gateway.service
refused "trailing slash"                     helper dropin_dir "$REAL/" vidfetch-gateway.service
refused "double slash"                       helper dropin_dir /etc//systemd/system vidfetch-gateway.service
refused "parent traversal (..)"              helper dropin_dir /etc/systemd/../systemd/system vidfetch-gateway.service
refused "missing systemd directory"          helper dropin_dir /nonexistent/systemd vidfetch-gateway.service
ln -s "$REAL" "$W/sysd-link"
refused "symlinked systemd directory"        helper dropin_dir "$W/sysd-link" vidfetch-gateway.service
refused "unit with a slash"                  helper dropin_dir "$REAL" ../evil.service
refused "unit with a space"                  helper dropin_dir "$REAL" "vidfetch gateway.service"
refused "unit that is not a service"         helper dropin_dir "$REAL" vidfetch-gateway.timer
refused "bare .service"                      helper dropin_dir "$REAL" .service
out=$(helper dropin_dir "$REAL" vidfetch-gateway.service 2>&1); [ "$out" = "$GWD" ] && ok "valid values give exactly $GWD" || bad "valid dropin_dir gave '$out'"
echo regular > "$GWD"; S_FILE=$(snap)
refused "drop-in path that is a regular file" helper dropin_dir "$REAL" vidfetch-gateway.service
[ "$(snap)" = "$S_FILE" ] && ok "...and that file is left alone" || bad "file changed"
rm -f "$GWD"; ln -s "$W/elsewhere" "$GWD"
refused "drop-in path that is a symlink"     helper dropin_dir "$REAL" vidfetch-gateway.service
[ -f "$W/elsewhere/keep" ] && [ -L "$GWD" ] && ok "...and neither the link nor its target is touched" || bad "symlink or target touched"
rm -f "$GWD"
untouched "after every refusal the canaries are intact (/.d, /vidfetch-gateway.service.d, $REAL/.d, units)"

echo "# 2. remove_expected_file / remove_dir_if_empty"
mkdir -p "$W/d/sub"; echo a > "$W/d/target"; echo b > "$W/d/sibling"; echo c > "$W/d/sub/inner"; ln -s "$W/elsewhere/keep" "$W/d/link"
refused "empty directory argument"           helper remove_expected_file "" target
refused "empty file name"                    helper remove_expected_file "$W/d" ""
refused "file name with a slash"             helper remove_expected_file "$W/d" sub/inner
refused "file name .."                       helper remove_expected_file "$W/d" ..
refused "directory /"                        helper remove_expected_file / canary
refused "relative directory"                 helper remove_expected_file d target
refused "target is a directory"              helper remove_expected_file "$W/d" sub
refused "target is a symlink"                helper remove_expected_file "$W/d" link
[ -f "$W/d/target" ] && [ -f "$W/d/sub/inner" ] && [ -L "$W/d/link" ] && [ -f "$W/elsewhere/keep" ] && ok "nothing was removed by the refused calls" || bad "something was removed"
helper remove_expected_file "$W/d" absent && ok "an absent file is not an error" || bad "absent file"
helper remove_expected_file "$W/d" target && [ ! -e "$W/d/target" ] && [ -f "$W/d/sibling" ] && [ -f "$W/d/sub/inner" ] && ok "the named regular file is removed, its siblings stay" || bad "valid removal"
refused "remove_dir_if_empty with an empty argument" helper remove_dir_if_empty ""
refused "remove_dir_if_empty /"              helper remove_dir_if_empty /
helper remove_dir_if_empty "$W/d" >/dev/null 2>&1; [ -d "$W/d" ] && [ -f "$W/d/sibling" ] && ok "a directory that still has content is left in place" || bad "non-empty directory removed"
mkdir "$W/empty"; helper remove_dir_if_empty "$W/empty" && [ ! -e "$W/empty" ] && ok "an empty directory is removed with rmdir" || bad "empty directory"
refused "safe_dir on an empty value"         helper safe_dir ""
refused "safe_dir on a symlink"              helper safe_dir "$W/sysd-link"
untouched "canaries intact after the helper tests"

echo "# 3. 08-gateway.sh: empty variables and invalid paths stop before anything is created or removed"
gw() { env "$@" bash "$A/08-gateway.sh" rollback; }
expect_stop() { local label=$1 want=$2; shift 2; local out rc; out=$(gw "$@" 2>&1); rc=$?
  [ $rc != 0 ] && grep -q -- "$want" <<< "$out" && ok "08-gateway stops: $label" || bad "08-gateway did not stop on: $label (rc=$rc, output: $(head -2 <<< "$out"))"; }
expect_stop "SYSD empty"                          "SYSD is empty"                 VM_SYSD=
expect_stop "GW_UNIT empty"                       "GW_UNIT is empty"              VM_GW_UNIT=
expect_stop "another unit name"                   "only manages vidfetch-gateway" VM_GW_UNIT=ssh.service
expect_stop "unit name with traversal"            "only manages vidfetch-gateway" VM_GW_UNIT=../../etc/passwd
expect_stop "SYSD = /"                            "unexpected systemd directory"  VM_SYSD=/
expect_stop "relative SYSD"                       "unexpected systemd directory"  VM_SYSD=etc/systemd/system
expect_stop "SYSD with trailing slash"            "unexpected systemd directory"  VM_SYSD=$REAL/
expect_stop "SYSD with .."                        "unexpected systemd directory"  VM_SYSD=/etc/systemd/../systemd/system
expect_stop "SYSD missing"                        "not a real directory"          VM_SYSD=/nonexistent/dir
expect_stop "SYSD is a symlink"                   "not a real directory"          VM_SYSD=$W/sysd-link
ln -s "$W/elsewhere" "$GWD"
expect_stop "drop-in directory replaced by a symlink" "not a real directory"      VM_SYSD=$REAL
[ -f "$W/elsewhere/keep" ] && ok "...the symlink target is intact" || bad "symlink target touched"
rm -f "$GWD"
expect_stop "RELEASES / MANIFEST do not matter yet: a valid layout reaches the next check" "no gateway upgrade backup found" VM_SYSD=$REAL
[ ! -e "$GWD" ] && ok "a refused run does not even create the drop-in directory" || bad "drop-in directory was created"
untouched "after all refused 08-gateway runs: /.d, /vidfetch-gateway.service.d, other units and drop-ins intact"

echo "# 4. restore scripts: same rules"
B=$(mktemp -d /var/backups/vidfetch-media-test-fake.XXXXXX); mkdir -p "$B/etc-vidfetch-tree" "$B/systemd"; touch "$B/MANIFEST.sha256"
rf() { env "$@" bash "$A/07-restore-full.sh" "$B" --yes; }
expect_rf() { local label=$1 want=$2; shift 2; local out rc; out=$(rf "$@" 2>&1); rc=$?
  [ $rc != 0 ] && grep -q -- "$want" <<< "$out" && ok "restore-full stops: $label" || bad "restore-full did not stop on: $label (rc=$rc: $(head -2 <<< "$out"))"; }
expect_rf "ETC empty"            "ETC is empty"                       VM_ETC=
expect_rf "SYSD empty"           "SYSD is empty"                      VM_SYSD=
expect_rf "ETC = /"              "unexpected configuration directory" VM_ETC=/
expect_rf "ETC with .."          "unexpected configuration directory" VM_ETC=/etc/vidfetch/../vidfetch
expect_rf "SYSD relative"        "unexpected systemd directory"       VM_SYSD=etc/systemd/system
expect_rf "SYSD is a symlink"    "not a real directory"               VM_SYSD=$W/sysd-link
out=$(bash "$A/07-restore-full.sh" "" --yes 2>&1); [ $? != 0 ] && ok "restore-full stops: empty backup directory" || bad "empty backup dir accepted"
rn() { env "$@" bash "$A/restore-network.sh" "$B"; }
out=$(rn VM_DROPIN= 2>&1); [ $? != 0 ] && grep -q "DROPIN is empty" <<< "$out" && ok "restore-network stops: DROPIN empty" || bad "restore-network DROPIN empty: $out"
out=$(rn VM_DROPIN=/etc/passwd 2>&1); [ $? != 0 ] && grep -q "unexpected drop-in path" <<< "$out" && [ -s /etc/passwd ] && ok "restore-network stops: DROPIN pointing at /etc/passwd (file intact)" || bad "restore-network accepted /etc/passwd"
out=$(rn VM_DROPIN=$CADDYD/../vidfetch-caddy.service.d/media-test.conf 2>&1); [ $? != 0 ] && ok "restore-network stops: DROPIN with .." || bad "restore-network accepted .."
rc_() { env "$@" bash "$A/restore-caddy.sh" "$B"; }
out=$(rc_ VM_DROPIN= 2>&1); [ $? != 0 ] && grep -q "DROPIN is empty" <<< "$out" && ok "restore-caddy stops: DROPIN empty" || bad "restore-caddy DROPIN empty: $out"
out=$(rc_ VM_DROPIN=/etc/passwd 2>&1); [ $? != 0 ] && grep -q "unexpected drop-in path" <<< "$out" && [ -s /etc/passwd ] && ok "restore-caddy stops: DROPIN pointing at /etc/passwd (file intact)" || bad "restore-caddy accepted /etc/passwd"
out=$(rc_ VM_DROPIN=$CADDYD/../vidfetch-caddy.service.d/media-test.conf 2>&1); [ $? != 0 ] && ok "restore-caddy stops: DROPIN with .." || bad "restore-caddy accepted .."
out=$(rc_ VM_BASE=/etc/vidfetch/../vidfetch/public-https-test 2>&1); [ $? != 0 ] && grep -q "unexpected path" <<< "$out" && ok "restore-caddy stops: BASE with .." || bad "restore-caddy accepted BASE with .."
out=$(bash "$A/restore-caddy.sh" "" 2>&1); [ $? != 0 ] && ok "restore-caddy stops: empty backup directory" || bad "restore-caddy empty backup dir"
out=$(bash "$A/restore-caddy.sh" var/backups/x 2>&1); [ $? != 0 ] && grep -q "path must be absolute" <<< "$out" && ok "restore-caddy stops: relative backup directory" || bad "restore-caddy relative backup dir"
out=$(bash "$A/restore-caddy.sh" "$B" 2>&1); [ $? != 0 ] && grep -q "invalid backup" <<< "$out" && ok "restore-caddy stops: backup without a recorded pointer" || bad "restore-caddy without current.target: $out"
out=$(rc_ VM_PROFILE= 2>&1); [ $? != 0 ] && grep -q "PROFILE is empty" <<< "$out" && ok "restore-caddy stops: CI profile path empty" || bad "restore-caddy VM_PROFILE empty: $out"
out=$(rc_ VM_PROFILE=/etc/passwd 2>&1); [ $? != 0 ] && grep -q "unexpected CI profile path" <<< "$out" && [ -s /etc/passwd ] && ok "restore-caddy stops: CI profile path pointing at /etc/passwd (file intact)" || bad "restore-caddy accepted VM_PROFILE=/etc/passwd"
out=$(rc_ VM_PROFILE=/etc/vidfetch/../vidfetch/ci-media-test-profile.json 2>&1); [ $? != 0 ] && ok "restore-caddy stops: CI profile path with .." || bad "restore-caddy accepted a profile path with .."
ci() { env VM_SKIP_ROOT=1 "$@" bash "$A/09-ci-helper.sh" rollback; }
out=$(ci VM_CI_HELPER= 2>&1); [ $? != 0 ] && grep -q "CI helper path is empty" <<< "$out" && ok "09-ci-helper stops: helper path empty" || bad "09-ci-helper empty path: $out"
out=$(ci VM_CI_HELPER=/etc/passwd 2>&1); [ $? != 0 ] && grep -q "unexpected CI helper path" <<< "$out" && [ -s /etc/passwd ] && ok "09-ci-helper stops: helper path /etc/passwd (file intact)" || bad "09-ci-helper accepted /etc/passwd"
out=$(ci VM_CI_HELPER=/usr/local/libexec/../libexec/vidfetch-ci/promote.py 2>&1); [ $? != 0 ] && ok "09-ci-helper stops: helper path with .." || bad "09-ci-helper accepted .."
out=$(ci VM_CI_HELPER=usr/local/libexec/vidfetch-ci/promote.py 2>&1); [ $? != 0 ] && ok "09-ci-helper stops: relative helper path" || bad "09-ci-helper accepted a relative path"
out=$(env VM_CI_HELPER=/tmp/vidfetch-ci/promote.py bash "$A/09-ci-helper.sh" check 2>&1); [ $? != 0 ] && grep -q "for the offline tests only" <<< "$out" && ok "09-ci-helper refuses a helper override outside the offline tests" || bad "09-ci-helper override accepted: $out"
# rollback only takes a backup made by install: a dated directory directly in BACKUPS
mkdir -p "$W/ci/vidfetch-ci" "$W/cibk/other-dir" "$W/outside-bk"; echo IN-PLACE > "$W/ci/vidfetch-ci/promote.py"
echo SAVED > "$W/outside-bk/promote.py"; echo SAVED > "$W/cibk/other-dir/promote.py"
for target in "$W/outside-bk" "$W/cibk/other-dir"; do
  ln -sfn "$target" "$W/cibk/vidfetch-ci-helper-latest"
  out=$(ci VM_CI_HELPER="$W/ci/vidfetch-ci/promote.py" VM_BACKUPS="$W/cibk" VM_LOCK="$W/ci.lock" 2>&1)
  [ $? != 0 ] && grep -q "unexpected CI helper backup" <<< "$out" && [ "$(cat "$W/ci/vidfetch-ci/promote.py")" = IN-PLACE ] && [ ! -e "$target/promote.py.replaced" ] \
    && ok "09-ci-helper rollback stops: backup link to ${target#"$W"/} (helper and backup untouched)" || bad "09-ci-helper rollback accepted ${target#"$W"/}: $out"
done
out=$(env VM_PROFILE=/etc/passwd bash "$A/05-confirm.sh" --external-checks-passed 2>&1); [ $? != 0 ] && [ -s /etc/passwd ] && ok "05-confirm stops before writing anything when the CI profile path is unexpected" || bad "05-confirm with VM_PROFILE=/etc/passwd"
rd() { env "$@" bash "$A/restore-dl.sh" "$B"; }
out=$(bash "$A/restore-dl.sh" "" 2>&1); [ $? != 0 ] && ok "restore-dl stops: empty snapshot directory" || bad "restore-dl empty snapshot"
out=$(bash "$A/restore-dl.sh" var/backups/x 2>&1); [ $? != 0 ] && grep -q "path must be absolute" <<< "$out" && ok "restore-dl stops: relative snapshot directory" || bad "restore-dl relative: $out"
out=$(bash "$A/restore-dl.sh" /var/backups/../tmp 2>&1); [ $? != 0 ] && grep -q "unexpected path" <<< "$out" && ok "restore-dl stops: snapshot path with .." || bad "restore-dl ..: $out"
out=$(rd VM_BASE=/etc/vidfetch/../vidfetch/public-https-test 2>&1); [ $? != 0 ] && grep -q "unexpected path" <<< "$out" && ok "restore-dl stops: BASE with .." || bad "restore-dl BASE ..: $out"
out=$(bash "$A/restore-dl.sh" "$B" 2>&1); [ $? != 0 ] && grep -q "invalid snapshot" <<< "$out" && ok "restore-dl stops: directory that is not a snapshot (nothing touched)" || bad "restore-dl non-snapshot: $out"
for s in 10-dl-public.sh 10-dl-confirm.sh 10-dl-cancel.sh 11-downloads.sh; do
  out=$(env VM_DROPIN=/etc/passwd bash "$A/$s" open 2>&1); [ $? != 0 ] && [ -s /etc/passwd ] && ok "$s stops on an unexpected drop-in path (common checks)" || bad "$s accepted VM_DROPIN=/etc/passwd"
done
out=$(env VM_BACKUPS=/nonexistent bash "$A/10-dl-confirm.sh" --external-checks-passed 2>&1); [ $? != 0 ] && grep -q "no public-download snapshot" <<< "$out" && ok "10-dl-confirm stops when no snapshot exists" || bad "10-dl-confirm without snapshot: $out"
for s in 05-confirm.sh 05-cancel.sh; do
  out=$(env VM_DROPIN=/etc/passwd bash "$A/$s" --external-checks-passed 2>&1); [ $? != 0 ] && grep -q "unexpected Caddy drop-in path" <<< "$out" && ok "$s stops: unexpected drop-in path" || bad "$s accepted an unexpected drop-in path"
  out=$(env VM_DROPIN= bash "$A/$s" --external-checks-passed 2>&1); [ $? != 0 ] && grep -q "DROPIN is empty" <<< "$out" && ok "$s stops: DROPIN empty" || bad "$s DROPIN empty"
done
out=$(env VM_DROPIN=/etc/passwd bash "$A/05-caddy.sh" --port80-verified-from-outside 2>&1); [ $? != 0 ] && grep -q "unexpected Caddy drop-in path" <<< "$out" && ok "05-caddy stops: unexpected drop-in path" || bad "05-caddy accepted an unexpected drop-in path"
out=$(env VM_DROPIN= bash "$A/05-caddy.sh" --port80-verified-from-outside 2>&1); [ $? != 0 ] && grep -q "DROPIN is empty" <<< "$out" && ok "05-caddy stops: DROPIN empty" || bad "05-caddy DROPIN empty"
out=$(env VM_PROFILE=/etc/passwd bash "$A/06-profile.sh" remove 2>&1); [ $? != 0 ] && [ -s /etc/passwd ] && ok "06-profile remove stops: unexpected profile path (file intact)" || bad "06-profile accepted /etc/passwd"
out=$(env VM_PROFILE= bash "$A/06-profile.sh" remove 2>&1); [ $? != 0 ] && ok "06-profile remove stops: empty profile path" || bad "06-profile empty path"
rmdir "$B/etc-vidfetch-tree" "$B/systemd"; rm -f "$B/MANIFEST.sha256"; rmdir "$B"
untouched "after all refused restore runs the canaries are intact"

echo "# 5. the rule is enforced in the sources"
! grep -n -E '\brm +(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)' "$A"/*.sh /r/deploy/ovh/media/install-web-secrets.sh && ok "no recursive rm in any administrator script" || bad "recursive rm found"
! grep -n -E -- '-delete\b|-exec +rm\b|xargs +(-[^ ]+ +)*rm\b|shred\b' "$A"/*.sh /r/deploy/ovh/media/install-web-secrets.sh && ok "no other bulk deletion either (find -delete, -exec rm, xargs rm)" || bad "bulk deletion found"
for f in "$A"/*.sh; do [ -x "$f" ] || { bad "not executable in the repository: ${f##*/}"; continue; }; done; [ -x "$A/08-gateway.sh" ] && ok "every administrator script is executable in the repository, 08-gateway.sh included" || true
! grep -n -E '\brm +-f +"?\$' "$A"/*.sh /r/deploy/ovh/media/install-web-secrets.sh | grep -v -- ' -- ' && ok "every rm of a variable path uses -- " || bad "rm of a variable path without --"
! grep -n -E '"\$SYSD/\$[A-Z_]+' "$A"/*.sh && ok 'no "$SYSD/$VAR" concatenation left: mandatory ${VAR:?} forms only' || bad 'unvalidated "$SYSD/$VAR" concatenation'
grep -q 'dropin_dir "${SYSD:?SYSD is empty}" "${GW_UNIT:?GW_UNIT is empty}"' "$A/08-gateway.sh" && grep -q '= /etc/systemd/system/vidfetch-gateway.service.d \]' "$A/08-gateway.sh" && ok "08-gateway derives its drop-in directory through the validated helper and pins the exact production path" || bad "08-gateway path derivation"
exit $fail
