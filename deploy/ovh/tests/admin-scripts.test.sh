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
        case "$t" in vidfetch-media-rollback.timer) [ -f "$STATE/armed" ] ;; *) exit 0 ;; esac ;;
      stop) rm -f "$STATE/armed" ;; reload) [ -f "$STATE/reload-fails" ] && exit 1 || exit 0 ;; show) echo 4242 ;; esac ;;
  systemd-run) touch "$STATE/armed" ;;
  nft) echo "table inet vidfetch_https_test_ingress { }" ;;
  logger|runuser) ;;
esac
S
chmod +x "$W/bin/stub"; for n in systemctl systemd-run nft logger runuser; do ln -s stub "$W/bin/$n"; done
cat > "$W/fw" <<'S'
#!/bin/sh
echo "fw $*" >> "$STATE/calls.log"; [ -f "$STATE/fw-fails" ] && grep -q NEW-INGRESS "$VM_BASE/ingress.nft" && exit 1; cp "$VM_BASE/ingress.nft" "$STATE/applied.nft"; exit 0
S
chmod +x "$W/fw"
export STATE="$W/state" PATH="$W/bin:$PATH" VM_BASE="$W/base" VM_FW="$W/fw" VM_BACKUPS="$W/bk" VM_SYSTEMCTL="$W/bin/systemctl" VM_NFT="$W/bin/nft" VM_CADDY=/bin/true
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

# --- confirm / cancel
touch "$STATE/armed"; bash "$A/04-confirm.sh" >/dev/null 2>&1 && [ ! -f "$STATE/armed" ] && ok "confirm disarms the timer" || bad "confirm"
bash "$A/04-confirm.sh" >/dev/null 2>&1 && bad "confirm when not armed" || ok "confirm refuses when not armed (already fired)"

# --- caddy switch
printf 'import /etc/vidfetch/public-https-test/auth.caddy\nX-Robots-Tag "noindex, nofollow"\n' > "$W/base/Caddyfile.media-test"
bash "$A/05-caddy.sh" >/dev/null 2>&1 && bad "05 without flag" || ok "05 requires the port-80 confirmation flag"
bash "$A/05-caddy.sh" --port80-verified-from-outside >/dev/null 2>&1 && bad "05 without timer" || ok "05 refuses without an armed timer"
touch "$STATE/armed"; printf 'tcp dport 80 accept\n' >> "$W/base/ingress.nft"
touch "$STATE/reload-fails"; bash "$A/05-caddy.sh" --port80-verified-from-outside >/dev/null 2>&1 && bad "05 reload fail" || ok "05 fails when reload fails"
[ "$(readlink "$W/base/current")" = Caddyfile ] && ok "failed reload: pointer restored" || bad "pointer after failed reload"
rm -f "$STATE/reload-fails"; bash "$A/05-caddy.sh" --port80-verified-from-outside >/dev/null 2>&1 || bad "05 failed"
[ "$(readlink "$W/base/current")" = Caddyfile.media-test ] && grep -q "EnvironmentFile=$W/base/media-test-ips.env" /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf && ok "pointer switched, env drop-in written" || bad "05 result"
[ "$(stat -c %a /etc/systemd/system/vidfetch-caddy.service.d/media-test.conf)" = 644 ] && ok "drop-in mode 0644" || bad "dropin mode"
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
exit $fail
