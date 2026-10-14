#!/usr/bin/env bash
# Runs ONLY inside a throwaway container (it writes under /etc). Real nft/systemctl/Caddy are stubs
# that log their calls; this tests the scripts' logic, refusals and restore behaviour, not the kernel.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
A=/r/deploy/ovh/media/admin
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p "$W/base" "$W/bin" "$W/bk" "$W/state" /etc/vidfetch /etc/systemd/system/vidfetch-caddy.service.d /var/lib/vidfetch-proxy /opt/vidfetch-web-preproduction-20261013
echo '[Service]' > /etc/systemd/system/vidfetch-caddy.service; echo web > /var/lib/vidfetch-proxy/x; ln -sfn /tmp /opt/vidfetch-web-preproduction-20261013/current
printf 'ORIGINAL-INGRESS\n' > "$W/base/ingress.nft"; echo CF > "$W/base/Caddyfile"; echo BS > "$W/base/Caddyfile.bootstrap"; echo AUTH > "$W/base/auth.caddy"
ln -s Caddyfile "$W/base/current"
printf 'X=1\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env; chmod 600 /etc/vidfetch/web.env
echo '{"files":{}}' > /etc/vidfetch/ci-web-test-guard.json
cat > "$W/bin/stub" <<'S'
#!/bin/sh
n=$(basename "$0"); echo "$n $*" >> "$STATE/calls.log"
case "$n" in
  systemctl) case "$1" in is-active) if [ "$2" = --quiet ]; then t=$3; else t=$2; fi
        case "$t" in vidfetch-media-rollback.timer) [ -f "$STATE/armed" ] ;; vidfetch-media-rollback.service) exit 1 ;; *) exit 0 ;; esac ;;
      stop) rm -f "$STATE/armed" ;; reload) [ -f "$STATE/reload-fails" ] && exit 1 || exit 0 ;; show) echo 4242 ;; esac ;;
  systemd-run) touch "$STATE/armed" ;;
  nft) echo "table inet vidfetch_https_test_ingress { }" ;;
  journalctl) [ -f "$STATE/ssh-login" ] && echo "Accepted publickey for debian from 203.0.113.9 port 50000 ssh2: ED25519 SHA256:xxxx" ;;
  logger|runuser) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser journalctl; do ln -s stub "$W/bin/$n"; done
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"; [ -f "$STATE/fw-fails" ] && grep -q NEW-INGRESS "$VM_BASE/ingress.nft" && exit 1; cp "$VM_BASE/ingress.nft" "$STATE/applied.nft"; exit 0
S
chmod +x "$W/fw"
export STATE="$W/state" PATH="$W/bin:$PATH" VM_BASE="$W/base" VM_FW="$W/fw" VM_BACKUPS="$W/bk" VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft" VM_CADDY=/bin/true VM_JOURNALCTL="$W/bin/journalctl"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
calls() { cat "$STATE/calls.log" 2>/dev/null; }
sums() { sha256sum /etc/vidfetch/web.env /etc/vidfetch/ci-web-test-guard.json | sha256sum; }

# --- refusals before any backup exists
bash "$A/03-network.sh" closed80 >/dev/null 2>&1 && bad "03 without backup" || ok "03 refuses without backup"
bash "$A/05-caddy.sh" --port80-verified-from-outside >/dev/null 2>&1 && bad "05 without backup" || ok "05 refuses without backup"

# --- backup
bash "$A/01-backup.sh" 2>&1 | tail -3 || bad "backup failed"
B=$(readlink -f "$W/bk/vidfetch-media-test-latest")
[ "$(stat -c %a "$B")" = 700 ] && [ -f "$B/MANIFEST.sha256" ] && [ -x "$B/restore-network.sh" ] && [ "$(cat "$B/current.target")" = Caddyfile ] && ok "backup: 0700, manifest, restore script, pointer recorded" || bad "backup layout"
( cd "$B" && sha256sum --check --quiet MANIFEST.sha256 ) && ok "backup manifest verifies" || bad "manifest"
grep -q ORIGINAL-INGRESS "$B/public-https-test/ingress.nft" && ok "original ingress saved" || bad "ingress saved"
[ "$(stat -c %a "$B/caddy-state.tgz")" = 600 ] && ok "caddy state archive 0600" || bad "state mode"

