#!/usr/bin/env bash
# Usage: restore-full.sh BACKUP_DIR --yes
# Full return to the backed-up configuration: network (via restore-network.sh) AND environments, CI guard,
# gate files, Caddy unit and drop-ins, and the CI profile (removed if it did not exist). Files are restored
# byte-for-byte with their original owner and mode. It restarts NOTHING and prints what to restart.
# NOT restored on purpose: Caddy certificates/ACME state (caddy-state.tgz) so that renewed certificates are
# never overwritten with older ones; extract it manually only if the state directory itself was lost.
#
# Removals are limited to named files this toolkit creates. No directory is ever removed and nothing is removed
# recursively: a file the backup does not know is reported and left in place.
set -euo pipefail; umask 077
B=${1:?backup dir}; [ "${2:-}" = --yes ] || { echo "REFUSED: add --yes (this overwrites env files, the CI guard and the Caddy unit)" >&2; exit 1; }
[ "$(id -u)" = 0 ] || [ "${VM_SKIP_ROOT:-0}" = 1 ] || { echo "run as root" >&2; exit 1; }
# "-" (not ":-"): a set-but-empty override stays empty and is refused by the ":?" below.
ETC=${VM_ETC-/etc/vidfetch}; SYSD=${VM_SYSD-/etc/systemd/system}; SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}
refuse() { echo "REFUSED: $*" >&2; exit 1; }
real_dir() {  # absolute, normalised, existing real directory
  local value=${1:?empty path} what=$2
  [[ "$value" == /* && "$value" != / && "$value" != */ && "$value" != *//* && "$value" != *..* ]] || refuse "unexpected $what path: '$value'"
  [ -d "$value" ] && [ ! -L "$value" ] || refuse "$what is not a real directory: $value"
}
remove_one() {  # remove_one DIR NAME: one named regular file, or nothing
  local dir=${1:?empty directory} name=${2:?empty file name}
  [[ "$name" != */* && "$name" != . && "$name" != .. ]] || refuse "unexpected file name: '$name'"
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 0
  if [ -e "$dir/$name" ] || [ -L "$dir/$name" ]; then
    [ -f "$dir/$name" ] && [ ! -L "$dir/$name" ] || refuse "not removing $dir/$name: not a regular file"
    rm -f -- "$dir/$name"
  fi
}
real_dir "${ETC:?ETC is empty}" "configuration directory"; real_dir "${SYSD:?SYSD is empty}" "systemd directory"; real_dir "${B:?}" "backup directory"
# Without the test overrides, only the real locations are acceptable.
[ -n "${VM_ETC+set}" ] || [ "$ETC" = /etc/vidfetch ] || refuse "unexpected configuration directory"
[ -n "${VM_SYSD+set}" ] || [ "$SYSD" = /etc/systemd/system ] || refuse "unexpected systemd directory"
CADDY_UNIT=vidfetch-caddy.service
CADDY_DROPIN_DIR="${SYSD:?}/${CADDY_UNIT:?}.d"
[ "${CADDY_DROPIN_DIR%/*}" = "$SYSD" ] && [ "${CADDY_DROPIN_DIR##*/}" = vidfetch-caddy.service.d ] || refuse "unexpected Caddy drop-in directory: $CADDY_DROPIN_DIR"
if [ -e "$CADDY_DROPIN_DIR" ] || [ -L "$CADDY_DROPIN_DIR" ]; then [ -d "$CADDY_DROPIN_DIR" ] && [ ! -L "$CADDY_DROPIN_DIR" ] || refuse "Caddy drop-in path is not a real directory"; fi
[ -f "$B/MANIFEST.sha256" ] && [ -d "$B/etc-vidfetch-tree" ] || refuse "not a backup directory"
( cd "$B" && sha256sum --check --quiet MANIFEST.sha256 ) || refuse "backup integrity check failed"
"$B/restore-network.sh" "$B" || { echo "network restore incomplete; stopping before touching env files" >&2; exit 1; }
# whole tree back, byte for byte, owner/mode preserved (cp -a overwrites, it removes nothing)
cp -a "$B/etc-vidfetch-tree/." "$ETC/"
# then remove ONLY what media-test creates, one named file at a time
for name in Caddyfile.media-test Caddyfile.public Caddyfile.public-dl ingress.nft.media-test ingress.nft.public-dl media-test-ips.env; do remove_one "$ETC/public-https-test" "$name"; done
[ "$(cat "$B/ci-profile.state")" = present ] || remove_one "$ETC" ci-media-test-profile.json
# Caddy unit, then its drop-ins restored by name
CADDY_UNIT_FILE="${SYSD:?}/${CADDY_UNIT:?}"
[ "$CADDY_UNIT_FILE" = "$SYSD/vidfetch-caddy.service" ] || refuse "unexpected Caddy unit path"
install -o root -g root -m 0644 -- "$B/systemd/vidfetch-caddy.service" "$CADDY_UNIT_FILE"
SAVED="$B/systemd/$CADDY_UNIT.d"
if [ -d "$SAVED" ]; then
  [ -d "$CADDY_DROPIN_DIR" ] || install -d -o root -g root -m "$(stat -c %a "$SAVED")" -- "$CADDY_DROPIN_DIR"
  for file in "$SAVED"/*; do
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    install -o "$(stat -c %u "$file")" -g "$(stat -c %g "$file")" -m "$(stat -c %a "$file")" "$file" "$CADDY_DROPIN_DIR/${file##*/}"
  done
fi
[ -f "$SAVED/media-test.conf" ] || remove_one "$CADDY_DROPIN_DIR" media-test.conf
if [ -d "$CADDY_DROPIN_DIR" ]; then
  for file in "$CADDY_DROPIN_DIR"/*; do
    [ -e "$file" ] || continue
    [ -e "$SAVED/${file##*/}" ] || echo "NOTE: $file is not in the backup; it was left in place (remove it yourself if it is not wanted)"
  done
fi
$SYSTEMCTL daemon-reload
echo "restored $ETC (whole tree), the Caddy unit and its drop-ins; media-test files removed. Nothing restarted. If environments or the gateway origin were changed, restart ONLY what you need, e.g.:"
echo "  systemctl restart vidfetch-web-preproduction-20261013.service   (frontend env)"
echo "  systemctl restart vidfetch-gateway.service                      (gateway env; only with no active transfer)"
