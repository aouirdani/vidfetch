#!/usr/bin/env bash
# Throwaway-container test (writes under /etc). Opening dl.vidfetch.app to the public (10-dl-public.sh), its
# confirmation and rollback (to the PUBLIC apex, never the old Basic Auth state), and 11-downloads.sh which moves
# ready and the CI profile together. System tools are stubs that log their calls; the live nft table follows the
# applied file; the origin is a stub answering per Caddy configuration and ready (fixtures/). Real kernel nft:
# nft-behaviour/; real Caddy: caddy-gating/; real systemd + Caddy: caddy-window-systemd.test.sh.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
F=/r/deploy/ovh/tests/fixtures
W=$(mktemp -d); trap 'rm -rf "$W"; kill $(jobs -p) 2>/dev/null' EXIT
mkdir -p "$W/tk" && cp -R /r/deploy/ovh/media/admin "$W/tk/admin" && cp /r/deploy/ovh/media/Caddyfile.public /r/deploy/ovh/media/Caddyfile.public-dl /r/deploy/ovh/media/public-dl-ingress.py /r/deploy/ovh/ci/promote.py "$W/tk/"
A=$W/tk/admin
mkdir -p "$W/bin" "$W/bk" "$W/state" "$W/libexec/vidfetch-ci" /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013
BASE=/etc/vidfetch/public-https-test; DROPIN=/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf; PROFILE=/etc/vidfetch/ci-media-test-profile.json
PUBLIC_JSON='{"profile":"public","apex":"public-indexable","dl":"testers-only"}'; DL_JSON='{"profile":"public-downloads","apex":"public-indexable","dl":"public"}'
cat > "$W/bin/stub" <<'S'
#!/bin/sh
n=$(basename "$0"); echo "$n $*" >> "$STATE/calls.log"
case "$n" in
  systemctl) case "$1" in
      is-active) [ "$2" = --quiet ] && t=$3 || t=$2
        case "$t" in
          vidfetch-media-rollback.timer) [ -f "$STATE/armed" ];;
          vidfetch-caddy-rollback.timer) [ -f "$STATE/caddy-armed" ];;
          vidfetch-dl-rollback.timer) [ -f "$STATE/dl-armed" ];;
          vidfetch-dl-rollback.service) [ -f "$STATE/dl-restoring" ];;
          vidfetch-media-rollback.service|vidfetch-caddy-rollback.service) false;;
          vidfetch-caddy.service) [ ! -f "$STATE/caddy-down" ];;
          *) true;; esac
        r=$?; [ "$2" = --quiet ] || { [ $r = 0 ] && echo active || echo inactive; }; exit $r ;;
      stop) case "$2" in vidfetch-caddy-rollback.timer) rm -f "$STATE/caddy-armed";; vidfetch-dl-rollback.timer) rm -f "$STATE/dl-armed";; *) rm -f "$STATE/armed";; esac ;;
      reload) c=$(cat "$STATE/reload-fails" 2>/dev/null || echo 0); if [ "$c" -gt 0 ]; then echo $((c-1)) > "$STATE/reload-fails"; exit 1; fi
              if [ -f "$STATE/reload-kills" ]; then rm -f "$STATE/reload-kills"; touch "$STATE/caddy-down"; fi ;;
      start) rm -f "$STATE/caddy-down" ;;
      restart) [ -f "$STATE/restart-fails" ] && exit 1; true ;;
      show) case "$2 $4" in
          "vidfetch-gateway.service ExecStart") echo "{ path=/usr/bin/node ; argv[]=/usr/bin/node $RUN_DIR/gateway.cjs ; ignore_errors=no }" ;;
          "vidfetch.service ExecStart") echo "{ path=/usr/bin/node ; argv[]=/usr/bin/node $RUN_DIR/engine.cjs ; ignore_errors=no }" ;;
          "vidfetch-gateway.service EnvironmentFiles") echo "/etc/vidfetch/gateway.env (ignore_errors=no)" ;;
          *) echo 4242 ;; esac ;;
    esac ;;
  systemd-run)
    echo "  at arming: pointer=$(readlink "$BASE_FOR_FW/current") dl-rules=$(grep -c dl_conn4 "$BASE_FOR_FW/ingress.nft")" >> "$STATE/calls.log"
    case "$*" in *--unit=vidfetch-caddy-rollback*) touch "$STATE/caddy-armed";; *--unit=vidfetch-media-rollback*) touch "$STATE/armed";; *--unit=vidfetch-dl-rollback*) touch "$STATE/dl-armed";; esac ;;
  nft) case "$1" in
      --check) exit 0 ;;
      --file) [ -f "$STATE/nft-apply-fails" ] && exit 1; grep -v '^delete table' "$2" > "$STATE/live-table"; exit 0 ;;
    esac
    if [ "$1 $2" = "list ruleset" ]; then echo "table inet x {}"; else cat "$STATE/live-table" 2>/dev/null || echo "table inet vidfetch_https_test_ingress { set cloudflare4 {} }"; fi ;;
  journalctl) cat "$STATE/journal.txt" 2>/dev/null ;;
  runuser) shift 3; exec "$@" ;;
  logger) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser journalctl; do ln -s stub "$W/bin/$n"; done