# --- network step refusals
bash "$A/03-network.sh" closed80 >/dev/null 2>&1 && bad "03 without stage" || ok "03 refuses before staging"
printf 'NEW-INGRESS\n        tcp dport 443 ip saddr @testers4 accept\n' > "$W/base/ingress.nft.media-test"
bash "$A/03-network.sh" closed80 60 >/dev/null 2>&1 && bad "03 short timer" || ok "03 refuses a timer under 120 s"
bash "$A/03-network.sh" open80 300 >/dev/null 2>&1 && bad "03 mode mismatch" || ok "03 refuses port-80 mode mismatch with staged file"

# --- apply fails -> immediate restore, no timer left
touch "$STATE/fw-fails"; before=$(sha256sum "$B/public-https-test/ingress.nft" | cut -c1-64)
bash "$A/03-network.sh" closed80 300 >/dev/null 2>&1 && bad "03 should fail when apply fails" || ok "03 reports failure when apply fails"
grep -q ORIGINAL-INGRESS "$W/base/ingress.nft" && [ ! -f "$STATE/armed" ] && ok "failed apply: original ingress restored, timer disarmed" || bad "failed apply restore"
rm -f "$STATE/fw-fails" "$STATE/calls.log"

# --- apply ok: timer armed first, file replaced, helper called, env/guard untouched
s0=$(sums)
bash "$A/03-network.sh" closed80 300 >/dev/null 2>&1 || bad "03 failed"
c=$(calls); arm=$(echo "$c" | grep -n '^systemd-run' | cut -d: -f1 | head -1); app=$(echo "$c" | grep -n '^fw apply' | cut -d: -f1 | head -1)
[ -n "$arm" ] && [ -n "$app" ] && [ "$arm" -lt "$app" ] && ok "dead-man timer armed BEFORE the firewall apply" || bad "ordering ($arm/$app)"
echo "$c" | grep -q -- '--on-active=300s' && ok "timer duration passed" || bad "timer duration"
grep -q NEW-INGRESS "$W/base/ingress.nft" && grep -q NEW-INGRESS "$STATE/applied.nft" && ok "staged ingress installed and applied" || bad "apply content"
[ "$(sums)" = "$s0" ] && ok "env and guard untouched by network step" || bad "env/guard changed"
bash "$A/03-network.sh" closed80 300 >/dev/null 2>&1 && bad "double arm" || ok "refuses to arm twice"

# --- timer fires (simulated) = restore script run by hand
rm -f "$STATE/armed"; s1=$(sums)
bash "$B/restore-network.sh" "$B" >/dev/null 2>&1 || bad "restore failed"
grep -q ORIGINAL-INGRESS "$W/base/ingress.nft" && [ "$(readlink "$W/base/current")" = Caddyfile ] && ok "restore: original ingress + Caddy pointer back" || bad "restore content"
[ "$(sums)" = "$s1" ] && ok "restore never touches env or guard" || bad "restore touched env/guard"
calls | grep -q '^fw apply' && ok "restore re-applies through the firewall helper" || bad "restore apply"

# --- confirm/cancel details live in admin-hardening.test.sh; here only the basic wiring
touch "$STATE/armed"; bash "$A/04-cancel.sh" >/dev/null 2>&1 && [ ! -f "$STATE/armed" ] && ok "cancel restores and disarms" || bad "cancel"
rm -f "$B/restore-started" "$B/restored" "$B/confirmed"
grep -q 'new public-key login' "$A/04-confirm.sh" && ok "confirm demands a public-key login" || bad "confirm text"

