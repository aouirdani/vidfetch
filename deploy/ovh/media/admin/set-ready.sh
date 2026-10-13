#!/usr/bin/env bash
# Usage: set-ready.sh 0|1  [WEB_ENV]. Changes only VIDFETCH_CONNECTION_READY and restarts ONLY the frontend unit.
# 1 is the activation step: never run it before 07-verify-tester.sh passed from the tester IP.
. "$(dirname "$0")/common.sh"; need_root
V=${1:?0|1}; F=${2:-/etc/vidfetch/web.env}; [[ "$V" =~ ^[01]$ ]] || die "0 or 1"
[ -f "$F" ] && [ ! -L "$F" ] && [ "$(stat -c %u "$F")" = 0 ] || die "unsafe file"
if [ "$V" = 1 ]; then
  [ -f /etc/vidfetch/ci-media-test-profile.json ] || die "install the CI media-test profile first (06-profile.sh)"
  for n in TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY VIDFETCH_ACCESS_SIGNING_KEY VIDFETCH_MEDIA_ORIGIN; do grep -q "^$n=" "$F" || die "$n missing from $F"; done
fi
cp -p "$F" "$F.bak.$(date -u +%Y%m%dT%H%M%SZ)"
T=$(mktemp "${F:?}.new.XXXXXX"); trap 'rm -f -- "${T:?}"' EXIT
grep -v '^VIDFETCH_CONNECTION_READY=' "$F" > "$T" || [ $? -le 1 ]; echo "VIDFETCH_CONNECTION_READY=$V" >> "$T"
chown --reference="$F" "$T"; chmod --reference="$F" "$T"; mv -f "$T" "$F"; trap - EXIT
$SYSTEMCTL restart $WEB_UNIT; sleep 3; $SYSTEMCTL is-active --quiet $WEB_UNIT || die "frontend not active: restore the .bak file"
log "READY=$V, only $WEB_UNIT restarted"
