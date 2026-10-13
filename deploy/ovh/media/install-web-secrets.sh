#!/usr/bin/env bash
# MANUAL, ADMINISTRATOR-ONLY. Run as root on the VPS, in a terminal you control.
# Merges Turnstile keys and the gateway HMAC key into the web environment file.
# Secrets are read with `read -s` (never echoed, never in argv, never in shell history)
# and are never printed. A timestamped root-only backup is made first, the new file is
# built beside the target and moved into place atomically, and any failure leaves the
# original file untouched.
#
# Usage: sudo ./install-web-secrets.sh /etc/vidfetch/web.env /etc/vidfetch/<gateway env file>
# Prompts (stdin): Turnstile Site Key, then Turnstile Secret Key.
# VIDFETCH_CONNECTION_READY is deliberately NOT changed here: it stays 0 until
# the activation checklist (docs/VIDFETCH-PHASE9-ACTIVATION.md) reaches that step.
set -euo pipefail
umask 077
[[ $- != *x* ]] || { echo "refusing to run with xtrace enabled (it would print secrets)" >&2; exit 1; }
[ "$#" -eq 2 ] || { echo "usage: $0 WEB_ENV GATEWAY_ENV" >&2; exit 2; }
WEB_ENV=$1; GATEWAY_ENV=$2
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

# Both files must be regular, root-owned, not symlinks, not group/world-writable,
# and not world-readable (they hold or will hold secrets).
check_file() {
  local f=$1 mode
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "not a regular file: $f" >&2; exit 1; }
  [ "$(stat -c %u "$f")" = 0 ] || { echo "not owned by root: $f" >&2; exit 1; }
  mode=$(stat -c %a "$f")
  [ $(( 8#$mode & 8#027 )) -eq 0 ] || { echo "unsafe permissions $mode on $f" >&2; exit 1; }
}
check_file "$WEB_ENV"; check_file "$GATEWAY_ENV"

exec 9>"$WEB_ENV.lock"
flock -n 9 || { echo "another run holds the lock" >&2; exit 1; }

# systemd EnvironmentFile semantics: the last assignment wins.
HMAC=$(sed -n 's/^VIDFETCH_ACCESS_SIGNING_KEY=//p' "$GATEWAY_ENV" | tail -n1)
[[ "$HMAC" =~ ^[A-Za-z0-9_-]{43}$ ]] || { echo "gateway VIDFETCH_ACCESS_SIGNING_KEY missing or not a 43-char base64url key" >&2; exit 1; }
IFS= read -r -p "Turnstile Site Key (public): " SITE
IFS= read -r -s -p "Turnstile Secret Key (hidden): " SECRET; echo
[[ "$SITE" =~ ^[A-Za-z0-9_-]{10,100}$ && "$SECRET" =~ ^[A-Za-z0-9_-]{10,100}$ ]] || { echo "unexpected key format; nothing changed" >&2; exit 1; }
# Cloudflare's documented dummy keys always pass/fail and must never reach the recette.
[[ "$SITE" =~ ^[123]x0000 || "$SECRET" =~ ^[123]x0000 ]] && { echo "Cloudflare dummy test keys refused; nothing changed" >&2; exit 1; }

BACKUP="$WEB_ENV.bak.$(date -u +%Y%m%dT%H%M%SZ)"
[ ! -e "$BACKUP" ] || { echo "backup name already exists" >&2; exit 1; }
cp -p "$WEB_ENV" "$BACKUP"; chmod 600 "$BACKUP"; echo "backup: $BACKUP"

TMP=$(mktemp "$WEB_ENV.new.XXXXXX")
trap 'rm -f "$TMP"' EXIT
NAMES='^(TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY|VIDFETCH_ACCESS_SIGNING_KEY|VIDFETCH_MEDIA_ORIGIN)='
# Drop previous values for these names, keep every other line untouched.
rc=0; grep -vE "$NAMES" "$WEB_ENV" > "$TMP" || rc=$?
[ "$rc" -le 1 ] || { echo "cannot read $WEB_ENV" >&2; exit 1; }
{
  printf '%s\n' "VIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app" \
                "TURNSTILE_SITE_KEY=$SITE" \
                "TURNSTILE_SECRET_KEY=$SECRET" \
                "VIDFETCH_ACCESS_SIGNING_KEY=$HMAC"
} >> "$TMP"
chown --reference="$WEB_ENV" "$TMP"; chmod 600 "$TMP"

# Verify before replacing: other lines identical, each name exactly once.
cmp -s <(grep -vE "$NAMES" "$WEB_ENV" || true) <(grep -vE "$NAMES" "$TMP" || true) || { echo "verification failed: unrelated lines changed" >&2; exit 1; }
for n in VIDFETCH_MEDIA_ORIGIN TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY VIDFETCH_ACCESS_SIGNING_KEY; do
  [ "$(grep -c "^$n=" "$TMP")" = 1 ] || { echo "verification failed: $n" >&2; exit 1; }
done
sync "$TMP"; mv -f "$TMP" "$WEB_ENV"; trap - EXIT
unset SECRET HMAC SITE
echo "updated $WEB_ENV; names present: $(grep -oE '^[A-Z_]+=' "$WEB_ENV" | tr -d '=' | tr '\n' ' ')"
if grep -q '^VIDFETCH_CONNECTION_READY=0$' "$WEB_ENV"; then echo "READY flag still 0 (expected). Frontend NOT restarted."; fi