# --- caddy switch: details in caddy-window.test.sh; here only that it waits for the confirmed network window
printf 'import /etc/vidfetch/public-https-test/auth.caddy\nX-Robots-Tag "noindex, nofollow"\n' > "$W/base/Caddyfile.media-test"
bash "$A/05-caddy.sh" >/dev/null 2>&1 && bad "05 without flag" || ok "05 requires the port-80 confirmation flag"
out=$(bash "$A/05-caddy.sh" --port80-verified-from-outside 2>&1) && bad "05 without network window" || { grep -q "network window is not confirmed" <<< "$out" && ok "05 refuses before the network window is confirmed" || bad "05 message: $out"; }
touch "$STATE/armed"; date +%s.%N > "$B/confirmed"
out=$(bash "$A/05-caddy.sh" --port80-verified-from-outside 2>&1) && bad "05 inside the network window" || { grep -q "network dead-man timer is still armed" <<< "$out" && ok "05 refuses while the network timer is armed (04-confirm.sh first)" || bad "05 message: $out"; }
rm -f "$STATE/armed" "$B/confirmed"
[ "$(readlink "$W/base/current")" = Caddyfile ] && [ ! -e /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf ] && ! calls | grep -q 'vidfetch-caddy-rollback' && ok "refused 05 runs left the pointer, the drop-in and the timers alone" || bad "05 acted while refusing"
[ "$(sums)" = "$s1" ] && ok "caddy step leaves env/guard untouched" || bad "05 touched env"

# --- ready flag
bash "$A/set-ready.sh" 1 >/dev/null 2>&1 && bad "ready=1 without profile" || ok "ready=1 refused without CI profile"
VM_PROFILE=/etc/vidfetch/ci-media-test-profile.json bash "$A/06-profile.sh" install >/dev/null 2>&1 && [ "$(stat -c '%a %U' /etc/vidfetch/ci-media-test-profile.json)" = "644 root" ] && ok "profile installed root 0644" || bad "profile install"
python3 -c "import json;assert json.load(open('/etc/vidfetch/ci-media-test-profile.json'))=={'profile':'media-test','apex':'basic-auth-noindex','dl':'testers-only'}" && ok "profile content exactly what the promoter accepts" || bad "profile content"
bash "$A/set-ready.sh" 1 >/dev/null 2>&1 && bad "ready=1 without secrets" || ok "ready=1 refused while secrets are missing"
grep -q '^VIDFETCH_CONNECTION_READY=0$' /etc/vidfetch/web.env && ok "READY still 0 after refusals" || bad "ready changed"
bash "$A/06-profile.sh" remove >/dev/null 2>&1 && [ ! -e /etc/vidfetch/ci-media-test-profile.json ] && ok "profile removal" || bad "profile remove"

# --- stage refusals
R="$W/render"; mkdir "$R"; printf 'T\n' > "$R/ingress.nft"; printf 'VIDFETCH_MEDIA_TEST_IPS=192.0.2.1/32\n' > "$R/media-test-ips.env"; printf 'C\n' > "$R/Caddyfile.test-only"
( cd "$R" && sha256sum ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS )
bash "$A/02-stage.sh" "$R" >/dev/null 2>&1 && bad "stage placeholder" || ok "stage refuses the placeholder tester list"
printf 'VIDFETCH_MEDIA_TEST_IPS=1.2.3.0/24\n' > "$R/media-test-ips.env"; ( cd "$R" && sha256sum ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS )
bash "$A/02-stage.sh" "$R" >/dev/null 2>&1 && bad "stage /24" || ok "stage refuses non-/32 testers"
printf 'VIDFETCH_MEDIA_TEST_IPS=1.2.3.4/32\n' > "$R/media-test-ips.env"
bash "$A/02-stage.sh" "$R" >/dev/null 2>&1 && bad "stage bad checksum" || ok "stage refuses files that do not match SHA256SUMS"

