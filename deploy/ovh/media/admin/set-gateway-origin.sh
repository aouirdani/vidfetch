#!/usr/bin/env bash
# Usage: set-gateway-origin.sh GATEWAY_ENV   -> VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app
# Edits ONE variable (backup first). Does NOT restart the gateway: do that only with explicit approval and no active transfer.
. "$(dirname "$0")/common.sh"; need_root
F=${1:?gateway env}; [ -f "$F" ] && [ ! -L "$F" ] && [ "$(stat -c %u "$F")" = 0 ] || die "unsafe file"
[ $(( 8#$(stat -c %a "$F") & 8#027 )) -eq 0 ] || die "unsafe permissions"
grep -q '^VIDFETCH_GATEWAY_ORIGIN=' "$F" || die "variable not present: inspect the file first"
cp -p "$F" "$F.bak.$(date -u +%Y%m%dT%H%M%SZ)"
T=$(mktemp "${F:?}.new.XXXXXX"); trap 'rm -f -- "${T:?}"' EXIT
grep -v '^VIDFETCH_GATEWAY_ORIGIN=' "$F" > "$T" || [ $? -le 1 ]
echo 'VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app' >> "$T"
chown --reference="$F" "$T"; chmod --reference="$F" "$T"; mv -f "$T" "$F"; trap - EXIT
log "updated. Gateway NOT restarted. Check first: no active transfer, SQLite quota file untouched."
