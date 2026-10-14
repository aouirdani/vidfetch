#!/usr/bin/env bash
# Throwaway-container test (writes under /etc). The Caddy window: 05-caddy.sh runs only once the network window is
# confirmed, arms its own rollback timer before changing anything, never touches the network rules, and
# 05-confirm.sh disarms only after checking the real origin (here a stub answering per Caddy configuration).
# System tools are stubs that log their calls; real systemd + real Caddy are in caddy-window-systemd.test.sh.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
A=/r/deploy/ovh/media/admin; F=/r/deploy/ovh/tests/fixtures
W=$(mktemp -d); trap 'rm -rf "$W"; kill $(jobs -p) 2>/dev/null' EXIT
mkdir -p "$W/bin" "$W/bk" "$W/state" /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013
BASE=/etc/vidfetch/public-https-test; DROPIN=/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf
cat > "$W/bin/stub" <<'S'
#!/bin/sh
n=$(basename "$0"); echo "$n $*" >> "$STATE/calls.log"
case "$n" in
  systemctl) case "$1" in
      is-active) [ "$2" = --quiet ] && t=$3 || t=$2
        case "$t" in
          vidfetch-media-rollback.timer) [ -f "$STATE/armed" ];;
          vidfetch-caddy-rollback.timer) [ -f "$STATE/caddy-armed" ];;
          vidfetch-media-rollback.service) [ -f "$STATE/restoring" ];;
          vidfetch-caddy-rollback.service) [ -f "$STATE/caddy-restoring" ];;
          vidfetch-caddy.service) [ ! -f "$STATE/caddy-down" ];;
          *) true;; esac
        r=$?; [ "$2" = --quiet ] || { [ $r = 0 ] && echo active || echo inactive; }; exit $r ;;
      stop) case "$2" in vidfetch-caddy-rollback.timer) rm -f "$STATE/caddy-armed";; *) rm -f "$STATE/armed";; esac ;;
      reload) c=$(cat "$STATE/reload-fails" 2>/dev/null || echo 0); if [ "$c" -gt 0 ]; then echo $((c-1)) > "$STATE/reload-fails"; exit 1; fi
              if [ -f "$STATE/reload-kills" ]; then rm -f "$STATE/reload-kills"; touch "$STATE/caddy-down"; fi ;;
      start) [ -f "$STATE/start-fails" ] && exit 1; rm -f "$STATE/caddy-down" ;;
      daemon-reload) if [ -f "$STATE/daemon-reload-fails" ]; then rm -f "$STATE/daemon-reload-fails"; exit 1; fi ;;
      show) echo 4242 ;;
    esac ;;
  systemd-run)
    echo "  at arming: pointer=$(readlink "$BASE_FOR_FW/current") dropin=$([ -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && echo yes || echo no)" >> "$STATE/calls.log"
    [ -f "$STATE/systemd-run-fails" ] && exit 1
    case "$*" in *--unit=vidfetch-caddy-rollback*) touch "$STATE/caddy-armed";; *--unit=vidfetch-media-rollback*) touch "$STATE/armed";; esac ;;
  nft) case "$1" in --check|--file) exit 0;; esac
       if [ "$1 $2" = "list ruleset" ]; then echo "table inet x {}"; else cat "$STATE/live-table" 2>/dev/null || echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi ;;
  journalctl) cat "$STATE/journal.txt" 2>/dev/null ;;
  runuser) shift 3; exec "$@" ;;
  logger) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser journalctl; do ln -s stub "$W/bin/$n"; done
# firewall helper: the live table follows ingress.nft, as with the real helper
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"
if grep -q testers4 "$BASE_FOR_FW/ingress.nft"; then echo "table inet vidfetch_https_test_ingress { set testers4 {} }"; else echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi > "$STATE/live-table"
S
printf '#!/bin/sh\nexec python3 %s/origin-curl-stub.py "$@"\n' "$F" > "$W/curl-origin"
printf '#!/bin/sh\nexit 1\n' > "$W/caddy-invalid"
chmod +x "$W/fw" "$W/curl-origin" "$W/caddy-invalid"
. "$F/origin-tables.sh"
export STATE="$W/state" BASE_FOR_FW=$BASE PATH="$W/bin:$PATH" VM_BACKUPS="$W/bk" VM_FW="$W/fw" VM_CADDY=/bin/true VM_JOURNALCTL="$W/bin/journalctl" \
  VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_RESTORE_LOCK_WAIT=30 VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft" \
  VM_CURL="$W/curl-origin" ORIGIN_BASE=$BASE ORIGIN_TABLES="$W/origin"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