# --- preflight: read-only and secret-free
printf 'VIDFETCH_TARGET=ovh\nTURNSTILE_SECRET_KEY=CANARY-TURNSTILE-SECRET-9f3a\nVIDFETCH_ACCESS_SIGNING_KEY=CANARYHMACKEYCANARYHMACKEYCANARYHMACKE1\nVIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app\n' > /etc/vidfetch/gateway.env; chmod 600 /etc/vidfetch/gateway.env
echo 'DB_PASSWORD=CANARY-DB-PW-77' >> /etc/vidfetch/web.env
find /etc/vidfetch /etc/systemd /var/lib/vidfetch-proxy "$W/base" "$W/bk" -type f -o -type l 2>/dev/null | sort | xargs -d '\n' sha256sum -- 2>/dev/null > "$W/tree.before"; : > "$STATE/calls.log"
out=$(bash "$A/00-preflight.sh" 2>&1)
echo "$out" | grep -qE 'CANARY' && bad "preflight printed a secret" || ok "preflight prints no secret value (canaries absent)"
echo "$out" | grep -q 'VIDFETCH_GATEWAY_ORIGIN=https://api.vidfetch.app' && ok "preflight shows the non-secret gateway origin" || bad "gateway origin not shown"
echo "$out" | grep -q 'TURNSTILE_SECRET_KEY' && ok "preflight lists variable NAMES (value hidden)" || bad "names not listed"
find /etc/vidfetch /etc/systemd /var/lib/vidfetch-proxy "$W/base" "$W/bk" -type f -o -type l 2>/dev/null | sort | xargs -d '\n' sha256sum -- 2>/dev/null > "$W/tree.after"
cmp -s "$W/tree.before" "$W/tree.after" && ok "preflight changed no file" || bad "preflight modified files"
calls | grep -E '^(systemctl|nft)' | grep -qvE '^(systemctl (is-active|show|cat)|nft list)' && bad "preflight called a state-changing command: $(calls | grep -E '^(systemctl|nft)' | grep -vE '^(systemctl (is-active|show|cat)|nft list)' | head -2)" || ok "preflight only calls systemctl is-active/show and nft list"
! echo "$out" | grep -q . && bad "preflight silent" || ok "preflight produced a report"

# --- stage: positive run is inert (no reload, restart, daemon-reload, firewall, timer, pointer change)
printf 'import /etc/vidfetch/public-https-test/auth.caddy\nX-Robots-Tag "noindex, nofollow"\n' > "$W/render/Caddyfile.test-only"
printf 'T\n' > "$W/render/ingress.nft"; printf 'VIDFETCH_MEDIA_TEST_IPS=1.2.3.4/32\n' > "$W/render/media-test-ips.env"
( cd "$W/render" && sha256sum ingress.nft media-test-ips.env Caddyfile.test-only > SHA256SUMS )
: > "$STATE/calls.log"; ptr=$(readlink "$W/base/current"); ing=$(sha256sum "$W/base/ingress.nft" | cut -c1-64); dropin_before=$(ls /etc/systemd/system/vidfetch-caddy.service.d 2>/dev/null | wc -l)
bash "$A/02-stage.sh" "$W/render" >/dev/null 2>&1 && ok "stage succeeds with a matching render directory" || bad "stage positive"
calls | grep -qE '^(systemctl (reload|restart|daemon-reload|start|stop|enable|disable)|systemd-run|fw )' && bad "stage performed an activation call: $(calls | grep -E '^(systemctl (reload|restart|daemon-reload|start|stop)|systemd-run|fw )' | head -2)" || ok "stage made no reload/restart/daemon-reload/firewall/timer call"
[ "$(readlink "$W/base/current")" = "$ptr" ] && [ "$(sha256sum "$W/base/ingress.nft" | cut -c1-64)" = "$ing" ] && ok "stage left the live pointer and ingress.nft untouched" || bad "stage changed live files"
[ "$(ls /etc/systemd/system/vidfetch-caddy.service.d 2>/dev/null | wc -l)" = "$dropin_before" ] && ok "stage installed no systemd drop-in" || bad "stage dropin"
[ -f "$W/base/Caddyfile.media-test" ] && [ -f "$W/base/ingress.nft.media-test" ] && [ -f "$W/base/media-test-ips.env" ] && ok "stage created only the three inert new files" || bad "stage files"
exit $fail
