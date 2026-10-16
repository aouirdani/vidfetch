#!/usr/bin/env bash
# Throwaway-container test (writes under /etc). The public launch window: 05-caddy.sh --public switches the apex to
# Caddyfile.public with the same rollback timer, 05-confirm.sh checks the site as a search engine sees it before
# installing the public CI profile, and every rollback path (timer, 05-cancel, 04-cancel, restore-full) leaves
# Caddy and the CI profile in agreement. System tools are stubs that log their calls; the origin is a stub that
# answers per Caddy configuration (fixtures/). Real Caddy: caddy-gating/ and caddy-window-systemd.test.sh.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
F=/r/deploy/ovh/tests/fixtures
W=$(mktemp -d); trap 'rm -rf "$W"; kill $(jobs -p) 2>/dev/null' EXIT
# The toolkit as it sits on the VPS: admin/ next to Caddyfile.public and promote.py (send-to-vps.sh layout).
mkdir -p "$W/tk" && cp -R /r/deploy/ovh/media/admin "$W/tk/admin" && cp /r/deploy/ovh/media/Caddyfile.public /r/deploy/ovh/ci/promote.py "$W/tk/"
A=$W/tk/admin
mkdir -p "$W/bin" "$W/bk" "$W/state" "$W/libexec/vidfetch-ci" /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013 /opt/vidfetch-ci-web
BASE=/etc/vidfetch/public-https-test; DROPIN=/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf; PROFILE=/etc/vidfetch/ci-media-test-profile.json
PUBLIC_JSON='{"profile":"public","apex":"public-indexable","dl":"testers-only"}'; MEDIA_JSON='{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}'
DL_JSON='{"profile":"public-downloads","apex":"public-indexable","dl":"public"}'
cat > "$W/bin/stub" <<'S'
#!/bin/sh
n=$(basename "$0"); echo "$n $*" >> "$STATE/calls.log"
case "$n" in
  systemctl) case "$1" in
      is-active) [ "$2" = --quiet ] && t=$3 || t=$2
        case "$t" in
          vidfetch-media-rollback.timer) [ -f "$STATE/armed" ];;
          vidfetch-caddy-rollback.timer) [ -f "$STATE/caddy-armed" ];;
          vidfetch-media-rollback.service|vidfetch-caddy-rollback.service) false;;
          vidfetch-caddy.service) [ ! -f "$STATE/caddy-down" ];;
          *) true;; esac
        r=$?; [ "$2" = --quiet ] || { [ $r = 0 ] && echo active || echo inactive; }; exit $r ;;
      stop) case "$2" in vidfetch-caddy-rollback.timer) rm -f "$STATE/caddy-armed";; *) rm -f "$STATE/armed";; esac ;;
      reload) c=$(cat "$STATE/reload-fails" 2>/dev/null || echo 0); if [ "$c" -gt 0 ]; then echo $((c-1)) > "$STATE/reload-fails"; exit 1; fi ;;
      start) rm -f "$STATE/caddy-down" ;;
      show) echo 4242 ;;
    esac ;;
  systemd-run)
    echo "  at arming: pointer=$(readlink "$BASE_FOR_FW/current") dropin=$([ -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && echo yes || echo no) profile=$([ -e /etc/vidfetch/ci-media-test-profile.json ] && echo present || echo absent)" >> "$STATE/calls.log"
    case "$*" in *--unit=vidfetch-caddy-rollback*) touch "$STATE/caddy-armed";; *--unit=vidfetch-media-rollback*) touch "$STATE/armed";; esac ;;
  nft) case "$1" in --check|--file) exit 0;; esac
       if [ "$1 $2" = "list ruleset" ]; then echo "table inet x {}"; else cat "$STATE/live-table" 2>/dev/null || echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi ;;
  journalctl) cat "$STATE/journal.txt" 2>/dev/null ;;
  runuser) shift 3; exec "$@" ;;
  logger) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser journalctl; do ln -s stub "$W/bin/$n"; done
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"
if grep -q testers4 "$BASE_FOR_FW/ingress.nft"; then echo "table inet vidfetch_https_test_ingress { set testers4 {} }"; else echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi > "$STATE/live-table"
S
printf '#!/bin/sh\nexec python3 %s/origin-curl-stub.py "$@"\n' "$F" > "$W/curl-origin"
chmod +x "$W/fw" "$W/curl-origin"
# The CI helper installed on the VPS before 09-ci-helper.sh install: the REAL promote.py of commit 88fbe237, the very
# bytes found on the VPS on 14 October (sha256 d977b793...). It predates every CI profile: its status has no "profile".
OLD_HELPER=$F/promote-88fbe237.py.fixture; OLD_SHA=d977b793313773f70a9984791fb35f7efe49e7f36dac820e168b13854f4683c5
. "$F/origin-tables.sh"
export STATE="$W/state" BASE_FOR_FW=$BASE PATH="$W/bin:$PATH" VM_BACKUPS="$W/bk" VM_FW="$W/fw" VM_CADDY=/bin/true VM_JOURNALCTL="$W/bin/journalctl" \
  VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_RESTORE_LOCK_WAIT=30 VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft" \
  VM_CURL="$W/curl-origin" ORIGIN_BASE=$BASE ORIGIN_TABLES="$W/origin" VM_CI_HELPER="$W/libexec/vidfetch-ci/promote.py" VM_SKIP_ROOT=1
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
calls() { cat "$STATE/calls.log" 2>/dev/null; }
CAN1=CANARY-TURNSTILE-SECRET-1a2b; CAN2=CANARYHMACKEYCANARYHMACKEYCANARYHMACKE1
mkfix() {
  rm -rf /etc/vidfetch; mkdir -p $BASE /etc/systemd/system/vidfetch-caddy.service.d
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env
  printf 'VIDFETCH_ACCESS_SIGNING_KEY=%s\nTURNSTILE_SECRET_KEY=%s\n' $CAN2 $CAN1 > /etc/vidfetch/gateway.env
  echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json; chmod 600 /etc/vidfetch/*.env /etc/vidfetch/ci-web-test-guard.json
  echo ORIGINAL-INGRESS > $BASE/ingress.nft; echo CF-CADDY > $BASE/Caddyfile; echo BOOT > $BASE/Caddyfile.bootstrap; echo "basic_auth x" > $BASE/auth.caddy
  rm -f $BASE/current; ln -s Caddyfile $BASE/current
  printf '[Service]\nExecStart=/bin/true\n' > /etc/systemd/system/vidfetch-caddy.service
  printf '[Unit]\nRequires=x\n' > /etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf
  rm -f $DROPIN; echo web > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
  install -m 0755 "$W/tk/promote.py" "$VM_CI_HELPER"; cp /r/deploy/ovh/ci/release-lib.py "$W/libexec/vidfetch-ci/"
}
stage_files() { printf 'NEW-INGRESS\n        tcp dport 80 accept\n        tcp dport 443 ip saddr @testers4 accept\n' > $BASE/ingress.nft.media-test
  printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > $BASE/media-test-ips.env
  cp /r/deploy/ovh/media/Caddyfile.test-only $BASE/Caddyfile.media-test; }
reset_state() { rm -f "$STATE"/*; : > "$STATE/calls.log"; rm -rf "$W/origin"; origin_tables "$W/origin"; }
# the state reached on the VPS: backup taken, files staged, network window confirmed by a real-format key login
network_confirmed() {
  reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1 || bad "setup: backup"; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files
  bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "setup: 03-network"
  printf '%s vps sshd-session[7]: Accepted publickey for debian from 203.0.113.9 port 50123 ssh2: ED25519 SHA256:x\n' "$(awk -v t="$(cat "$B/armed-at")" 'BEGIN{printf "%.6f", t+9}')" > "$STATE/journal.txt"
  bash $A/04-confirm.sh >/dev/null 2>&1 || bad "setup: 04-confirm"; : > "$STATE/calls.log"; : > "$STATE/curl.log"; }
switched() { network_confirmed; bash $A/05-caddy.sh --port80-verified-from-outside --public >"$STATE/out" 2>&1 || bad "setup: 05-caddy --public ($(tail -2 "$STATE/out" | tr '\n' ' '))"; : > "$STATE/calls.log"; : > "$STATE/curl.log"; }
confirmed() { switched; bash $A/05-confirm.sh --external-checks-passed >"$STATE/out" 2>&1 || bad "setup: 05-confirm public ($(tail -3 "$STATE/out" | tr '\n' ' '))"; : > "$STATE/calls.log"; }
net() { sha256sum < $BASE/ingress.nft; cat "$STATE/live-table" 2>/dev/null | sha256sum; ls "$B" | grep -xE 'armed-at|confirmed|restore-started|restored'; }
secrets() { sha256sum /etc/vidfetch/*.env /etc/vidfetch/ci-web-test-guard.json; }
profile() { if [ -e $PROFILE ]; then case "$(cat $PROFILE)" in "$PUBLIC_JSON") echo public;; "$MEDIA_JSON") echo media-test;; *) echo other;; esac; else echo closed; fi; }
state() { echo "$(readlink $BASE/current) dropin=$([ -e $DROPIN ] && echo yes || echo no) ci=$(profile)"; }
no_network_call() { ! calls | grep -qE '^(fw |nft --file|nft -f|systemd-run .*vidfetch-media-rollback)'; }
no_other_service() { ! calls | grep -E '^systemctl (restart|start|stop|reload|enable|disable) ' | grep -vE 'vidfetch-caddy\.service|vidfetch-(caddy|media)-rollback\.timer' | grep -q .; }
refuse05() { local label=$1; shift; local s0 n0 rc; s0=$(state); n0=$(net); : > "$STATE/calls.log"
  bash $A/05-caddy.sh --port80-verified-from-outside --public "$@" >"$STATE/out" 2>&1; rc=$?
  if [ $rc != 0 ] && [ "$(state)" = "$s0" ] && [ "$(net)" = "$n0" ] && [ ! -f "$STATE/caddy-armed" ] && ! calls | grep -qE '^systemd-run|^systemctl (daemon-reload|reload)'; then
    ok "05-caddy --public refuses: $label  [$(grep -m1 REFUSED "$STATE/out" | cut -c1-110)]"
  else bad "05-caddy --public: $label (rc=$rc, $(tail -2 "$STATE/out" | tr '\n' ' '))"; fi; }
refuse_confirm() { local label=$1 s0; s0=$(state)
  bash $A/05-confirm.sh --external-checks-passed >"$STATE/out" 2>&1; rc=$?
  if [ $rc != 0 ] && [ "$(state)" = "$s0" ] && [ "$(profile)" = closed ] && [ -f "$STATE/caddy-armed" ] && [ ! -e "$B/caddy-confirmed" ]; then
    ok "05-confirm (public) refuses: $label  [$(grep -m1 -E '^  ' "$STATE/out" | cut -c1-100)]"
  else bad "05-confirm (public): $label (rc=$rc, $(tail -3 "$STATE/out" | tr '\n' ' '))"; fi; }

echo "# 1. opening the public window from the VPS state"
network_confirmed
cp "$VM_CI_HELPER" "$W/new-helper"; install -m 0755 "$OLD_HELPER" "$VM_CI_HELPER"
refuse05 "the installed CI helper does not know the public profile yet (09-ci-helper.sh install first)"
install -m 0755 "$W/new-helper" "$VM_CI_HELPER"
printf '%s\n' "$MEDIA_JSON" > $PROFILE; refuse05 "a media-test CI profile is installed"; rm -f $PROFILE
printf '%s\n' '{"profile":"other"}' > $PROFILE; refuse05 "an unknown CI profile is installed"; rm -f $PROFILE
printf '%s\n' "$PUBLIC_JSON" > $PROFILE; refuse05 "a public CI profile is already installed while Caddy is still original"; rm -f $PROFILE
mv "$W/tk/Caddyfile.public" "$W/public.bak"; refuse05 "Caddyfile.public missing next to the toolkit"
sed 's/@notTester not remote_ip {$VIDFETCH_MEDIA_TEST_IPS:192.0.2.1\/32}/@notTester not remote_ip 0.0.0.0\/0/' "$W/public.bak" > "$W/tk/Caddyfile.public"; refuse05 "Caddyfile.public whose dl block would open dl to everyone"
sed '/handle @outsideCloudflare {/,+2d' "$W/public.bak" > "$W/tk/Caddyfile.public"; refuse05 "Caddyfile.public without the Cloudflare-only origin lock"
sed 's#@media path /api/fetch-info /api/download /api/queue /auth/transfer /download-helper#@media path /api/queue#' "$W/public.bak" > "$W/tk/Caddyfile.public"; refuse05 "Caddyfile.public that would open media routes"
cp "$W/public.bak" "$W/tk/Caddyfile.public"
[ ! -e $BASE/Caddyfile.public ] && ok "refused runs staged nothing in $BASE" || bad "Caddyfile.public staged by a refused run"
fresh_armed() { reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files; bash $A/03-network.sh open80 300 >/dev/null 2>&1; }
fresh_armed; refuse05 "inside the network window (network timer armed)"
network_confirmed; n0=$(net); s0=$(secrets)
out=$(bash $A/05-caddy.sh --port80-verified-from-outside --public 2>&1); rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile.public dropin=yes ci=closed" ] && [ -f "$STATE/caddy-armed" ] && ok "05-caddy --public: pointer on Caddyfile.public, drop-in written, timer armed, CI profile still closed" || bad "switch rc=$rc state=$(state): $out"
c=$(calls); arm=$(echo "$c" | grep -n '^systemd-run .*vidfetch-caddy-rollback' | cut -d: -f1); rl=$(echo "$c" | grep -n '^systemctl reload vidfetch-caddy' | cut -d: -f1 | head -1)
[ -n "$arm" ] && [ -n "$rl" ] && [ "$arm" -lt "$rl" ] && echo "$c" | grep -q '  at arming: pointer=Caddyfile dropin=no profile=absent' && ok "rollback timer armed BEFORE any change (pointer, drop-in and profile still original at arming)" || bad "ordering"
cmp -s $BASE/Caddyfile.public "$W/tk/Caddyfile.public" && [ "$(stat -c '%a %U' $BASE/Caddyfile.public)" = "644 root" ] && ok "Caddyfile.public staged byte-identical to the toolkit's, root 0644" || bad "staged public file"
[ "$(net)" = "$n0" ] && no_network_call && ok "network untouched: ingress.nft, live table, network markers; no firewall call" || bad "network touched"
no_other_service && ok "no other service restarted, started, stopped or reloaded (only Caddy reload and the rollback timer)" || bad "other services: $(calls | grep -E '^systemctl (restart|start|stop|reload)' | head -3)"
[ "$(secrets)" = "$s0" ] && grep -q '^VIDFETCH_CONNECTION_READY=0$' /etc/vidfetch/web.env && ok "environments untouched, ready stays 0" || bad "env changed"

echo "# 2. 05-confirm.sh in the public window: nothing is confirmed unless the site is public, indexable and closed"
switched
sed -i 's#^vidfetch.app GET / 200 BODY=home#vidfetch.app GET / 200 x-robots-tag: noindex|BODY=home#' "$W/origin/Caddyfile.public"; refuse_confirm "a sitemap page sends X-Robots-Tag noindex"
switched; sed -i 's#content="index, follow"#content="noindex, follow"#' "$W/origin/bodies/fr"; refuse_confirm "a sitemap page has a noindex robots meta"
switched; sed -i 's#href="https://vidfetch.app/fr/"#href="https://vidfetch.app/"#' "$W/origin/bodies/fr"; refuse_confirm "a sitemap page canonicalises elsewhere"
switched; sed -i 's#^vidfetch.app GET /fr/ 200#vidfetch.app GET /fr/ 401 www-authenticate: Basic realm="x"#' "$W/origin/Caddyfile.public"; refuse_confirm "a sitemap page still asks for Basic Auth"
switched; sed -i 's#^vidfetch.app GET /sitemap.xml 200 BODY=sitemap#vidfetch.app GET /sitemap.xml 404#' "$W/origin/Caddyfile.public"; refuse_confirm "sitemap.xml not served"
switched; printf 'User-agent: *\nDisallow: /\nSitemap: https://vidfetch.app/sitemap.xml\n' > "$W/origin/bodies/robots"; refuse_confirm "robots.txt disallows everything"
switched; printf 'User-agent: *\nAllow: /\n' > "$W/origin/bodies/robots"; refuse_confirm "robots.txt does not publish the sitemap"
switched; sed -i 's#^vidfetch.app GET /fr 308 location: /fr/#vidfetch.app GET /fr 308 location: /fr#' "$W/origin/Caddyfile.public"; refuse_confirm "the /fr redirect loops (frontend fix not deployed)"
switched; sed -i 's#^vidfetch.app GET /api/download 503#vidfetch.app GET /api/download 200#' "$W/origin/Caddyfile.public"; refuse_confirm "a media route is open on the apex"
switched; sed -i 's#^vidfetch.app POST /api/download-access 503#vidfetch.app POST /api/download-access 200#' "$W/origin/Caddyfile.public"; refuse_confirm "a download grant is issued (ready=1?)"
switched; sed -i 's#^vidfetch.app GET /auth/admission 404#vidfetch.app GET /auth/admission 200#' "$W/origin/Caddyfile.public"; refuse_confirm "an auth endpoint is exposed"
switched; sed -i 's#^\(vidfetch.app GET /api/fetch-info 503\) .*#\1 x-other: 1#' "$W/origin/Caddyfile.public"; refuse_confirm "an API route lost its noindex header"
switched; sed -i 's#"available":false#"available":true#' "$W/origin/bodies/health"; refuse_confirm "the frontend announces downloads (ready=1)"
switched; sed -i 's#^dl.vidfetch.app GET /api/fetch-info 403#dl.vidfetch.app GET /api/fetch-info 200#' "$W/origin/Caddyfile.public"; refuse_confirm "dl lets a non-tester reach the gateway"
switched; sed -i '/^dl.vidfetch.app/d' "$W/origin/Caddyfile.public"; refuse_confirm "no trusted dl certificate yet"
switched; VM_PROFILE=/nonexistent-dir/ci-media-test-profile.json bash $A/05-confirm.sh --external-checks-passed >"$STATE/out" 2>&1; rc=$?
[ $rc != 0 ] && [ -f "$STATE/caddy-armed" ] && [ ! -e "$B/caddy-confirmed" ] && grep -q "could not install the public CI profile" "$STATE/out" && ok "the CI profile cannot be written: refused, timer still armed, nothing confirmed" || bad "profile write failure rc=$rc: $(tail -2 "$STATE/out")"
switched; n0=$(net); out=$(bash $A/05-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile.public dropin=yes ci=public" ] && [ -s "$B/caddy-confirmed" ] && [ ! -f "$STATE/caddy-armed" ] && ok "every check passes: public CI profile installed, confirmation recorded, timer disarmed" || bad "confirm rc=$rc: $out"
echo "$out" | grep -q "sitemap: 3 URL(s) checked" && echo "$out" | grep -q "downloads: closed" && echo "$out" | grep -q "dl: trusted certificate" && ok "the confirmation reports each check group (sitemap, robots, redirects, closed downloads, dl)" || bad "confirm output: $out"
[ "$(stat -c '%a %U' $PROFILE)" = "644 root" ] && [ "$(cat $PROFILE)" = "$PUBLIC_JSON" ] && ok "CI profile: exactly what the promoter accepts, root 0644" || bad "profile file"
! grep -qE -- '(^| )(-k|--insecure)( |$)' "$STATE/curl.log" && grep -q -- '--resolve vidfetch.app:443:127.0.0.1 https://vidfetch.app/ar/%D8%A7%D9%84' "$STATE/curl.log" && ok "every sitemap URL was probed through loopback under its public name, strict TLS" || bad "probes"
[ "$(net)" = "$n0" ] && no_network_call && no_other_service && ok "confirmation touched no network rule and no other service" || bad "confirm side effects"

echo "# 3. every rollback path leaves Caddy and the CI profile in agreement"
switched; n0=$(net); bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile dropin=no ci=closed" ] && [ "$(net)" = "$n0" ] && ok "timer fires before confirmation: original Caddy, closed CI profile, network untouched" || bad "timer before confirm rc=$rc state=$(state)"
switched; printf '%s\n' "$PUBLIC_JSON" > $PROFILE; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile dropin=no ci=closed" ] && ok "failure between 'profile installed' and 'confirmation recorded': the timer still restores both (profile removed)" || bad "partial confirm rc=$rc state=$(state)"
switched; printf '%s\n' "$PUBLIC_JSON" > $PROFILE; date +%s.%N > "$B/caddy-confirmed"; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1
[ "$(state)" = "Caddyfile.public dropin=yes ci=public" ] && ok "failure between 'confirmation recorded' and 'timer stopped': the late timer stands down, public Caddy + public profile" || bad "late timer state=$(state)"
confirmed; bash $A/05-cancel.sh >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile dropin=no ci=closed" ] && [ ! -f "$STATE/caddy-armed" ] && ok "05-cancel after confirmation: original Caddy and closed CI profile" || bad "05-cancel rc=$rc state=$(state)"
switched; printf '%s\n' "$MEDIA_JSON" > $PROFILE; bash "$B/restore-caddy.sh" "$B" >/dev/null 2>&1
[ "$(profile)" = media-test ] && ok "a media-test CI profile is never removed by the Caddy rollback" || bad "media-test profile removed"
switched; rm -f $PROFILE; mkdir $PROFILE; bash "$B/restore-caddy.sh" "$B" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && [ -d $PROFILE ] && [ "$(readlink $BASE/current)" = Caddyfile ] && ok "an unexpected directory at the profile path is left alone (only the exact public file is ever removed)" || bad "profile dir rc=$rc"
rmdir $PROFILE
confirmed; bash $A/04-cancel.sh >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile dropin=no ci=closed" ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "04-cancel after a confirmed public window: original network, original Caddy, closed CI profile" || bad "04-cancel rc=$rc state=$(state)"
confirmed; out=$(bash "$B/restore-full.sh" "$B" --yes 2>&1); rc=$?
[ $rc = 0 ] && [ "$(state)" = "Caddyfile dropin=no ci=closed" ] && [ ! -e $BASE/Caddyfile.public ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "restore-full after a confirmed public window: everything back, Caddyfile.public removed by name, closed CI profile" || bad "restore-full rc=$rc state=$(state): $out"
network_confirmed; bash $A/06-profile.sh install-public >/dev/null 2>&1 && bad "install-public with Caddy original" || ok "06-profile install-public refuses while Caddy is not public"
switched; bash $A/06-profile.sh install-public >/dev/null 2>&1 && bad "install-public before confirmation" || ok "06-profile install-public refuses before the public window is confirmed"
bash $A/06-profile.sh install >/dev/null 2>&1 && bad "media-test profile on public Caddy" || ok "06-profile install (media-test) refuses while Caddy serves the public configuration"
confirmed; rm -f $PROFILE; bash $A/06-profile.sh install-public >/dev/null 2>&1 && [ "$(profile)" = public ] && ok "06-profile install-public repairs a missing profile once the public window is confirmed" || bad "repair"

echo "# 4. 09-ci-helper.sh: the only CI change, reversible"
mkfix; ln -sfn /usr/local/bin/python3 /usr/bin/python3 2>/dev/null; echo '{"release":"test"}' > /tmp/manifest.json
install -m 0755 "$OLD_HELPER" "$VM_CI_HELPER"; before=$(sha256sum < "$VM_CI_HELPER")
[ "$(sha256sum "$VM_CI_HELPER" | cut -c1-64)" = "$OLD_SHA" ] && ok "the old helper under test is byte-identical to the one installed on the VPS (d977b793...)" || bad "old helper fixture differs from the VPS one"
st=$("$VM_CI_HELPER" status 2>&1); python3 -c 'import json, sys; d = json.loads(sys.argv[1]); assert "profile" not in d and d["release"] == "test"' "$st" && ok "the real old helper runs here and its status has no profile field: $st" || bad "old helper status: $st"
out=$(bash $A/09-ci-helper.sh check 2>&1); [ $? = 0 ] && echo "$out" | grep -q "differs" && [ "$(sha256sum < "$VM_CI_HELPER")" = "$before" ] && ok "check is read-only and reports the difference" || bad "check: $out"
out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc = 0 ] && cmp -s "$VM_CI_HELPER" "$W/tk/promote.py" && [ "$(stat -c %a "$VM_CI_HELPER")" = 755 ] && echo "$out" | grep -q '"profile": "closed"' && ok "install: new helper in place (0755), its status runs and still reports the closed profile" || bad "install rc=$rc: $out"
BK=$(readlink -f "$W/bk/vidfetch-ci-helper-latest"); [ "$(sha256sum < "$BK/promote.py")" = "$before" ] && ok "the previous helper is kept in a dated backup" || bad "helper backup"
[ -f "$W/libexec/vidfetch-ci/release-lib.py" ] || bad "release-lib.py touched"
printf '%s\n' "$PUBLIC_JSON" > $PROFILE; out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && cmp -s "$VM_CI_HELPER" "$W/tk/promote.py" && grep -q "CI profile in force is 'public' and the helper saved in .* does not define it: nothing changed; revert the public window first" <<< "$out" \
  && ok "rollback to 88fbe237 refused under the public profile (it does not define it): nothing changed" || bad "rollback to 88fbe237 under public rc=$rc: $out"
printf '%s\n' "$DL_JSON" > $PROFILE; out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && cmp -s "$VM_CI_HELPER" "$W/tk/promote.py" && grep -q "CI profile in force is 'public-downloads' and the helper saved in .* does not define it: nothing changed; close downloads first (11-downloads.sh close)" <<< "$out" \
  && ok "rollback to 88fbe237 refused under the public-downloads profile: nothing changed" || bad "rollback to 88fbe237 under public-downloads rc=$rc: $out"
rm -f $PROFILE; out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc = 0 ] && [ "$(sha256sum "$VM_CI_HELPER" | cut -c1-64)" = "$OLD_SHA" ] && echo "$out" | grep -q "previous CI helper restored from .* (sha256 ${OLD_SHA:0:16})" && ok "rollback restores the real 88fbe237 helper, prints its sha256, and exits 0 although its status has no profile field" || bad "rollback rc=$rc: $out"
printf '#!/bin/sh\necho not-json\n' > "$W/broken-helper"; BKL=$(readlink -f "$W/bk/vidfetch-ci-helper-latest"); cp "$BKL/promote.py" "$W/keep-old"; install -m 0755 "$W/broken-helper" "$BKL/promote.py"
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && [ "$(sha256sum "$VM_CI_HELPER" | cut -c1-64)" = "$OLD_SHA" ] && grep -q "the helper that was in place is back" <<< "$out" \
  && ok "a restored helper whose status is not valid JSON is refused and the helper that was in place is put back" || bad "broken restored helper rc=$rc: $out"
install -m 0755 "$W/keep-old" "$BKL/promote.py"; install -m 0755 "$OLD_HELPER" "$VM_CI_HELPER"
printf '%s\n' '{"profile":"something-else"}' > $PROFILE; out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc != 0 ] && [ "$(sha256sum < "$VM_CI_HELPER")" = "$before" ] && echo "$out" | grep -q "previous helper put back" && ok "a new helper failing its status check is replaced by the previous one at once" || bad "failed install rc=$rc: $out"
rm -f $PROFILE
sed '/^PUBLIC_PROFILE = /d' "$W/tk/promote.py" > "$W/tk/promote.py.x"; mv "$W/tk/promote.py" "$W/promote.good"; mv "$W/tk/promote.py.x" "$W/tk/promote.py"
bash $A/09-ci-helper.sh install >/dev/null 2>&1 && bad "helper without public profile installed" || ok "a promote.py without the public profile is refused before anything is changed"
mv "$W/promote.good" "$W/tk/promote.py"

echo "# 4b. rollback follows the profile in force: the real 00732df2 helper (on the VPS since 14 October) and the new one"
mkfix; echo '{"release":"test"}' > /tmp/manifest.json
PREV_HELPER=$F/promote-00732df2.py.fixture; PREV_SHA=00732df27734e00782ae80420f6da807b78cdeecbe4779ff0e30d8e107edda27
NEW_SHA=$(sha256sum "$W/tk/promote.py" | cut -c1-64)
hsha() { sha256sum "$VM_CI_HELPER" | cut -c1-64; }
latest() { readlink -f "$W/bk/vidfetch-ci-helper-latest"; }
[ "$(sha256sum "$PREV_HELPER" | cut -c1-64)" = "$PREV_SHA" ] && ok "the 00732df2 fixture is byte-identical to the helper installed on the VPS (00732df2...)" || bad "00732df2 fixture differs"
python3 - "$A/09-ci-helper.sh" "$A/common.sh" "$W/tk/promote.py" "$PREV_HELPER" <<'PY' && ok "rollback looks for exactly the profiles the scripts write; the new helper defines all three, 00732df2 all but public-downloads" || bad "profile lines, common.sh and helpers disagree"
import ast, json, re, sys
script, common, new, prev = (open(p).read() for p in sys.argv[1:5])
lines = dict(re.findall(r'^ +([a-z-]+)\) line="([A-Z_]+ = \{.*\})" ;;$', script, re.M))
names = {'media-test': 'MEDIA_PROFILE_JSON', 'public': 'PUBLIC_PROFILE_JSON', 'public-downloads': 'PUBLIC_DL_PROFILE_JSON'}
assert set(lines) == set(names), lines
for name, var in names.items():
    written = json.loads(re.search(r"^%s='(.*)'$" % var, common, re.M).group(1))
    assert ast.literal_eval(lines[name].split(' = ', 1)[1]) == written, name
    assert lines[name] in new.splitlines(), name
    assert (lines[name] in prev.splitlines()) == (name != 'public-downloads'), name
PY
# today's VPS: helper 00732df2, public profile
install -m 0755 "$PREV_HELPER" "$VM_CI_HELPER"; printf '%s\n' "$PUBLIC_JSON" > $PROFILE
out=$(bash $A/09-ci-helper.sh check 2>&1); rc=$?
[ $rc = 0 ] && grep -q differs <<< "$out" && grep -q "CI profile in force: public$" <<< "$out" && [ "$(hsha)" = "$PREV_SHA" ] \
  && ok "check from today's VPS state (helper 00732df2, profile public): read-only, reports the difference and the profile" || bad "check rc=$rc: $out"
out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc = 0 ] && [ "$(hsha)" = "$NEW_SHA" ] && grep -q '"profile": "public"' <<< "$out" && [ "$(cat $PROFILE)" = "$PUBLIC_JSON" ] && [ "$(sha256sum "$(latest)/promote.py" | cut -c1-64)" = "$PREV_SHA" ] \
  && ok "install under the public profile: new helper in place, its status reports public, 00732df2 kept in the backup, profile untouched" || bad "install under public rc=$rc: $out"
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc = 0 ] && [ "$(hsha)" = "$PREV_SHA" ] && grep -q "previous CI helper restored from .* (sha256 ${PREV_SHA:0:16}); CI profile in force: public; status: .*\"profile\": \"public\"" <<< "$out" && [ "$(cat $PROFILE)" = "$PUBLIC_JSON" ] \
  && ok "rollback to 00732df2 under the public profile: restored, and its own status reports public" || bad "rollback to 00732df2 under public rc=$rc: $out"
# downloads opened later: 00732df2 does not know public-downloads
bash $A/09-ci-helper.sh install >/dev/null 2>&1 && [ "$(hsha)" = "$NEW_SHA" ] || bad "reinstall under public"
printf '%s\n' "$DL_JSON" > $PROFILE; BK=$(latest)
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && [ "$(hsha)" = "$NEW_SHA" ] && [ ! -e "$BK/promote.py.replaced" ] && grep -q "CI profile in force is 'public-downloads' and the helper saved in .* does not define it: nothing changed; close downloads first (11-downloads.sh close)" <<< "$out" \
  && ok "rollback to 00732df2 refused under public-downloads (it does not define it): nothing changed" || bad "rollback to 00732df2 under public-downloads rc=$rc: $out"
install -m 0755 "$PREV_HELPER" "$VM_CI_HELPER"
out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc = 0 ] && [ "$(hsha)" = "$NEW_SHA" ] && grep -q '"profile": "public-downloads"' <<< "$out" \
  && ok "install under the public-downloads profile: accepted, the new helper's status reports public-downloads" || bad "install under public-downloads rc=$rc: $out"
# a later helper while downloads are open: the saved one defines public-downloads, so rollback is possible
cp "$W/tk/promote.py" "$W/promote.current"; printf '# a later revision\n' >> "$W/tk/promote.py"
out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc = 0 ] && cmp -s "$VM_CI_HELPER" "$W/tk/promote.py" && grep -q '"profile": "public-downloads"' <<< "$out" && ok "a later helper installs while downloads are open" || bad "later helper under public-downloads rc=$rc: $out"
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc = 0 ] && [ "$(hsha)" = "$NEW_SHA" ] && grep -q "CI profile in force: public-downloads; status: .*\"profile\": \"public-downloads\"" <<< "$out" \
  && ok "rollback under public-downloads to a helper that defines it: restored, its status reports public-downloads" || bad "rollback to a public-downloads helper rc=$rc: $out"
mv "$W/promote.current" "$W/tk/promote.py"
# the saved helper defines the profile but does not apply it (reads another profile file): put back the helper in place
printf '%s\n' "$PUBLIC_JSON" > $PROFILE
sed "s#^PROFILE = Path('/etc/vidfetch/ci-media-test-profile.json')#PROFILE = Path('/etc/vidfetch/elsewhere.json')#" "$PREV_HELPER" > "$W/blind-helper"
grep -q "^PROFILE = Path('/etc/vidfetch/elsewhere.json')" "$W/blind-helper" || bad "blind helper fixture"
BK=$(latest); cp "$BK/promote.py" "$W/keep-bk"; install -m 0755 "$W/blind-helper" "$BK/promote.py"
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && [ "$(hsha)" = "$NEW_SHA" ] && grep -q "status reports profile 'closed', in force: 'public'" <<< "$out" && grep -q "the restored helper does not apply the 'public' profile .*the helper that was in place is back" <<< "$out" \
  && ok "a restored helper whose own status reports another profile (closed under public) is refused; the helper in place is put back" || bad "blind restored helper rc=$rc: $out"
install -m 0755 "$W/keep-bk" "$BK/promote.py"
# install: a new helper that would apply another profile than the one in force is refused, the previous one put back
install -m 0755 "$PREV_HELPER" "$VM_CI_HELPER"; cp "$W/tk/promote.py" "$W/promote.current"
sed "s#^PROFILE = Path('/etc/vidfetch/ci-media-test-profile.json')#PROFILE = Path('/etc/vidfetch/elsewhere.json')#" "$W/promote.current" > "$W/tk/promote.py"
out=$(bash $A/09-ci-helper.sh install 2>&1); rc=$?
[ $rc != 0 ] && [ "$(hsha)" = "$PREV_SHA" ] && grep -q "status reports profile 'closed', in force: 'public'" <<< "$out" && grep -q "CI profile in force: public): previous helper put back" <<< "$out" \
  && ok "install refused when the new helper would apply another profile than the one in force: 00732df2 put back" || bad "install of a blind helper rc=$rc: $out"
mv "$W/promote.current" "$W/tk/promote.py"
# an unrecognised profile file: no helper is known to apply it
printf '%s\n' '{"profile": "public"}' > $PROFILE
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && [ "$(hsha)" = "$PREV_SHA" ] && grep -q "CI profile in force is 'unknown' .*nothing changed; inspect the CI profile file first" <<< "$out" \
  && ok "rollback refused under an unrecognised profile file: nothing changed" || bad "rollback under an unknown profile rc=$rc: $out"
rm -f $PROFILE; mv "$W/bk/vidfetch-ci-helper-latest" "$W/latest.keep"
out=$(bash $A/09-ci-helper.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && [ "$(hsha)" = "$PREV_SHA" ] && grep -q "no CI helper backup" <<< "$out" && ok "rollback without any backup refuses: nothing changed" || bad "rollback without backup rc=$rc: $out"
mv "$W/latest.keep" "$W/bk/vidfetch-ci-helper-latest"
exit $fail
