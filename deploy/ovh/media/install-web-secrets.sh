#!/usr/bin/env bash
# MANUAL, ADMINISTRATOR-ONLY. Run as root on the VPS, in a terminal you control.
# Merges Turnstile keys and the gateway HMAC key into the web environment file.
# Secrets are read with `read -s` (never echoed, never in argv, never in shell history)
# and are never printed. A timestamped root-only backup is made first.
#
# Usage: sudo ./install-web-secrets.sh /etc/vidfetch/web.env /etc/vidfetch/<gateway env file>
# VIDFETCH_CONNECTION_READY is deliberately NOT changed here: it stays 0 until
# the activation checklist (docs/VIDFETCH-PHASE9-ACTIVATION.md) reaches that step.
set -euo pipefail
umask 077
WEB_ENV=${1:?web env file}; GATEWAY_ENV=${2:?gateway env file}
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[ -f "$WEB_ENV" ] && [ -f "$GATEWAY_ENV" ] || { echo "env file missing" >&2; exit 1; }

BACKUP="$WEB_ENV.bak.$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$WEB_ENV" "$BACKUP"; chmod 600 "$BACKUP"; echo "backup: $BACKUP"

# The HMAC key is copied gateway -> web without ever being displayed.
HMAC=$(sed -n 's/^VIDFETCH_ACCESS_SIGNING_KEY=//p' "$GATEWAY_ENV" | head -n1)
[ -n "$HMAC" ] || { echo "VIDFETCH_ACCESS_SIGNING_KEY not found in gateway env" >&2; exit 1; }
read -r -p "Turnstile Site Key (public): " SITE
read -r -s -p "Turnstile Secret Key (hidden): " SECRET; echo
[[ "$SITE" =~ ^[A-Za-z0-9_-]{10,100}$ && "$SECRET" =~ ^[A-Za-z0-9_-]{10,100}$ ]] || { echo "unexpected key format; nothing changed" >&2; exit 1; }

TMP=$(mktemp "$WEB_ENV.new.XXXXXX")
trap 'rm -f "$TMP"' EXIT
# Drop previous values for these names, keep every other line untouched.
grep -vE '^(TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY|VIDFETCH_ACCESS_SIGNING_KEY|VIDFETCH_MEDIA_ORIGIN)=' "$WEB_ENV" > "$TMP" || true
{
  echo "VIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app"
  echo "TURNSTILE_SITE_KEY=$SITE"
  echo "TURNSTILE_SECRET_KEY=$SECRET"
  echo "VIDFETCH_ACCESS_SIGNING_KEY=$HMAC"
} >> "$TMP"
chown --reference="$WEB_ENV" "$TMP"; chmod 600 "$TMP"
mv "$TMP" "$WEB_ENV"; trap - EXIT
unset SECRET HMAC
echo "updated $WEB_ENV (names only): $(grep -oE '^[A-Z_]+=' "$WEB_ENV" | tr -d '=' | tr '\n' ' ')"
grep -q '^VIDFETCH_CONNECTION_READY=0' "$WEB_ENV" && echo "READY flag still 0 (expected). Frontend NOT restarted."
