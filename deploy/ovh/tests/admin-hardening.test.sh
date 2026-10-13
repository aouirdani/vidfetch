#!/usr/bin/env bash
# Throwaway-container test (writes under /etc). System tools are stubs that log their calls; the point is
# the scripts' decisions: who may confirm and when, how the restore behaves under partial failure and
# concurrency, and whether a backup really brings the configuration back without leaking secrets.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
A=/r/deploy/ovh/media/admin
W=$(mktemp -d); trap 'rm -rf "$W"; kill $(jobs -p) 2>/dev/null' EXIT
mkdir -p "$W/bin" "$W/bk" "$W/state" /etc/vidfetch/public-https-test /etc/systemd/system/vidfetch-caddy.service.d /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013
BASE=/etc/vidfetch/public-https-test
cat > "$W/bin/stub" <<'S'
#!/bin/sh
n=$(basename "$0"); echo "$n $*" >> "$STATE/calls.log"
case "$n" in
  systemctl) case "$1" in
      is-active) [ "$2" = --quiet ] && t=$3 || t=$2
        case "$t" in vidfetch-media-rollback.timer) [ -f "$STATE/armed" ];; vidfetch-media-rollback.service) [ -f "$STATE/restoring" ];; vidfetch-caddy.service) [ ! -f "$STATE/caddy-down" ];; *) exit 0;; esac ;;
      stop) rm -f "$STATE/armed" ;;
      reload) c=$(cat "$STATE/reload-fails" 2>/dev/null || echo 0); if [ "$c" -gt 0 ]; then echo $((c-1)) > "$STATE/reload-fails"; exit 1; fi ;;
      show) echo 4242 ;; esac ;;
  systemd-run) touch "$STATE/armed" ;;
  nft) [ -f "$STATE/nft-list-fails" ] && [ "$1" = list ] && exit 1
       case "$1" in --check) exit 0;; --file) [ -f "$STATE/nft-apply-fails" ] && exit 1; exit 0;; esac
       if [ "$1 $2" = "list ruleset" ]; then echo "table inet x {}"; else cat "$STATE/live-table" 2>/dev/null || echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi ;;
  journalctl) cat "$STATE/journal.txt" 2>/dev/null ;;
  logger|runuser) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser journalctl; do ln -s stub "$W/bin/$n"; done
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"; [ -f "$STATE/fw-fails" ] && exit 1; cp "$BASE_FOR_FW/ingress.nft" "$STATE/applied.nft"; exit 0
S
chmod +x "$W/fw"
export STATE="$W/state" BASE_FOR_FW=$BASE PATH="$W/bin:$PATH" VM_BACKUPS="$W/bk" VM_FW="$W/fw" VM_CADDY=/bin/true VM_JOURNALCTL="$W/bin/journalctl" \
  VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_RESTORE_LOCK_WAIT=30 VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