calls() { cat "$STATE/calls.log" 2>/dev/null; }

CAN1=CANARY-TURNSTILE-SECRET-1a2b; CAN2=CANARYHMACKEYCANARYHMACKEYCANARYHMACKE1; CAN3=CANARY-BCRYPT-HASH-9z
mkfix() {
  rm -rf /etc/vidfetch; mkdir -p $BASE /etc/systemd/system/vidfetch-caddy.service.d
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env
  printf 'VIDFETCH_ACCESS_SIGNING_KEY=%s\nVIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app\nTURNSTILE_SECRET_KEY=%s\n' $CAN2 $CAN1 > /etc/vidfetch/gateway.env
  echo '{"files":{"/etc/vidfetch/web.env":"abc"}}' > /etc/vidfetch/ci-web-test-guard.json
  chmod 600 /etc/vidfetch/web.env /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json
  echo ORIGINAL-INGRESS > $BASE/ingress.nft; echo CF-CADDY > $BASE/Caddyfile; echo BOOT > $BASE/Caddyfile.bootstrap; echo "basic_auth bcrypt x { u $CAN3 }" > $BASE/auth.caddy
  chmod 640 $BASE/auth.caddy; rm -f $BASE/current; ln -s Caddyfile $BASE/current
  printf '[Service]\nExecStart=/bin/true\n' > /etc/systemd/system/vidfetch-caddy.service
  printf '[Unit]\nRequires=x\n' > /etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf
  rm -f $DROPIN; echo web > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
}
stage_files() { printf 'NEW-INGRESS\n        tcp dport 80 accept\n        tcp dport 443 ip saddr @testers4 accept\n' > $BASE/ingress.nft.media-test
  printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > $BASE/media-test-ips.env
  printf 'import /etc/vidfetch/public-https-test/auth.caddy\nX-Robots-Tag "noindex, nofollow"\n' > $BASE/Caddyfile.media-test; }