# firewall helper: the live table becomes what ingress.nft says (as with the real helper)
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"; [ -f "$STATE/fw-fails" ] && exit 1
cp "$BASE_FOR_FW/ingress.nft" "$STATE/live-table"
S
printf '#!/bin/sh\nexec python3 %s/origin-curl-stub.py "$@"\n' "$F" > "$W/curl-origin"
chmod +x "$W/fw" "$W/curl-origin"
. "$F/origin-tables.sh"
export STATE="$W/state" BASE_FOR_FW=$BASE PATH="$W/bin:$PATH" VM_BACKUPS="$W/bk" VM_FW="$W/fw" VM_CADDY=/bin/true VM_JOURNALCTL="$W/bin/journalctl" \
  VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_RESTORE_LOCK_WAIT=30 VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft" \
  VM_CURL="$W/curl-origin" ORIGIN_BASE=$BASE ORIGIN_TABLES="$W/origin" VM_CI_HELPER="$W/libexec/vidfetch-ci/promote.py" VM_SKIP_ROOT=1 \
  VM_WEB_ENV=/etc/vidfetch/web.env VM_MANIFEST="$W/release/manifest.json" RUN_DIR="$W/run"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
calls() { cat "$STATE/calls.log" 2>/dev/null; }
CAN1=CANARY-TURNSTILE-SECRET-1a2b; CAN2=CANARYHMACKEYCANARYHMACKEYCANARYHMACKE1
# the open80 ingress as rendered for the recette (tester 203.0.113.9, port 80 open)
python3 - "$W/open80.nft" <<'PY'
import importlib.util, ipaddress, json, sys
spec = importlib.util.spec_from_file_location('ri', '/r/deploy/ovh/media/render-ingress.py'); r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
ranges = json.load(open('/r/deploy/ovh/public-test/cloudflare-ranges.json'))['ranges']
open(sys.argv[1], 'w').write(r.render([ipaddress.ip_network('203.0.113.9/32')], ranges['4'], ranges['6'], True))
PY
mkfix() {
  rm -rf /etc/vidfetch; mkdir -p $BASE /etc/systemd/system/vidfetch-caddy.service.d
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env
  printf 'VIDFETCH_ACCESS_SIGNING_KEY=%s\nTURNSTILE_SECRET_KEY=%s\n' $CAN2 $CAN1 > /etc/vidfetch/gateway.env
  echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json; chmod 600 /etc/vidfetch/*.env /etc/vidfetch/ci-web-test-guard.json
  echo ORIGINAL-INGRESS > $BASE/ingress.nft; echo CF-CADDY > $BASE/Caddyfile; echo BOOT > $BASE/Caddyfile.bootstrap; echo "basic_auth x" > $BASE/auth.caddy
  rm -f $BASE/current; ln -s Caddyfile $BASE/current
  printf '[Service]\nExecStart=/bin/true\n' > /etc/systemd/system/vidfetch-caddy.service
  printf '[Unit]\nRequires=x\n' > /etc/systemd/system/vidfetch-caddy.service.d/ci-frontend.conf; rm -f $DROPIN
  echo web > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
  install -m 0755 "$W/tk/promote.py" "$VM_CI_HELPER"; cp /r/deploy/ovh/ci/release-lib.py "$W/libexec/vidfetch-ci/"
  rm -rf "$W/run" "$W/release"; mkdir -p "$W/run" "$W/release/backend"
  printf 'engine' > "$W/run/engine.cjs"; printf 'gateway' > "$W/run/gateway.cjs"; cp "$W/run/gateway.cjs" "$W/release/backend/vidfetch-gateway.cjs"
  python3 -c 'import hashlib,json,sys; d=sys.argv[1]; h=lambda f: hashlib.sha256(open(f,"rb").read()).hexdigest()
json.dump({"schema":1,"release":"a"*40,"platform":"linux-x64","files":{"backend/vidfetch-ovh.cjs":h(d+"/run/engine.cjs"),"backend/vidfetch-gateway.cjs":h(d+"/run/gateway.cjs")}},open(d+"/release/manifest.json","w"))' "$W"
  printf '[Service]\nExecStart=/usr/bin/node %s/run/gateway.cjs\n' "$W" > /etc/systemd/system/vidfetch-gateway.service; chmod 644 /etc/systemd/system/vidfetch-gateway.service
}
stage_files() { cp "$W/open80.nft" $BASE/ingress.nft.media-test; printf 'VIDFETCH_MEDIA_TEST_IPS=203.0.113.9/32\n' > $BASE/media-test-ips.env
  cp /r/deploy/ovh/media/Caddyfile.test-only $BASE/Caddyfile.media-test; }
reset_state() { rm -f "$STATE"/*; : > "$STATE/calls.log"; rm -rf "$W/origin"; origin_tables "$W/origin"; rm -rf "$W"/bk/vidfetch-public-dl-*; }
login_after() { printf '%s vps sshd-session[7]: Accepted %s for debian from %s port 50123 ssh2: ED25519 SHA256:x\n' "$(awk -v t="$(cat "$1")" -v d="$2" 'BEGIN{printf "%.6f", t+d}')" "${4:-publickey}" "${3:-198.51.100.20}" > "$STATE/journal.txt"; }
# the state on the VPS today: network window confirmed, public apex confirmed (CI profile public), ready=0, dl tester-only
public_apex() {
  reset_state; mkfix; bash $A/01-backup.sh >/dev/null 2>&1 || bad "setup: backup"; B=$(readlink -f "$W/bk/vidfetch-media-test-latest"); stage_files
  bash $A/03-network.sh open80 300 >/dev/null 2>&1 || bad "setup: 03"; login_after "$B/armed-at" 9 203.0.113.9
  bash $A/04-confirm.sh >/dev/null 2>&1 || bad "setup: 04-confirm"
  bash $A/05-caddy.sh --port80-verified-from-outside --public >/dev/null 2>&1 || bad "setup: 05-caddy --public"
  bash $A/05-confirm.sh --external-checks-passed >"$STATE/out" 2>&1 || bad "setup: 05-confirm ($(tail -2 "$STATE/out" | tr '\n' ' '))"
  : > "$STATE/calls.log"; : > "$STATE/curl.log"; rm -f "$STATE/journal.txt"; }
opened() { public_apex; bash $A/10-dl-public.sh >"$STATE/out" 2>&1 || bad "setup: 10-dl-public ($(tail -3 "$STATE/out" | tr '\n' ' '))"; S=$(readlink -f "$W/bk/vidfetch-public-dl-latest"); : > "$STATE/calls.log"; : > "$STATE/curl.log"; }
confirmed_dl() { opened; login_after "$S/armed-at" 9; bash $A/10-dl-confirm.sh --external-checks-passed >"$STATE/out" 2>&1 || bad "setup: 10-dl-confirm ($(tail -3 "$STATE/out" | tr '\n' ' '))"; : > "$STATE/calls.log"; }
with_secrets() { printf 'VIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app\nTURNSTILE_SITE_KEY=0x4AAAAAAA-test-site-key\nTURNSTILE_SECRET_KEY=%s\nVIDFETCH_ACCESS_SIGNING_KEY=%s\n' $CAN1 $CAN2 >> /etc/vidfetch/web.env; }
profile() { if [ -e $PROFILE ]; then case "$(cat $PROFILE)" in "$PUBLIC_JSON") echo public;; "$DL_JSON") echo public-downloads;; *) echo other;; esac; else echo closed; fi; }
ready() { sed -n 's/^VIDFETCH_CONNECTION_READY=//p' /etc/vidfetch/web.env | tail -n1; }
dlmode() { grep -q dl_conn4 $BASE/ingress.nft && echo public || echo testers; }
state() { echo "caddy=$(readlink $BASE/current) ingress=$(dlmode) live=$(grep -q dl_conn4 "$STATE/live-table" 2>/dev/null && echo public || echo testers) ci=$(profile) ready=$(ready)"; }
APEX_SEO_OK() { grep -q "sitemap: 3 URL(s) checked" "$1"; }
no_other_service() { ! calls | grep -E '^systemctl (restart|start|stop|reload|enable|disable) ' | grep -vE 'vidfetch-caddy\.service|vidfetch-(caddy|media|dl)-rollback\.timer|vidfetch-web-preproduction-20261013\.service' | grep -q .; }
refuse10() { local label=$1 s0; s0=$(state); : > "$STATE/calls.log"
  bash $A/10-dl-public.sh >"$STATE/out" 2>&1; rc=$?
  if [ $rc != 0 ] && [ "$(state)" = "$s0" ] && [ ! -f "$STATE/dl-armed" ] && ! calls | grep -qE '^systemd-run|^fw |^systemctl (daemon-reload|reload)'; then
    ok "10-dl-public refuses: $label  [$(grep -m1 REFUSED "$STATE/out" | cut -c1-110)]"
  else bad "10-dl-public: $label (rc=$rc, $(tail -2 "$STATE/out" | tr '\n' ' '))"; fi; }

echo "# 1. opening dl.vidfetch.app: preconditions (each refusal changes nothing)"
public_apex
[ "$(state)" = "caddy=Caddyfile.public ingress=testers live=testers ci=public ready=0" ] && ok "(setup) today's VPS state: public apex, tester-only dl, CI profile public, ready=0" || bad "setup state: $(state)"
sed -i 's/^VIDFETCH_CONNECTION_READY=0$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env; refuse10 "ready=1 (dl opens with downloads closed only)"; sed -i 's/^VIDFETCH_CONNECTION_READY=1$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env
printf '%s\n' "$DL_JSON" > $PROFILE; refuse10 "CI profile already public-downloads"; printf '%s\n' "$PUBLIC_JSON" > $PROFILE
rm -f $PROFILE; refuse10 "CI profile closed (public window not in force)"; printf '%s\n' "$PUBLIC_JSON" > $PROFILE
cp "$VM_CI_HELPER" "$W/helper.keep"; sed -i '/^PUBLIC_DL_PROFILE = /d' "$VM_CI_HELPER"; refuse10 "the installed CI helper does not know public-downloads"; cp "$W/helper.keep" "$VM_CI_HELPER"
touch "$STATE/caddy-armed"; refuse10 "Caddy rollback timer armed"; rm -f "$STATE/caddy-armed"
touch "$STATE/dl-restoring"; refuse10 "a public-download restore is running"; rm -f "$STATE/dl-restoring"
rm -f "$B/caddy-confirmed"; refuse10 "public apex window not confirmed"; date +%s.%N > "$B/caddy-confirmed"
mv "$W/tk/Caddyfile.public-dl" "$W/pdl.keep"; refuse10 "Caddyfile.public-dl missing next to the toolkit"
sed 's#Cache-Control "private, no-store, max-age=0"#Cache-Control "public"#' "$W/pdl.keep" > "$W/tk/Caddyfile.public-dl"; refuse10 "Caddyfile.public-dl whose apex differs from the live public one"
sed 's#            header_up -X-Real-IP#            header_up -X-Real-IP\n            header_up X-Debug 1#' "$W/pdl.keep" > "$W/tk/Caddyfile.public-dl"; refuse10 "Caddyfile.public-dl whose dl block differs by more than the tester filter"
cp "$W/pdl.keep" "$W/tk/Caddyfile.public-dl"
echo 'table inet vidfetch_https_test_ingress { set cloudflare4 {} }' > "$STATE/live-table"; refuse10 "network rules no longer the confirmed tester ones"; cp $BASE/ingress.nft "$STATE/live-table"
sed -i 's#^vidfetch.app GET / 200 BODY=home#vidfetch.app GET / 200 x-robots-tag: noindex|BODY=home#' "$W/origin/Caddyfile.public"; refuse10 "public apex not as expected before the change (noindex)"
public_apex; rm -f "$B/toolkit-revision"; refuse10 "backup from another toolkit revision"
[ -z "$(ls -d $W/bk/vidfetch-public-dl-* 2>/dev/null)" ] && [ ! -e $BASE/ingress.nft.public-dl ] || [ "$(dlmode)" = testers ] && ok "refused runs armed nothing and left ingress.nft tester-only" || bad "refusal side effects"

echo "# 2. opening: timer first, network then Caddy, nothing else"
public_apex; s0=$(sha256sum /etc/vidfetch/web.env /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json); before=$(cat $BASE/ingress.nft)
out=$(bash $A/10-dl-public.sh 2>&1); rc=$?; S=$(readlink -f "$W/bk/vidfetch-public-dl-latest")
[ $rc = 0 ] && [ "$(state)" = "caddy=Caddyfile.public-dl ingress=public live=public ci=public ready=0" ] && [ -f "$STATE/dl-armed" ] && ok "dl public, downloads still closed: Caddy public-dl, public ingress live, CI profile public, ready=0, timer armed" || bad "open rc=$rc state=$(state): $out"
c=$(calls); arm=$(echo "$c" | grep -n '^systemd-run .*vidfetch-dl-rollback' | cut -d: -f1); fwl=$(echo "$c" | grep -n '^fw apply' | cut -d: -f1 | head -1); rl=$(echo "$c" | grep -n '^systemctl reload vidfetch-caddy' | cut -d: -f1 | head -1)
[ -n "$arm" ] && [ -n "$fwl" ] && [ -n "$rl" ] && [ "$arm" -lt "$fwl" ] && [ "$fwl" -lt "$rl" ] && echo "$c" | grep -q '  at arming: pointer=Caddyfile.public dl-rules=0' && ok "order: timer armed (nothing changed yet), then the firewall, then Caddy" || bad "order arm=$arm fw=$fwl reload=$rl"
python3 - "$S/ingress.nft" $BASE/ingress.nft <<'PY' && ok "ingress diff is exactly the two limit sets and the 443 rule; SSH, port 80, Cloudflare and internal-port lines identical" || bad "unexpected ingress diff"
import difflib, sys
a, b = (open(p).read().splitlines() for p in sys.argv[1:3])
removed = [l for l in difflib.ndiff(a, b) if l.startswith('- ')]
added = [l[2:].strip() for l in difflib.ndiff(a, b) if l.startswith('+ ')]
assert removed == ['-         tcp dport 443 ip saddr @testers4 accept'], removed
assert 'tcp dport 22 accept' in [l.strip() for l in b] and 'tcp dport 80 accept' in [l.strip() for l in b]
assert all('22' not in x.split('dport')[-1].split()[0] for x in added if 'dport' in x)
PY
[ "$(cat "$S/ingress.nft")" = "$before" ] && [ "$(cat "$S/current.target")" = Caddyfile.public ] && [ "$(stat -c %a "$S/restore-dl.sh")" = 700 ] && cmp -s "$S/restore-dl.sh" $A/restore-dl.sh && grep -q testers4 "$S/ingress-table.nft" && ok "snapshot: tester ingress (file and live table), Caddyfile.public, the restore script (0700, identical)" || bad "snapshot content"
cmp -s $BASE/Caddyfile.public-dl "$W/tk/Caddyfile.public-dl" && [ "$(stat -c '%a %U' $BASE/Caddyfile.public-dl)" = "644 root" ] && ok "Caddyfile.public-dl staged byte-identical to the toolkit's, root 0644" || bad "staged Caddyfile.public-dl"
[ "$(sha256sum /etc/vidfetch/web.env /etc/vidfetch/gateway.env /etc/vidfetch/ci-web-test-guard.json)" = "$s0" ] && no_other_service && ok "environments, secrets and guard untouched; no service but Caddy reloaded" || bad "side effects"
! echo "$out" | grep -q CANARY && ok "no secret printed" || bad "secret printed"

echo "# 3. failures while opening restore the tester-only dl at once (public apex kept)"
fail_case() { local label=$1; shift; public_apex; "$@"; bash $A/10-dl-public.sh >"$STATE/out" 2>&1; rc=$?
  [ $rc = 1 ] && [ "$(state)" = "caddy=Caddyfile.public ingress=testers live=testers ci=public ready=0" ] && [ ! -f "$STATE/dl-armed" ] && ok "$label: restored at once (public apex, tester-only dl), timer disarmed, exit 1" || bad "$label: rc=$rc state=$(state) armed=$([ -f "$STATE/dl-armed" ] && echo y)"; }
fail_case "firewall apply fails" touch "$STATE/fw-fails"
rm -f "$STATE/fw-fails"
fail_case "Caddy refuses the reload" sh -c "echo 1 > '$STATE/reload-fails'"
fail_case "Caddy dies after the reload" touch "$STATE/reload-kills"
public_apex; echo 9 > "$STATE/reload-fails"; bash $A/10-dl-public.sh >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ -f "$STATE/dl-armed" ] && [ "$(dlmode)" = testers ] && grep -q "stays armed" "$STATE/out" && ok "Caddy reload failing persistently: ingress restored, restore reported incomplete, timer LEFT armed to retry" || bad "persistent reload failure rc=$rc state=$(state)"

echo "# 4. 10-dl-confirm.sh: SSH proof and checks"
refuse_confirm() { local label=$1 s0; s0=$(state); bash $A/10-dl-confirm.sh --external-checks-passed >"$STATE/out" 2>&1; rc=$?
  [ $rc != 0 ] && [ -f "$STATE/dl-armed" ] && [ ! -e "$S/confirmed" ] && [ "$(state)" = "$s0" ] && ok "10-dl-confirm refuses: $label  [$(grep -m1 -E 'REFUSED|^  ' "$STATE/out" | cut -c1-100)]" || bad "10-dl-confirm: $label (rc=$rc: $(tail -2 "$STATE/out" | tr '\n' ' '))"; }
opened; login_after "$S/armed-at" 9
bash $A/10-dl-confirm.sh >/dev/null 2>&1 && bad "confirm without flag" || ok "10-dl-confirm refuses without --external-checks-passed"
opened; rm -f "$STATE/journal.txt"; refuse_confirm "no SSH login after the change"
opened; login_after "$S/armed-at" -20; refuse_confirm "SSH login BEFORE the change"
opened; login_after "$S/armed-at" 1; refuse_confirm "SSH login inside the 3 s margin"
opened; login_after "$S/armed-at" 9 198.51.100.20 password; refuse_confirm "SSH login by password"
opened; login_after "$S/armed-at" 9; cp "$S/ingress.nft" "$STATE/live-table"; refuse_confirm "live table not the public one"
opened; login_after "$S/armed-at" 9; ln -sfn Caddyfile.public $BASE/current; refuse_confirm "Caddy not on Caddyfile.public-dl"; ln -sfn Caddyfile.public-dl $BASE/current
opened; login_after "$S/armed-at" 9; sed -i 's/^VIDFETCH_CONNECTION_READY=0$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env; refuse_confirm "ready=1 during the window"
opened; login_after "$S/armed-at" 9; sed -i 's#content="index, follow"#content="noindex, follow"#' "$W/origin/bodies/fr"; refuse_confirm "a sitemap page lost its indexability"
opened; login_after "$S/armed-at" 9; sed -i 's#^dl.vidfetch.app POST /api/fetch-info 401#dl.vidfetch.app POST /api/fetch-info 200#' "$W/origin/Caddyfile.public-dl"; refuse_confirm "a gateway route answers without a grant"
opened; login_after "$S/armed-at" 9; sed -i 's#^dl.vidfetch.app GET / 404#dl.vidfetch.app GET / 200#' "$W/origin/Caddyfile.public-dl"; refuse_confirm "dl serves something besides the gateway routes"
opened; login_after "$S/armed-at" 9; sed -i '/^dl.vidfetch.app/d' "$W/origin/Caddyfile.public-dl"; refuse_confirm "no trusted dl certificate"
opened; login_after "$S/armed-at" 9; rm -f "$STATE/dl-armed"; bash $A/10-dl-confirm.sh --external-checks-passed >"$STATE/out" 2>&1; rc=$?
[ $rc != 0 ] && [ ! -e "$S/confirmed" ] && grep -q "run 10-dl-cancel.sh, then 10-dl-public.sh again" "$STATE/out" && ok "10-dl-confirm refuses when the rollback timer is gone (reboot) and says how to start over" || bad "reboot case rc=$rc"
opened; login_after "$S/armed-at" 9; date +%s.%N > "$S/restore-started"; refuse_confirm "rollback already started"
opened; login_after "$S/armed-at" 9; out=$(bash $A/10-dl-confirm.sh --external-checks-passed 2>&1); rc=$?
[ $rc = 0 ] && [ -s "$S/confirmed" ] && [ ! -f "$STATE/dl-armed" ] && [ "$(state)" = "caddy=Caddyfile.public-dl ingress=public live=public ci=public ready=0" ] && ok "every check passes: confirmed, timer disarmed, downloads still closed" || bad "confirm rc=$rc: $out"
echo "$out" | grep -q "SSH: new public-key login" && echo "$out" | grep -q "sitemap: 3 URL(s) checked" && echo "$out" | grep -q "dl: public with a trusted certificate" && ok "the confirmation reports SSH, the public apex (SEO) and the public dl" || bad "confirm output: $out"

echo "# 5. restore-dl.sh (what the timer runs): back to the PUBLIC apex with tester-only dl"
opened; s0=$(sha256sum /etc/vidfetch/web.env); bash "$S/restore-dl.sh" "$S" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "caddy=Caddyfile.public ingress=testers live=testers ci=public ready=0" ] && [ -e "$S/restored" ] && ok "timer fired: tester-only ingress (file and live), Caddyfile.public, CI profile public, ready 0" || bad "restore rc=$rc state=$(state): $(cat "$STATE/out")"
cmp -s "$S/ingress.nft" $BASE/ingress.nft && [ "$(sha256sum /etc/vidfetch/web.env)" = "$s0" ] && ok "ingress.nft byte-identical to the snapshot; web.env untouched" || bad "restore content"
c=$(calls); cr=$(echo "$c" | grep -n '^systemctl reload' | cut -d: -f1 | head -1); fwl=$(echo "$c" | grep -n '^fw apply' | cut -d: -f1 | head -1)
[ -n "$cr" ] && [ -n "$fwl" ] && [ "$cr" -lt "$fwl" ] && ok "restore order: Caddy gate back first, then the network" || bad "restore order"
bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1 && [ "$(dlmode)" = testers ] && ok "running it again is harmless" || bad "second restore"
opened; touch "$STATE/fw-fails"; bash "$S/restore-dl.sh" "$S" >"$STATE/out" 2>&1; rc=$?
[ $rc = 0 ] && calls | grep -q '^nft --file' && [ "$(state)" = "caddy=Caddyfile.public ingress=testers live=testers ci=public ready=0" ] && ok "firewall helper failing: saved tester table applied directly through nft" || bad "nft fallback rc=$rc state=$(state)"
opened; touch "$STATE/fw-fails" "$STATE/nft-apply-fails"; bash "$S/restore-dl.sh" "$S" >"$STATE/out" 2>&1; rc=$?
[ $rc = 1 ] && [ "$(readlink $BASE/current)" = Caddyfile.public ] && [ "$(dlmode)" = testers ] && grep -q INCOMPLETE "$STATE/out" && [ ! -e "$S/restored" ] && ok "network restore fully failing: Caddy gate and ingress file restored anyway, exit 1 so systemd retries" || bad "independence rc=$rc"
rm -f "$STATE/fw-fails" "$STATE/nft-apply-fails"
opened; echo 1 > "$STATE/reload-fails"; bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1; [ $? = 0 ] && [ "$(grep -c '^systemctl reload' "$STATE/calls.log")" = 2 ] && ok "one failed Caddy reload is retried" || bad "reload retry"
opened; touch "$STATE/caddy-down"; bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1; [ $? = 0 ] && calls | grep -q '^systemctl start vidfetch-caddy' && ok "Caddy down: started again on Caddyfile.public" || bad "caddy start"
opened; date +%s.%N > "$S/confirmed"; bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1; [ "$(dlmode)" = public ] && ok "confirmed in the meantime: the late timer stands down" || bad "stand-down"
opened; echo Caddyfile > "$S/current.target"; bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1; [ $? = 1 ] && [ "$(dlmode)" = public ] && ok "a snapshot pointing at the old Basic Auth Caddyfile is refused (never restores the closed apex)" || bad "wrong target accepted"
opened; cp "$W/open80.nft" "$S/ingress.nft"; sed -i '$d' "$S/ingress.nft"; echo "set dl_conn4 {}" >> "$S/ingress.nft"; bash "$S/restore-dl.sh" "$S" >/dev/null 2>&1; [ $? = 1 ] && ok "a snapshot whose ingress is not the tester one is refused" || bad "wrong snapshot ingress accepted"
bash "$A/restore-dl.sh" /nonexistent >/dev/null 2>&1; [ $? = 1 ] && ok "invalid snapshot refused" || bad "invalid snapshot"

echo "# 6. 11-downloads.sh: ready and the CI profile move together"
confirmed_dl; refuse11() { local label=$1 s0; s0=$(state); bash $A/11-downloads.sh open >"$STATE/out" 2>&1; rc=$?
  [ $rc != 0 ] && [ "$(state)" = "$s0" ] && ok "11-downloads open refuses: $label  [$(grep -m1 REFUSED "$STATE/out" | cut -c1-90)]" || bad "11-downloads open: $label (rc=$rc $(state))"; }
refuse11 "Turnstile and signing secrets not installed"
with_secrets; sed -i 's#^VIDFETCH_MEDIA_ORIGIN=.*#VIDFETCH_MEDIA_ORIGIN=https://evil.example#' /etc/vidfetch/web.env; refuse11 "media origin is not https://dl.vidfetch.app"
confirmed_dl; with_secrets; cp "$VM_CI_HELPER" "$W/helper.keep"; sed -i '/^PUBLIC_DL_PROFILE = /d' "$VM_CI_HELPER"; refuse11 "CI helper without public-downloads"; cp "$W/helper.keep" "$VM_CI_HELPER"
opened; with_secrets; refuse11 "dl window not confirmed"
confirmed_dl; with_secrets; printf 'older gateway' > "$W/run/gateway.cjs"; refuse11 "the gateway in service is older than the active release's (08-gateway.sh upgrade not done)"
confirmed_dl; with_secrets; printf 'other engine' > "$W/run/engine.cjs"; refuse11 "the engine in service is not the active release's"
confirmed_dl; with_secrets; out=$(bash $A/11-downloads.sh open 2>&1); rc=$?
[ $rc = 0 ] && [ "$(profile)" = public-downloads ] && [ "$(ready)" = 1 ] && calls | grep -q '^systemctl restart vidfetch-web-preproduction-20261013.service' && ok "open: CI profile public-downloads, ready=1, only the frontend restarted" || bad "open rc=$rc state=$(state): $out"
echo "$out" | grep -q "downloads: offered by the frontend" && echo "$out" | grep -q "sitemap: 3 URL(s) checked" && ok "open: the public apex stays indexable, the frontend offers the widget and dl" || bad "open checks: $out"
! echo "$out" | grep -q CANARY && ok "open printed no secret" || bad "secret printed"
out=$(bash $A/11-downloads.sh close 2>&1); rc=$?
[ $rc = 0 ] && [ "$(profile)" = public ] && [ "$(ready)" = 0 ] && echo "$out" | grep -q "downloads: closed" && ok "close: ready=0 and CI profile public, verified on the origin" || bad "close rc=$rc state=$(state): $out"
confirmed_dl; with_secrets; sed -i 's#"siteKey":"0x4AAAAAAA-test-site-key"#"siteKey":""#' "$W/origin/bodies/access-open"
bash $A/11-downloads.sh open >"$STATE/out" 2>&1; rc=$?
[ $rc != 0 ] && [ "$(profile)" = public ] && [ "$(ready)" = 0 ] && grep -q "closed again" "$STATE/out" && ok "a failed check after opening closes again at once (ready=0, CI profile public)" || bad "failed open rc=$rc state=$(state)"
confirmed_dl; with_secrets; touch "$STATE/restart-fails"; bash $A/11-downloads.sh open >"$STATE/out" 2>&1; rc=$?
[ $rc != 0 ] && [ "$(profile)" = public ] && ok "the frontend cannot restart: CI profile back to public" || bad "restart failure rc=$rc state=$(state)"; rm -f "$STATE/restart-fails"

echo "# 6b. 08-gateway.sh changes the gateway only while downloads are closed"
confirmed_dl; with_secrets; bash $A/11-downloads.sh open >/dev/null 2>&1; s0=$(state); : > "$STATE/calls.log"
G=$(sha256sum "$W/release/backend/vidfetch-gateway.cjs" | cut -c1-64)
out=$(bash $A/08-gateway.sh upgrade "$G" 2>&1); rc=$?
[ $rc != 0 ] && grep -q 'downloads are open' <<< "$out" && [ "$(state)" = "$s0" ] && ! calls | grep -qE '^systemctl (stop|start|daemon-reload)' && ok "08-gateway upgrade refuses while downloads are open, nothing touched" || bad "08-gateway upgrade with downloads open: rc=$rc $(tail -1 <<< "$out")"
GB=$(mktemp -d "$W/bk/vidfetch-gateway-upgrade-test.XXXXXX"); echo /nonexistent/vidfetch-gateway.cjs > "$GB/previous-bundle.path"
( cd "$GB" && find . -type f ! -name MANIFEST.sha256 -print0 | xargs -0 sha256sum > MANIFEST.sha256 ); ln -sfn "$GB" "$W/bk/vidfetch-gateway-upgrade-latest"
out=$(bash $A/08-gateway.sh rollback 2>&1); rc=$?
[ $rc != 0 ] && grep -q 'downloads are open' <<< "$out" && [ "$(state)" = "$s0" ] && ! calls | grep -qE '^systemctl (stop|start|daemon-reload)' && ok "08-gateway rollback refuses while downloads are open: no frontend ever faces an older gateway" || bad "08-gateway rollback with downloads open: rc=$rc $(tail -1 <<< "$out")"
sed -i 's/^VIDFETCH_CONNECTION_READY=.*$/VIDFETCH_TARGET=ovh/' /etc/vidfetch/web.env
out=$(bash $A/08-gateway.sh upgrade "$G" 2>&1); [ $? != 0 ] && grep -q 'downloads are open (ready=)' <<< "$out" && ok "08-gateway: a missing ready setting counts as open" || bad "08-gateway missing ready: $(tail -1 <<< "$out")"
rm -f -- "$W/bk/vidfetch-gateway-upgrade-latest" "$GB/previous-bundle.path" "$GB/MANIFEST.sha256"; rmdir -- "$GB"

echo "# 7. every other path keeps network, Caddy, ready and the CI profile in agreement"
confirmed_dl; with_secrets; bash $A/11-downloads.sh open >/dev/null 2>&1
bash $A/10-dl-cancel.sh >/dev/null 2>&1 && bad "10-dl-cancel with downloads open" || ok "10-dl-cancel refuses while downloads are open (11-downloads.sh close first)"
bash $A/05-cancel.sh >/dev/null 2>&1 && bad "05-cancel with dl public" || ok "05-cancel refuses while dl is public (close downloads, then dl, first)"
sed -i 's/^VIDFETCH_CONNECTION_READY=1$/VIDFETCH_CONNECTION_READY=0/' /etc/vidfetch/web.env; bash $A/06-profile.sh install-public >/dev/null 2>&1; sed -i 's/^VIDFETCH_CONNECTION_READY=0$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env
bash $A/06-profile.sh install-public >/dev/null 2>&1 && bad "install-public with ready=1" || ok "06-profile install-public refuses while ready=1"
printf '%s\n' "$DL_JSON" > $PROFILE
bash $A/04-cancel.sh >"$STATE/out" 2>&1; rc=$?
[ "$(state)" = "caddy=Caddyfile ingress=testers live=testers ci=closed ready=0" ] || [ "$(readlink $BASE/current) $(profile) $(ready)" = "Caddyfile closed 0" ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "04-cancel (emergency) from open downloads: original network and Caddy, ready=0, no public profile left" || bad "04-cancel rc=$rc: $(state) $(tail -2 "$STATE/out" | tr '\n' ' ')"
confirmed_dl; bash $A/10-dl-cancel.sh >/dev/null 2>&1; rc=$?
[ $rc = 0 ] && [ "$(state)" = "caddy=Caddyfile.public ingress=testers live=testers ci=public ready=0" ] && ok "10-dl-cancel after confirmation: tester-only dl, public apex kept" || bad "10-dl-cancel rc=$rc state=$(state)"
confirmed_dl; out=$(bash "$B/restore-full.sh" "$B" --yes 2>&1); rc=$?
[ $rc = 0 ] && [ ! -e $BASE/Caddyfile.public-dl ] && [ ! -e $BASE/ingress.nft.public-dl ] && grep -q ORIGINAL-INGRESS $BASE/ingress.nft && ok "restore-full: back to the backup; Caddyfile.public-dl and ingress.nft.public-dl removed by name" || bad "restore-full rc=$rc: $out"
exit $fail