calls() { cat "$STATE/calls.log" 2>/dev/null; }
reset_state() { rm -f "$STATE"/* ; : > "$STATE/calls.log"; }

# ---------------------------------------------------------------- fixture: an "active" configuration with secrets
CAN1=CANARY-TURNSTILE-SECRET-1a2b; CAN2=CANARYHMACKEYCANARYHMACKEYCANARYHMACKE1; CAN3=CANARY-BCRYPT-HASH-9z
mkfix() {
  rm -rf /etc/vidfetch; mkdir -p $BASE /etc/systemd/system/vidfetch-caddy.service.d
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\nOLD=1\n' > /etc/vidfetch/web.env
  printf 'VIDFETCH_ACCESS_SIGNING_KEY=%s\nVIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app\nTURNSTILE_SECRET_KEY=%s\n' $CAN2 $CAN1 > /etc/vidfetch/gateway.env
  echo '{"files":{"/etc/vidfetch/web.env":"abc"}}' > /etc/vidfetch/ci-web-test-guard.json
  echo isolation > /etc/vidfetch/isolation.json; echo 'nameserver 1.1.1.1' > /etc/vidfetch/resolv.conf; echo APPROVED > /etc/vidfetch/ci-web-test-ready
  chmod 600 /etc/vidfetch/web.env /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json; chmod 640 /etc/vidfetch/isolation.json; chown 1000:1000 /etc/vidfetch/resolv.conf
  echo ORIGINAL-INGRESS > $BASE/ingress.nft; echo CF-CADDY > $BASE/Caddyfile; echo BOOT > $BASE/Caddyfile.bootstrap; echo "basic_auth bcrypt x { u $CAN3 }" > $BASE/auth.caddy
  chmod 640 $BASE/auth.caddy; rm -f $BASE/current; ln -s Caddyfile $BASE/current
  printf '[Service]\nExecStart=/bin/true\n' > /etc/systemd/system/vidfetch-caddy.service
  printf '[Unit]\nRequires=x\n' > /etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf
  rm -f /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
  echo web > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
}
snap() { ( find /etc/vidfetch /etc/systemd/system/vidfetch-caddy.service /etc/systemd/system/vidfetch-caddy.service.d -printf '%p %y %m %U:%G %l\n'; find /etc/vidfetch /etc/systemd/system/vidfetch-caddy.service /etc/systemd/system/vidfetch-caddy.service.d -type f -exec sha256sum {} + ) | sort; }
stage_files() { printf 'NEW-INGRESS\n        tcp dport 80 accept\n        tcp dport 443 ip saddr @testers4 accept\n' > $BASE/ingress.nft.media-test; printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > $BASE/media-test-ips.env
  printf 'import /etc/vidfetch/public-https-test/auth.caddy\nX-Robots-Tag "noindex, nofollow"\n' > $BASE/Caddyfile.media-test; }

# ================================================================ D. backup -> mutate everything -> full restore
echo "# D. backups restore the active configuration without exposing secrets"
reset_state; mkfix; S0=$(snap); touch -d '2020-01-01' /etc/vidfetch/web.env
out=$(bash $A/01-backup.sh 2>&1); rc=$?
[ $rc = 0 ] && ok "backup succeeds" || bad "backup rc=$rc: $out"
B=$(readlink -f "$W/bk/vidfetch-media-test-latest")
[ "$(stat -c %a "$B")" = 700 ] && [ -z "$(find "$B" -maxdepth 1 -type f -perm /077)" ] && [ "$(stat -c %a "$B/caddy-state.tgz")" = 600 ] && [ "$(stat -c %a "$B/MANIFEST.sha256")" = 600 ] && ok "backup directory 0700; everything the script writes is 0600/0700" || bad "backup permissions"
for f in etc-vidfetch-tree/gateway.env etc-vidfetch-tree/web.env caddy-state.tgz public-https-test/auth.caddy; do setpriv --reuid=1000 --regid=1000 --clear-groups cat "$B/$f" >/dev/null 2>&1 && bad "NON-ROOT USER CAN READ $f" || :; done
setpriv --reuid=1000 --regid=1000 --clear-groups cat "$B/etc-vidfetch-tree/gateway.env" >/dev/null 2>&1 && bad "non-root read" || ok "an unprivileged user cannot read ANY backed-up secret (env files, auth hash, Caddy state)"
echo "$out" | grep -qE "CANARY" && bad "backup printed a secret" || ok "backup output contains no secret value"
grep -rqE "CANARY" "$B/MANIFEST.sha256" "$B/units.txt" "$B/current.target" && bad "secret in metadata files" || ok "manifest/metadata hold hashes and names only"
( cd "$B" && sha256sum --check --quiet MANIFEST.sha256 ) && ok "manifest verifies" || bad "manifest"
diff -r /etc/vidfetch "$B/etc-vidfetch-tree" >/dev/null && ok "whole /etc/vidfetch tree captured (owner/mode via cp -a)" || bad "tree differs"
[ "$(stat -c %u:%a "$B/etc-vidfetch-tree/resolv.conf")" = "1000:644" ] && ok "original owner and mode preserved in the backup" || bad "owner/mode"
[ "$(cat "$B/ci-profile.state")" = absent ] && ok "CI profile state recorded (absent)" || bad "profile state"
S0=$(snap)
# --- mutate EVERYTHING the activation touches
stage_files; bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "03 in D"
touch "$STATE/armed"; echo 'import auth.caddy' >> $BASE/Caddyfile.media-test
bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 || bad "05 in D"
printf 'TURNSTILE_SITE_KEY=%s\nTURNSTILE_SECRET_KEY=%s\nVIDFETCH_ACCESS_SIGNING_KEY=%s\nVIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app\nVIDFETCH_CONNECTION_READY=1\n' x $CAN1 $CAN2 >> /etc/vidfetch/web.env
sed -i 's#api.vidfetch.app#dl.vidfetch.app#' /etc/vidfetch/gateway.env
echo '{"files":{"/etc/vidfetch/web.env":"zzz","/etc/vidfetch/new":"1"}}' > /etc/vidfetch/ci-web-test-guard.json
echo '{"profile":"media-test"}' > /etc/vidfetch/ci-media-test-profile.json; echo '[Unit]' >> /etc/systemd/system/vidfetch-caddy.service; chmod 666 /etc/vidfetch/isolation.json
[ "$(snap)" != "$S0" ] && ok "(precondition) the system is now fully mutated" || bad "mutation had no effect"
: > "$STATE/calls.log"
bash $B/restore-full.sh "$B" >/dev/null 2>&1 && bad "restore-full without --yes" || ok "restore-full refuses without --yes"
echo tamper >> "$B/etc-vidfetch-tree/web.env"; bash $B/restore-full.sh "$B" --yes >/dev/null 2>&1 && bad "restore of a tampered backup" || ok "restore-full refuses a backup that fails its integrity check"
sed -i '$d' "$B/etc-vidfetch-tree/web.env"
out=$(bash $B/restore-full.sh "$B" --yes 2>&1); rc=$?
[ $rc = 0 ] && ok "restore-full succeeds" || bad "restore-full rc=$rc: $out"
S1=$(snap)
[ "$S1" = "$S0" ] && ok "after restore-full: every file, hash, owner, mode and link equals the pre-backup state" || { bad "state differs after restore"; diff <(echo "$S0") <(echo "$S1") | head -8; }
[ ! -e /etc/vidfetch/ci-media-test-profile.json ] && [ ! -e $BASE/Caddyfile.media-test ] && [ ! -e $BASE/media-test-ips.env ] && ok "media-test files and CI profile removed" || bad "leftovers"
echo "$out" | grep -qE "CANARY" && bad "restore printed a secret" || ok "restore output contains no secret value"
calls | grep -E '^systemctl (restart|start|stop|enable)' | grep -v 'stop vidfetch-media-rollback' | grep -q . && bad "restore-full restarted something" || ok "restore-full restarted nothing (only prints what to restart)"
# backup refusals on a modified system
stage_files; echo 'tcp dport 443 ip saddr @testers4 accept' >> $BASE/ingress.nft
bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup over modified ingress" || ok "backup refuses when ingress already holds testers4"
echo ORIGINAL-INGRESS > $BASE/ingress.nft; touch "$STATE/armed"; bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup while armed" || ok "backup refuses while the timer is armed"; rm -f "$STATE/armed"
touch /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf; bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup with drop-in" || ok "backup refuses when the media-test drop-in exists"; rm -f /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
ln -sfn Caddyfile.media-test $BASE/current; bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup with moved pointer" || ok "backup refuses when Caddy already points at media-test"; ln -sfn Caddyfile $BASE/current
before=$(readlink "$W/bk/vidfetch-media-test-latest"); touch "$STATE/nft-list-fails"; sleep 1
bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup despite nft failure" || ok "a failing backup step fails the backup"
[ "$(readlink "$W/bk/vidfetch-media-test-latest")" = "$before" ] && [ "$(ls -d $W/bk/vidfetch-media-test-2* | wc -l)" = 1 ] && ok "failed backup leaves no partial directory and the 'latest' link untouched" || bad "partial backup left behind"
rm -f "$STATE/nft-list-fails"

# ================================================================ A. confirm: who, when
echo "# A. confirm requires a NEW public-key login from the tester IPv4, after the rules are live"
reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files
bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "03 in A"
ARM=$(cat "$B/armed-at"); T=203.0.113.9
line() { awk -v t="$ARM" -v d="$1" 'BEGIN{printf "%.6f", t+d}'; }
jl() { # delta ip method -> journal line in real "short-unix" format
  printf '%s vps sshd[%s]: Accepted %s for debian from %s port 50123 ssh2: ED25519 SHA256:abcdef\n' "$(line "$1")" "$RANDOM" "${3:-publickey}" "$2"; }
tryconfirm() { touch "$STATE/armed"; rm -f "$B/confirmed" "$B/restore-started" "$B/restored"; bash $A/04-confirm.sh >"$STATE/out" 2>&1; }
expect_refuse() { : > "$STATE/journal.txt"; for l in "${@:2}"; do printf '%s\n' "$l" >> "$STATE/journal.txt"; done
  tryconfirm && { bad "ACCEPTED: $1"; return; }; [ -f "$STATE/armed" ] && [ ! -e "$B/confirmed" ] && ok "refused: $1" || bad "refused but state changed: $1"; }
expect_refuse "no login at all"
expect_refuse "login from another IPv4 (198.51.100.7)" "$(jl 60 198.51.100.7)"
expect_refuse "tester login BEFORE the rules (armed-30s)" "$(jl -30 $T)"
expect_refuse "tester login one second after (inside the 3 s margin)" "$(jl 1 $T)"
expect_refuse "tester login just inside the margin (armed+2.9s)" "$(jl 2.9 $T)"
expect_refuse "tester via password (a human may finish typing it on an old connection)" "$(jl 60 $T password)"
expect_refuse "tester via keyboard-interactive" "$(jl 60 $T keyboard-interactive)"
expect_refuse "lookalike 203.0.113.90" "$(jl 60 203.0.113.90)"
expect_refuse "lookalike 3.0.113.9 / 203.0.113.99" "$(jl 60 3.0.113.9)" "$(jl 60 203.0.113.99)"
expect_refuse "IPv6 source" "$(jl 60 2001:db8::9)"
expect_refuse "root-owned noise: a failed login from the tester" "$(printf '%s vps sshd[1]: Failed publickey for debian from %s port 5 ssh2\n' "$(line 60)" $T)"
out=$(cat "$STATE/out"); echo "$out" | grep -q "no new public-key SSH login" && ok "refusal explains what is missing" || bad "refusal message"
: > "$STATE/journal.txt"; echo "$(jl -30 $T)" >> "$STATE/journal.txt"; echo "$(jl 60 198.51.100.7)" >> "$STATE/journal.txt"; echo "$(jl 4 $T)" >> "$STATE/journal.txt"
tryconfirm && ok "ACCEPTED: tester public-key login 4 s after the rules, among noise" || bad "valid login refused: $(cat "$STATE/out")"
[ ! -f "$STATE/armed" ] && [ -s "$B/confirmed" ] && ok "timer disarmed and 'confirmed' recorded" || bad "state after accept"
calls | grep journalctl | head -1 | grep -q -- "-t sshd" && calls | grep journalctl | head -1 | grep -q -- "-o short-unix" && calls | grep journalctl | head -1 | grep -q -- "--since @$(cut -d. -f1 "$B/armed-at")" && ok "journal queried with microsecond format, sshd identifier, since the arming second" || bad "journal args"
# margin is configurable but never negative-by-accident; boundary just after
: > "$STATE/journal.txt"; jl 3.2 $T >> "$STATE/journal.txt"; tryconfirm && ok "login just after the margin (armed+3.2s) accepted" || bad "post-margin login"
# configuration problems refuse
: > "$STATE/journal.txt"; jl 60 $T >> "$STATE/journal.txt"
cp $BASE/media-test-ips.env "$W/ips.bak"
printf 'VIDFETCH_MEDIA_TEST_IPS=192.0.2.1/32\n' > $BASE/media-test-ips.env; tryconfirm && bad "placeholder list" || ok "refused: placeholder tester list"
printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.0/24\n' > $BASE/media-test-ips.env; tryconfirm && bad "/24 list" || ok "refused: tester list that is not /32 entries"
rm -f $BASE/media-test-ips.env; tryconfirm && bad "no list" || ok "refused: tester configuration missing"
cp "$W/ips.bak" $BASE/media-test-ips.env
printf 'VIDFETCH_MEDIA_TEST_IPS=198.51.100.7/32 203.0.113.9/32\n' > $BASE/media-test-ips.env; tryconfirm && ok "accepted: login from the second listed tester IP" || bad "multi-ip list"
cp "$W/ips.bak" $BASE/media-test-ips.env
# restore already started (even only waiting for the lock) => the window is over
touch "$STATE/armed"; rm -f "$B/confirmed"; date +%s.%N > "$B/restore-started"; bash $A/04-confirm.sh >/dev/null 2>&1 && bad "confirm after restore started" || ok "refused: the automatic restore already started"
rm -f "$B/restore-started"; rm -f "$STATE/armed"; rm -f "$B/confirmed"; bash $A/04-confirm.sh >/dev/null 2>&1 && bad "confirm without timer" || ok "refused: timer not armed"
rm -f "$B/armed-at"; touch "$STATE/armed"; bash $A/04-confirm.sh >/dev/null 2>&1 && bad "confirm without arming record" || ok "refused: rules not recorded as live"

# ================================================================ B. restore under partial failure
echo "# B. the restore completes even when parts of it fail, and from a half-applied state"
half_applied() { # what a killed 03/05 leaves behind
  reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files
  cp $BASE/ingress.nft.media-test $BASE/ingress.nft; ln -sfn Caddyfile.media-test $BASE/current
  printf '[Service]\nEnvironmentFile=%s/media-test-ips.env\n' $BASE > /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf; touch "$STATE/armed"; }
half_applied; S0=$(snap | grep -v -e media-test -e 'ingress.nft$' -e ' current ')
bash $B/restore-network.sh "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && [ "$(readlink $BASE/current)" = Caddyfile ] && [ ! -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && ok "from a half-applied state (file swapped, pointer moved, drop-in written): fully restored" || bad "half-applied restore rc=$rc"
calls | grep -q '^fw apply' && calls | grep -q 'systemctl daemon-reload' && calls | grep -q 'systemctl reload vidfetch-caddy' && ok "helper re-run, daemon reloaded, Caddy reloaded" || bad "restore calls"
[ -e "$B/restored" ] && [ -e "$B/restore-started" ] && ok "markers: restore-started and restored" || bad "markers"
half_applied; touch "$STATE/fw-fails"
bash $B/restore-network.sh "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && calls | grep -q '^nft --check' && calls | grep -q '^nft --file' && ok "firewall helper failing: saved table applied directly through nft (check, then atomic load)" || bad "fallback not used rc=$rc"
half_applied; touch "$STATE/fw-fails" "$STATE/nft-apply-fails"
bash $B/restore-network.sh "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(readlink $BASE/current)" = Caddyfile ] && [ ! -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && ok "firewall restore fully failing does NOT prevent the Caddy pointer and drop-in restore" || bad "independence rc=$rc"
[ ! -e "$B/restored" ] && [ -e "$B/restore-started" ] && grep -q "INCOMPLETE" "$STATE/out" && ok "incomplete restore: exit 1 (so systemd retries), no 'restored' marker, loud message" || bad "incomplete signalling"
half_applied; echo "table inet vidfetch_https_test_ingress { set testers4 {} }" > "$STATE/live-table"
bash $B/restore-network.sh "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && grep -q "tester set still present" "$STATE/out" && ok "verification catches testers4 still live even if every command 'succeeded'" || bad "verification rc=$rc"
half_applied; echo 1 > "$STATE/reload-fails"
bash $B/restore-network.sh "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(grep -c 'systemctl reload' "$STATE/calls.log")" = 2 ] && ok "one failed Caddy reload is retried" || bad "reload retry rc=$rc"
half_applied; echo 5 > "$STATE/reload-fails"; bash $B/restore-network.sh "$B" >/dev/null 2>&1; [ $? = 1 ] && ok "persistent reload failure is reported (exit 1)" || bad "reload failure"
half_applied; touch "$STATE/caddy-down"; bash $B/restore-network.sh "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && ! calls | grep -q 'systemctl reload' && ok "Caddy not running: no reload attempted, restore still complete" || bad "caddy down rc=$rc"
half_applied; date +%s.%N > "$B/confirmed"; : > "$STATE/calls.log"
bash $B/restore-network.sh "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && ! calls | grep -q '^fw ' && grep -q NEW-INGRESS $BASE/ingress.nft && [ ! -e "$B/restore-started" ] && ok "confirmed in the meantime: a restore that was waiting stands down" || bad "stand-down rc=$rc"
RESTORE_FORCE=1 bash $B/restore-network.sh "$B" >/dev/null 2>&1; grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "manual cancel (RESTORE_FORCE) restores despite 'confirmed'" || bad "force"
bash $B/restore-network.sh /nonexistent >/dev/null 2>&1; [ $? = 1 ] && ok "invalid backup refused" || bad "invalid backup"
half_applied; rm -f "$B/ingress-table.nft"; bash $B/restore-network.sh "$B" >/dev/null 2>&1; [ $? = 1 ] && ok "backup missing the saved table is refused before touching anything" || bad "incomplete backup"
grep -q NEW-INGRESS $BASE/ingress.nft && ok "...and nothing was changed" || bad "changed on refusal"

# ================================================================ C. concurrency
echo "# C. no concurrent Caddy/network changes during the restore window"
holder() { ( exec 9>"$W/lock"; flock 9; sleep "$1" ) & sleep 0.5; }
clean_armed() { reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files; bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "clean_armed: 03 failed"; }
# each script is otherwise perfectly valid: ONLY the held lock may stop it
reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files; : > "$STATE/calls.log"
holder 5; bash $A/03-network.sh open80 300 >/dev/null 2>&1 && bad "03 while lock held" || ok "03-network refuses while another operation holds the lock"
! calls | grep -q '^systemd-run' && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && [ ! -f "$STATE/armed" ] && ok "...and changed nothing (no timer, no ingress)" || bad "03 acted despite the lock"
wait; bash $A/03-network.sh open80 300 >/dev/null 2>&1 && ok "(control) the same 03 succeeds once the lock is free" || bad "control 03"
ARM=$(cat "$B/armed-at"); : > "$STATE/journal.txt"; printf '%s vps sshd[1]: Accepted publickey for debian from 203.0.113.9 port 5 ssh2: ED25519 SHA256:x\n' "$(awk -v t="$ARM" 'BEGIN{printf "%.6f", t+9}')" > "$STATE/journal.txt"
holder 5; bash $A/04-confirm.sh >/dev/null 2>&1 && bad "confirm while lock held" || ok "04-confirm refuses while another operation holds the lock (valid login present)"
[ -f "$STATE/armed" ] && [ ! -e "$B/confirmed" ] && ok "...timer still armed" || bad "confirm acted despite the lock"
wait; bash $A/04-confirm.sh >/dev/null 2>&1 && ok "(control) the same confirm succeeds once the lock is free" || bad "control confirm"
clean_armed; holder 5; bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 && bad "05 while lock held" || ok "05-caddy refuses while another operation holds the lock"
[ "$(readlink $BASE/current)" = Caddyfile ] && [ ! -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && ok "...pointer and drop-in untouched" || bad "05 acted despite the lock"
wait; bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 && ok "(control) the same 05 succeeds once the lock is free" || bad "control 05"
reset_state; mkfix; before=$(ls $W/bk | wc -l); holder 5; bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup while lock held" || ok "01-backup refuses while another operation holds the lock"
[ "$(ls $W/bk | wc -l)" = "$before" ] && ok "...no backup directory created" || bad "backup acted despite the lock"; wait
half_applied; holder 4; t0=$(date +%s)
bash $B/restore-network.sh "$B" >/dev/null 2>&1; rc=$?; t1=$(date +%s)
[ $rc = 0 ] && [ $((t1-t0)) -ge 3 ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "the restore WAITS for a running operation, then restores (waited $((t1-t0))s)" || bad "restore wait rc=$rc ($((t1-t0))s)"
wait
half_applied; holder 6; out=$(VM_RESTORE_LOCK_WAIT=1 bash $B/restore-network.sh "$B" 2>&1); rc=$?
[ $rc = 0 ] && echo "$out" | grep -q "WARNING: lock still busy" && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "a stuck lock never prevents the restore (warns, restores anyway)" || bad "stuck lock rc=$rc"
wait
reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files; touch "$STATE/fw-fails"; t0=$(date +%s)
VM_RESTORE_LOCK_WAIT=40 bash $A/03-network.sh open80 300 >/dev/null 2>&1; rc=$?; t1=$(date +%s)
[ $rc = 1 ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && [ ! -f "$STATE/armed" ] && ok "03: a failed apply restores the original ingress and disarms" || bad "03 failed-apply restore rc=$rc"
[ $((t1-t0)) -le 5 ] && ok "...IMMEDIATELY: the restore does not wait for the lock its own caller holds (took $((t1-t0))s)" || bad "failed-apply restore was delayed $((t1-t0))s by the caller's own lock"
half_applied; touch "$STATE/restoring"; bash $A/03-network.sh open80 300 >/dev/null 2>&1 && bad "03 while restore service active" || ok "03 refuses while the automatic restore service is running"; rm -f "$STATE/restoring"
half_applied; date +%s.%N > "$B/restore-started"; bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 && bad "05 after restore started" || ok "05 refuses once the automatic restore has started"
half_applied; date +%s.%N > "$B/confirmed"; bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 && bad "05 after confirm" || ok "05 refuses after the window was confirmed (new backup + new 03 needed)"
half_applied; cp /dev/null $BASE/dummy; bash $A/03-network.sh open80 300 >/dev/null 2>&1 && bad "03 over modified system" || ok "03 refuses to arm over a system that already holds media-test changes"
exit $fail