reset_state() { rm -f "$STATE"/*; : > "$STATE/calls.log"; rm -rf "$W/origin"; origin_tables "$W/origin"; }
fresh() { reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1 || bad "setup: backup"; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files; }
# the network window as the operator left it on the VPS: 03 open80, new key login from the tester IP, 04-confirm
network_confirmed() {
  fresh; bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "setup: 03-network"
  printf '%s vps sshd-session[7]: Accepted publickey for debian from 203.0.113.9 port 50123 ssh2: ED25519 SHA256:x\n' "$(awk -v t="$(cat "$B/armed-at")" 'BEGIN{printf "%.6f", t+9}')" > "$STATE/journal.txt"
  bash $A/04-confirm.sh >/dev/null 2>&1 || bad "setup: 04-confirm"; : > "$STATE/calls.log"; : > "$STATE/curl.log"; }
switched() { network_confirmed; bash $A/05-caddy.sh --port80-verified-from-outside >"$STATE/out" 2>&1 || bad "setup: 05-caddy ($(tail -2 "$STATE/out" | tr '\n' ' '))"; : > "$STATE/calls.log"; : > "$STATE/curl.log"; }
net() { sha256sum < $BASE/ingress.nft; cat "$STATE/live-table" 2>/dev/null | sha256sum; ls "$B" | grep -xE 'armed-at|confirmed|restore-started|restored'; }
secrets() { find /etc/vidfetch -type f -name '*.env' -o -name '*guard*' | sort | xargs sha256sum; }
caddy_state() { echo "$(readlink $BASE/current) $([ -e $DROPIN ] && sha256sum < $DROPIN | cut -c1-16 || echo none)"; }
no_firewall_call() { ! calls | grep -qE '^(fw |nft --file|nft -f|systemd-run .*vidfetch-media-rollback)'; }
holder() { ( exec 9>"$W/lock"; flock 9; sleep "$1" ) & sleep 0.5; }
# refuse LABEL [command...]: 05-caddy.sh (default) refuses and changes nothing at all
armed_state() { ls "$STATE" | grep -xE 'armed|caddy-armed' | tr '\n' ' '; }
refuse05() { local label=$1; shift; local c0 n0 s0 a0 rc; c0=$(caddy_state); n0=$(net); s0=$(secrets); a0=$(armed_state); : > "$STATE/calls.log"
  bash $A/05-caddy.sh "${@:---port80-verified-from-outside}" >"$STATE/out" 2>&1; rc=$?
  if [ $rc != 0 ] && [ "$(caddy_state)" = "$c0" ] && [ "$(net)" = "$n0" ] && [ "$(secrets)" = "$s0" ] && [ "$(armed_state)" = "$a0" ] && ! calls | grep -qE '^systemd-run|^systemctl (daemon-reload|reload|start|stop|restart)' && no_firewall_call; then
    ok "05-caddy refuses: $label  [$(grep -m1 REFUSED "$STATE/out" | cut -c1-110)]"
  else bad "05-caddy: $label (rc=$rc, $(tail -2 "$STATE/out" | tr '\n' ' '))"; fi; }

echo "# 1. the dead end met on the VPS, and its resolution"
network_confirmed
[ -e "$B/confirmed" ] && [ ! -f "$STATE/armed" ] && grep -q testers4 "$STATE/live-table" && ok "(setup) network window confirmed: rules live, timer disarmed, as on the VPS" || bad "setup state"
out=$(bash $A/01-backup.sh 2>&1); [ $? != 0 ] && grep -q "No new backup is needed once 04-confirm.sh succeeded" <<< "$out" && grep -q "continue with 05-caddy.sh" <<< "$out" && ok "01-backup still refuses (not the original state) and now names the next step" || bad "01-backup message: $out"
out=$(bash $A/03-network.sh open80 300 2>&1); [ $? != 0 ] && ok "03-network still refuses to re-arm over live rules" || bad "03 re-armed"
n0=$(net); s0=$(secrets)
out=$(bash $A/05-caddy.sh --port80-verified-from-outside 2>&1); rc=$?
[ $rc = 0 ] && [ "$(readlink $BASE/current)" = Caddyfile.media-test ] && [ -f "$STATE/caddy-armed" ] && ok "05-caddy now proceeds from exactly that state, with the existing backup" || bad "05 from the VPS state rc=$rc: $out"
[ "$(net)" = "$n0" ] && no_firewall_call && ok "...without touching the network: ingress.nft, live table and network markers unchanged, no firewall call" || bad "network touched"
[ "$(secrets)" = "$s0" ] && ok "...environments and CI guard untouched" || bad "secrets touched"
echo "$out" | grep -qE 'CANARY' && bad "05 printed a secret" || ok "...and printed no secret"

echo "# 2. preconditions: every refusal changes nothing"
network_confirmed
refuse05 "without the port-80 flag" --nope
refuse05 "timer shorter than 120 s" --port80-verified-from-outside 60
refuse05 "timer longer than 1800 s" --port80-verified-from-outside 4000
refuse05 "non-numeric timer" --port80-verified-from-outside 9x
holder 4; refuse05 "while another media-test operation holds the lock"; wait
fresh; bash $A/03-network.sh open80 300 >/dev/null 2>&1
refuse05 "inside the network window (network timer armed, not confirmed: the old order)"
fresh; refuse05 "network rules never applied"
network_confirmed; rm -f "$B/confirmed"; refuse05 "network window not confirmed"
network_confirmed; date +%s.%N > "$B/restore-started"; refuse05 "network restore started"
network_confirmed; date +%s.%N > "$B/restored"; refuse05 "network restore done"
network_confirmed; touch "$STATE/restoring"; refuse05 "network restore service running"; rm -f "$STATE/restoring"
network_confirmed; echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > "$STATE/live-table"; refuse05 "live nft table without the tester set"
network_confirmed; echo '# edited' >> $BASE/ingress.nft; refuse05 "live ingress.nft differs from the staged one"
network_confirmed; sed -i '/dport 80/d' $BASE/ingress.nft $BASE/ingress.nft.media-test; refuse05 "port 80 closed (closed80): HTTP-01 impossible"
network_confirmed; ln -sfn Caddyfile.bootstrap $BASE/current; refuse05 "Caddy pointer moved since the backup"
network_confirmed; printf '[Service]\n' > $DROPIN; refuse05 "media-test drop-in already present"
network_confirmed; touch "$STATE/caddy-down"; refuse05 "Caddy not running"
network_confirmed; touch "$STATE/caddy-armed"; refuse05 "Caddy rollback timer already armed"; rm -f "$STATE/caddy-armed"
network_confirmed; touch "$STATE/caddy-restoring"; refuse05 "Caddy restore running"
network_confirmed; rm -f $BASE/Caddyfile.media-test; refuse05 "staged config missing"
network_confirmed; sed -i '/auth.caddy/d' $BASE/Caddyfile.media-test; refuse05 "staged config without the Basic Auth import"
network_confirmed; sed -i '/X-Robots-Tag/d' $BASE/Caddyfile.media-test; refuse05 "staged config without noindex"
network_confirmed; printf 'VIDFETCH_MEDIA_TEST_IPS=192.0.2.1/32\n' > $BASE/media-test-ips.env; refuse05 "placeholder tester list"
network_confirmed; printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.0/24\n' > $BASE/media-test-ips.env; refuse05 "tester list that is not /32"
network_confirmed; VM_CADDY="$W/caddy-invalid" refuse05 "caddy validate failing on the staged config"
network_confirmed; sed -i 's#^vidfetch.app GET / 401 .*#vidfetch.app GET / 200 x-robots-tag: noindex#' "$W/origin/Caddyfile"; refuse05 "apex already unprotected BEFORE the change (GET / 200)"
grep -q "apex GET /: HTTP 200, expected 401" "$STATE/out" && ok "...and the failing route is named" || bad "pre-check output: $(cat "$STATE/out")"
network_confirmed; rm -f "$W/origin/Caddyfile"; refuse05 "apex unreachable through loopback (no answer)"
network_confirmed; rm -f "$B/toolkit-revision"; refuse05 "backup from an older toolkit"
network_confirmed; echo Caddyfile.media-test > "$B/current.target"; ln -sfn Caddyfile.media-test $BASE/current; refuse05 "backup whose recorded pointer is the media-test config (restore impossible)"
network_confirmed; touch "$STATE/systemd-run-fails"; c0=$(caddy_state); bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1
[ $? != 0 ] && [ "$(caddy_state)" = "$c0" ] && ok "05-caddy refuses: the rollback timer could not be armed (nothing changed)" || bad "systemd-run failure"

echo "# 3. arming and switching"
network_confirmed; n0=$(net); s0=$(secrets); : > "$STATE/calls.log"
out=$(bash $A/05-caddy.sh --port80-verified-from-outside 2>&1); rc=$?
[ $rc = 0 ] && ok "05-caddy succeeds" || bad "05 rc=$rc: $out"
c=$(calls); arm=$(echo "$c" | grep -n '^systemd-run .*vidfetch-caddy-rollback' | cut -d: -f1); dr=$(echo "$c" | grep -n '^systemctl daemon-reload' | cut -d: -f1 | head -1); rl=$(echo "$c" | grep -n '^systemctl reload vidfetch-caddy' | cut -d: -f1 | head -1)
[ -n "$arm" ] && [ -n "$dr" ] && [ -n "$rl" ] && [ "$arm" -lt "$dr" ] && [ "$dr" -lt "$rl" ] && ok "rollback timer armed BEFORE the drop-in, daemon-reload and reload" || bad "ordering arm=$arm daemon-reload=$dr reload=$rl"
echo "$c" | grep -q '  at arming: pointer=Caddyfile dropin=no' && ok "at arming time the pointer and drop-in were still the original ones" || bad "state at arming: $(echo "$c" | grep 'at arming')"
echo "$c" | grep '^systemd-run' | grep -q -- "--on-active=900s .*$B/restore-caddy.sh $B\$" && echo "$c" | grep '^systemd-run' | grep -q -- '-p Restart=on-failure' && ok "timer: 900 s by default, retries on failure, runs restore-caddy.sh from the backup" || bad "systemd-run args: $(echo "$c" | grep '^systemd-run')"
[ "$(stat -c '%a %U' "$B/restore-caddy.sh")" = "700 root" ] && cmp -s "$B/restore-caddy.sh" $A/restore-caddy.sh && ok "restore-caddy.sh copied into the root-only backup (0700), identical to the toolkit's" || bad "restore copy"
[ "$(readlink $BASE/current)" = Caddyfile.media-test ] && [ "$(cat $DROPIN)" = "$(printf '[Service]\nEnvironmentFile=%s/media-test-ips.env' $BASE)" ] && [ "$(stat -c %a $DROPIN)" = 644 ] && ok "pointer on the staged config; drop-in exact, 0644" || bad "switch result"
[ -s "$B/caddy-armed-at" ] && ok "arming recorded" || bad "caddy-armed-at"
[ "$(net)" = "$n0" ] && no_firewall_call && ! echo "$c" | grep -q '^systemctl stop vidfetch-media-rollback' && ok "network untouched: same ingress, same live table, network still confirmed, no firewall or network-timer call" || bad "network changed"
[ "$(secrets)" = "$s0" ] && ok "environments and CI guard untouched" || bad "secrets changed"
! echo "$c" | grep -qE '^systemctl (restart|start) ' && ok "no restart: certificates and connections kept (reload only)" || bad "restart/start called"
grep -q -- '--resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/' "$STATE/curl.log" && ! grep -qE -- '(^| )(-k|--insecure)( |$)' "$STATE/curl.log" && ok "apex pre-check through loopback under the public name, strict TLS (no -k)" || bad "curl args: $(head -2 "$STATE/curl.log")"
network_confirmed; bash $A/05-caddy.sh --port80-verified-from-outside 600 >/dev/null 2>&1; calls | grep '^systemd-run' | grep -q -- '--on-active=600s' && ok "custom duration (600 s) passed to the timer" || bad "custom duration"

echo "# 4. failures during the switch restore Caddy at once, never the network"
network_confirmed; n0=$(net); echo 1 > "$STATE/reload-fails"
bash $A/05-caddy.sh --port80-verified-from-outside >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -f "$STATE/caddy-armed" ] && [ -e "$B/caddy-restored" ] && ok "reload refused by Caddy: original pointer back, drop-in removed, timer disarmed, exit 1" || bad "reload failure rc=$rc state=$(caddy_state)"
[ "$(net)" = "$n0" ] && no_firewall_call && ok "...network untouched" || bad "network touched on reload failure"
network_confirmed; echo 9 > "$STATE/reload-fails"
bash $A/05-caddy.sh --port80-verified-from-outside >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ -f "$STATE/caddy-armed" ] && [ ! -e "$B/caddy-restored" ] && grep -q "stays armed" "$STATE/out" && ok "reload failing persistently: files restored, restore reported incomplete, timer LEFT armed to retry" || bad "persistent reload failure rc=$rc state=$(caddy_state) armed=$([ -f "$STATE/caddy-armed" ] && echo y)"
network_confirmed; n0=$(net); touch "$STATE/daemon-reload-fails"
bash $A/05-caddy.sh --port80-verified-from-outside >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -f "$STATE/caddy-armed" ] && [ -e "$B/caddy-restored" ] && [ "$(net)" = "$n0" ] && grep -q "daemon-reload FAILED" "$STATE/out" && ok "daemon-reload failing after the drop-in was written: restored at once, timer disarmed, network untouched" || bad "daemon-reload failure rc=$rc state=$(caddy_state)"
network_confirmed; touch "$STATE/reload-kills"
bash $A/05-caddy.sh --port80-verified-from-outside >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -f "$STATE/caddy-down" ] && calls | grep -q '^systemctl start vidfetch-caddy.service' && ok "Caddy down after the reload: restored and started again on the original configuration" || bad "caddy-down handling rc=$rc"

echo "# 5. 05-confirm.sh: only on proof from the real origin"
refuse_confirm() { local label=$1; shift; local c0 n0 rc; c0=$(caddy_state); n0=$(net)
  bash $A/05-confirm.sh "${@:---external-checks-passed}" >"$STATE/out" 2>&1; rc=$?
  if [ $rc != 0 ] && [ ! -e "$B/caddy-confirmed" ] && [ "$(caddy_state)" = "$c0" ] && [ "$(net)" = "$n0" ]; then ok "05-confirm refuses: $label  [$(grep -m1 -E 'REFUSED|  (apex|dl)' "$STATE/out" | cut -c1-100)]"
  else bad "05-confirm: $label (rc=$rc: $(tail -3 "$STATE/out" | tr '\n' ' '))"; fi; }
switched
refuse_confirm "without the flag recording the tester and 4G checks" --yes
[ -f "$STATE/caddy-armed" ] && ok "...timer still armed" || bad "timer disarmed by a refused confirm"
sed -i '/^dl.vidfetch.app/d' "$W/origin/Caddyfile.media-test"; refuse_confirm "dl certificate not issued or not trusted (no HTTPS answer)"
grep -q "no HTTPS answer with a trusted certificate" "$STATE/out" && ok "...and says the certificate is missing" || bad "certificate message"
switched; sed -i 's#^dl.vidfetch.app GET /api/fetch-info 403#dl.vidfetch.app GET /api/fetch-info 200#' "$W/origin/Caddyfile.media-test"; refuse_confirm "dl lets a non-tester reach a gateway route"
switched; sed -i 's#|referrer-policy: no-referrer##' "$W/origin/Caddyfile.media-test"; refuse_confirm "dl without Referrer-Policy no-referrer"
switched; sed -i 's#^vidfetch.app GET / 401 .*#vidfetch.app GET / 200 x-robots-tag: noindex#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex without Basic Auth"
switched; sed -i 's#^\(vidfetch.app GET /fr/ 401\) .*#\1 x-robots-tag: noindex#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex 401 without a Basic challenge"
switched; sed -i 's#^\(vidfetch.app GET /api/download 503\) .*#\1 x-other: 1#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex media route without noindex"
switched; sed -i 's#^vidfetch.app POST /api/download-access 401#vidfetch.app POST /api/download-access 200#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex /api/download-access reachable without Basic Auth"
switched; sed -i 's#^vidfetch.app GET /download-helper 503#vidfetch.app GET /download-helper 200#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex download helper open"
switched; sed -i 's#^vidfetch.app GET /sitemap.xml 404#vidfetch.app GET /sitemap.xml 200#' "$W/origin/Caddyfile.media-test"; refuse_confirm "apex sitemap published"
switched; echo '# extra' >> $DROPIN; refuse_confirm "drop-in not the expected one"
switched; ln -sfn Caddyfile $BASE/current; refuse_confirm "pointer not on the staged config"
switched; touch "$STATE/caddy-down"; refuse_confirm "Caddy not active"
switched; echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > "$STATE/live-table"; refuse_confirm "network rules changed meanwhile (tester set gone)"
switched; rm -f "$STATE/caddy-armed"; refuse_confirm "rollback timer gone (reboot): nothing is confirmed blindly"
grep -q "run 05-cancel.sh, then 05-caddy.sh again" "$STATE/out" && ok "...and says how to start the window again" || bad "reboot message"
switched; date +%s.%N > "$B/caddy-restore-started"; refuse_confirm "Caddy rollback already started"
switched; holder 4; refuse_confirm "while another operation holds the lock"; wait
switched; n0=$(net); s0=$(secrets)
out=$(bash $A/05-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && [ -s "$B/caddy-confirmed" ] && [ ! -f "$STATE/caddy-armed" ] && ok "all origin checks pass: timer disarmed, confirmation recorded" || bad "confirm rc=$rc: $out"
[ "$(caddy_state)" != "Caddyfile none" ] && [ "$(readlink $BASE/current)" = Caddyfile.media-test ] && [ "$(net)" = "$n0" ] && [ "$(secrets)" = "$s0" ] && ok "...Caddy stays on the media-test config; network, environments and guard unchanged" || bad "state after confirm"
for r in 'dl.vidfetch.app:443:127.0.0.1 https://dl.vidfetch.app/api/fetch-info' 'vidfetch.app:443:127.0.0.1 https://vidfetch.app/api/download-access' 'vidfetch.app:443:127.0.0.1 https://vidfetch.app/sitemap.xml'; do grep -q -- "--resolve $r" "$STATE/curl.log" || bad "route not probed: $r"; done
! grep -qE -- '(^| )(-k|--insecure)( |$)' "$STATE/curl.log" && [ "$(grep -c . "$STATE/curl.log")" -ge 13 ] && ok "dl and apex routes probed through loopback under their public names, strict TLS" || bad "probe set: $(wc -l < "$STATE/curl.log") calls"
echo "$out" | grep -qE 'CANARY' && bad "confirm printed a secret" || ok "confirm printed no secret"
bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; [ $? = 0 ] && [ "$(readlink $BASE/current)" = Caddyfile.media-test ] && [ ! -e "$B/caddy-restore-started" ] && ok "a late rollback (timer that was already firing) stands down after the confirmation" || bad "late restore after confirm"

echo "# 6. restore-caddy.sh, as run by the timer"
switched; n0=$(net); s0=$(secrets)
bash "$B/restore-caddy.sh" "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ -e "$B/caddy-restored" ] && ok "timer fired: original pointer, no drop-in, 'caddy-restored' recorded" || bad "restore rc=$rc: $(cat "$STATE/out")"
calls | grep -q '^systemctl daemon-reload' && calls | grep -q '^systemctl reload vidfetch-caddy.service' && ok "...daemon-reload then Caddy reload" || bad "restore calls"
[ "$(net)" = "$n0" ] && no_firewall_call && [ -e "$B/confirmed" ] && ok "...the confirmed network rules stay (no firewall call, network still confirmed)" || bad "restore touched the network"
[ "$(secrets)" = "$s0" ] && ok "...environments and guard untouched" || bad "restore touched secrets"
bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1 && [ "$(caddy_state)" = "Caddyfile none" ] && ok "running it again is harmless (idempotent)" || bad "second restore"
refuse_confirm "after the rollback ran"
switched; touch "$STATE/caddy-down"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && calls | grep -q '^systemctl reset-failed vidfetch-caddy.service' && calls | grep -q '^systemctl start vidfetch-caddy.service' && [ ! -f "$STATE/caddy-down" ] && ok "Caddy down: started again on the original configuration" || bad "start path rc=$rc"
switched; touch "$STATE/caddy-down" "$STATE/start-fails"; bash "$B/restore-caddy.sh" "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -e "$B/caddy-restored" ] && grep -q INCOMPLETE "$STATE/out" && ok "Caddy cannot start: files still restored, exit 1 so systemd retries, no 'restored' marker" || bad "start failure rc=$rc"
switched; echo 1 > "$STATE/reload-fails"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(grep -c '^systemctl reload' "$STATE/calls.log")" = 2 ] && ok "one failed reload is retried" || bad "reload retry rc=$rc"
switched; echo 9 > "$STATE/reload-fails"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; [ $? = 1 ] && [ "$(caddy_state)" = "Caddyfile none" ] && ok "persistent reload failure: exit 1, pointer and drop-in restored anyway" || bad "persistent reload failure"
switched; date +%s.%N > "$B/caddy-confirmed"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; [ $? = 0 ] && [ "$(readlink $BASE/current)" = Caddyfile.media-test ] && ok "confirmed in the meantime: stands down" || bad "stand-down"
RESTORE_FORCE=1 bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; [ "$(caddy_state)" = "Caddyfile none" ] && ok "RESTORE_FORCE restores despite the confirmation (05-cancel.sh)" || bad "force"
switched; holder 4; t0=$(date +%s); bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?; t1=$(date +%s); wait
[ $rc = 0 ] && [ $((t1-t0)) -ge 3 ] && [ "$(caddy_state)" = "Caddyfile none" ] && ok "waits for a running operation, then restores (waited $((t1-t0))s)" || bad "lock wait rc=$rc"
switched; holder 6; out=$(VM_RESTORE_LOCK_WAIT=1 bash "$B/restore-caddy.sh" "$B" 2>&1); rc=$?; wait
[ $rc = 0 ] && grep -q "lock still busy" <<< "$out" && [ "$(caddy_state)" = "Caddyfile none" ] && ok "a stuck lock never prevents the rollback (warns, restores anyway)" || bad "stuck lock rc=$rc"
switched; echo "$BASE/Caddyfile" > "$B/current.target"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; [ $? = 0 ] && [ "$(readlink $BASE/current)" = "$BASE/Caddyfile" ] && ok "an absolute recorded pointer inside the Caddy directory is restored as recorded" || bad "absolute target"
for t in '../../etc/passwd' '/etc/passwd' 'Caddyfile.media-test' 'sub/Caddyfile' '.hidden' 'missing-file' ''; do
  switched; printf '%s\n' "$t" > "$B/current.target"; c0=$(caddy_state)
  bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
  [ $rc = 1 ] && [ "$(caddy_state)" = "$c0" ] && ! calls | grep -q '^systemctl' && [ ! -e "$B/caddy-restore-started" ] && ok "unexpected recorded pointer '$t': refused before touching anything" || bad "recorded pointer '$t' accepted (rc=$rc)"
done
switched; rm -f $DROPIN; ln -s /etc/vidfetch/web.env $DROPIN; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
[ $rc = 1 ] && [ -L $DROPIN ] && [ -s /etc/vidfetch/web.env ] && ok "a drop-in replaced by a symlink is not removed (and its target is intact): reported" || bad "symlink drop-in rc=$rc"
rm -f $DROPIN
bash "$B/restore-caddy.sh" /nonexistent >/dev/null 2>&1; [ $? = 1 ] && ok "invalid backup directory refused" || bad "invalid backup"

echo "# 7. 05-cancel.sh and the network scripts during the Caddy window"
switched; n0=$(net); bash $A/05-cancel.sh >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -f "$STATE/caddy-armed" ] && [ "$(net)" = "$n0" ] && ok "05-cancel: Caddy restored, timer disarmed, network rules kept" || bad "05-cancel rc=$rc"
bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1 && [ "$(readlink $BASE/current)" = Caddyfile.media-test ] && [ ! -e "$B/caddy-restored" ] && ok "...and a new Caddy window can be opened at once (markers of the previous one cleared)" || bad "re-arm after cancel"
bash $A/05-confirm.sh --external-checks-passed >/dev/null 2>&1; bash $A/05-cancel.sh >/dev/null 2>&1; [ "$(caddy_state)" = "Caddyfile none" ] && [ ! -e "$B/caddy-confirmed" ] && ok "05-cancel also reverts a confirmed Caddy window" || bad "cancel after confirm"
switched; echo 9 > "$STATE/reload-fails"; bash $A/05-cancel.sh >"$STATE/out" 2>&1; [ $? != 0 ] && [ -f "$STATE/caddy-armed" ] && ok "05-cancel with a failing restore keeps the rollback timer armed" || bad "cancel failure"
switched; bash $A/01-backup.sh >/dev/null 2>&1 && bad "backup during the Caddy window" || ok "01-backup refuses during the Caddy window"
bash $A/03-network.sh open80 300 >/dev/null 2>&1 && bad "03 during the Caddy window" || ok "03-network refuses during the Caddy window"
bash $A/04-confirm.sh >/dev/null 2>&1 && bad "04-confirm during the Caddy window" || ok "04-confirm has nothing to confirm (network timer not armed)"
bash $A/04-cancel.sh >/dev/null 2>&1; [ "$(caddy_state)" = "Caddyfile none" ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "04-cancel (full network restore) also restores Caddy" || bad "04-cancel during the Caddy window"
bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1 && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "...and the Caddy timer firing afterwards is harmless (exit 0, network not re-touched)" || bad "late Caddy restore after 04-cancel"
refuse05 "after 04-cancel (network window over)"

echo "# 8. preflight shows where the windows stand"
network_confirmed
cat > "$W/bin/curl" <<'C'
#!/bin/sh
exit 7
C
chmod +x "$W/bin/curl"
out=$(bash $A/00-preflight.sh 2>&1)
echo "$out" | grep -q "vidfetch-caddy-rollback *timer inactive" && echo "$out" | grep -q "next step is 05-caddy.sh (no new backup)" && ok "preflight: network confirmed, Caddy original, next step 05-caddy.sh" || bad "preflight: $(echo "$out" | grep -A3 'media-test windows')"
bash $A/05-caddy.sh --port80-verified-from-outside >/dev/null 2>&1; out=$(bash $A/00-preflight.sh 2>&1)
echo "$out" | grep -q "vidfetch-caddy-rollback *timer active" && echo "$out" | grep -q "caddy-armed-at" && ! echo "$out" | grep -q "next step is 05-caddy.sh" && ok "preflight: Caddy window armed" || bad "preflight armed: $(echo "$out" | grep -A3 'media-test windows')"
echo "$out" | grep -qE 'CANARY' && bad "preflight printed a secret" || ok "preflight printed no secret"
exit $fail
