#!/usr/bin/env bash
# Needs root + GNU coreutils (Linux). Uses only throwaway files and FAKE keys.
set -uo pipefail
SCRIPT=$(cd "$(dirname "$0")/../media" && pwd)/install-web-secrets.sh
[ "$(id -u)" = 0 ] || { echo "SKIP: root required"; exit 77; }
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
HMAC=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')
SITE=0xFAKESITEKEY12345678; SECRET=0xFAKESECRETKEY1234567890
fail=0; n=0
ok() { n=$((n+1)); echo "ok $n - $1"; }
bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
mk() { # fresh env files
  rm -f "$W"/web.env* "$W"/gw.env
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_CONNECTION_READY=0\nOLD=1\nTURNSTILE_SITE_KEY=old\nOTHER=a b\n' > "$W/web.env"
  printf 'X=1\nVIDFETCH_ACCESS_SIGNING_KEY=%s\n' "$HMAC" > "$W/gw.env"
  chmod 600 "$W/web.env" "$W/gw.env"
}
run() { printf '%s\n%s\n' "$1" "$2" | bash "$SCRIPT" "$W/web.env" "$W/gw.env" 2>&1; }

mk; out=$(run "$SITE" "$SECRET"); rc=$?
[ $rc = 0 ] && ok "success" || bad "success rc=$rc"
grep -q "$SECRET\|$HMAC" <<<"$out" && bad "secret printed" || ok "no secret in output"
[ "$(stat -c %a "$W/web.env")" = 600 ] && ok "mode 600" || bad "mode"
[ "$(grep -c '^TURNSTILE_SITE_KEY=' "$W/web.env")" = 1 ] && grep -q "^TURNSTILE_SITE_KEY=$SITE$" "$W/web.env" && ok "site key replaced once" || bad "site key"
grep -q "^VIDFETCH_ACCESS_SIGNING_KEY=$HMAC$" "$W/web.env" && grep -q '^OTHER=a b$' "$W/web.env" && grep -q '^VIDFETCH_CONNECTION_READY=0$' "$W/web.env" && ok "others and READY=0 preserved" || bad "preservation"
b=$(ls "$W"/web.env.bak.* 2>/dev/null | head -1); [ -n "$b" ] && [ "$(stat -c %a "$b")" = 600 ] && grep -q '^OLD=1$' "$b" && ok "backup 600 with old content" || bad "backup"
[ -z "$(ls "$W"/web.env.new.* 2>/dev/null)" ] && ok "no temp left" || bad "temp left"
sleep 1; run "$SITE" "$SECRET" >/dev/null; rc=$?; [ $rc = 0 ] && [ "$(grep -c '^TURNSTILE_SECRET_KEY=' "$W/web.env")" = 1 ] && [ "$(ls "$W"/web.env.bak.* | wc -l)" = 2 ] && ok "idempotent rerun, second backup" || bad "rerun"

mk; before=$(sha256sum "$W/web.env"); out=$(run "$SITE" 'bad key!'); rc=$?
[ $rc != 0 ] && [ "$(sha256sum "$W/web.env")" = "$before" ] && [ -z "$(ls "$W"/web.env.bak.* 2>/dev/null)" ] && ok "bad format: refused, file untouched, no backup" || bad "bad format"
mk; before=$(sha256sum "$W/web.env"); out=$(run 1x00000000000000000000AA 1x0000000000000000000000000000000AA); rc=$?
[ $rc != 0 ] && [ "$(sha256sum "$W/web.env")" = "$before" ] && ok "dummy Cloudflare keys refused" || bad "dummy keys"
mk; sed -i '/SIGNING/d' "$W/gw.env"; before=$(sha256sum "$W/web.env"); out=$(run "$SITE" "$SECRET"); rc=$?
[ $rc != 0 ] && [ "$(sha256sum "$W/web.env")" = "$before" ] && ok "missing HMAC refused" || bad "missing hmac"
mk; chmod 644 "$W/web.env"; out=$(run "$SITE" "$SECRET"); [ $? != 0 ] && grep -q "unsafe permissions" <<<"$out" && ok "world-readable env refused" || bad "perm check"
mk; ln -s "$W/web.env" "$W/link.env"; out=$(printf '%s\n%s\n' "$SITE" "$SECRET" | bash "$SCRIPT" "$W/link.env" "$W/gw.env" 2>&1); [ $? != 0 ] && ok "symlink refused" || bad "symlink"
mk; chown 1000 "$W/web.env"; out=$(run "$SITE" "$SECRET"); [ $? != 0 ] && ok "non-root owner refused" || bad "owner"
mk; out=$(printf '%s\n%s\n' "$SITE" "$SECRET" | bash -x "$SCRIPT" "$W/web.env" "$W/gw.env" 2>&1); grep -q "$SECRET" <<<"$out" && bad "xtrace leaked" || ok "no leak under bash -x"
grep -q "xtrace" <<<"$out" && ok "xtrace refused explicitly" || bad "xtrace guard"
mk; out=$(bash "$SCRIPT" "$W/web.env" 2>&1); [ $? = 2 ] && ok "usage error" || bad "usage"
exit $fail
