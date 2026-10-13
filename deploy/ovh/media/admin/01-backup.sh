#!/usr/bin/env bash
# Dated, root-only backup of everything the activation can change. Read-only on the live system.
# It must describe the ORIGINAL state, so it refuses to run once the media-test changes are live.
. "$(dirname "$0")/common.sh"; need_root
take_lock
$SYSTEMCTL is-active --quiet $TIMER.timer && die "dead-man timer armed: confirm or cancel first"
[ ! -e "$DROPIN" ] || die "media-test drop-in present: system already modified; restore (04-cancel.sh) before a new backup"
grep -q 'testers4' "$BASE/ingress.nft" && die "ingress.nft already contains testers4: not the original state"
[ "$(basename "$(readlink "$BASE/current")")" != Caddyfile.media-test ] || die "Caddy already points at the media-test config: not the original state"
TS=$(date -u +%Y%m%dT%H%M%SZ); B="$BACKUPS/vidfetch-media-test-$TS"
[ ! -e "$B" ] || die "$B exists"; mkdir -m 0700 "$B" "$B/public-https-test" "$B/systemd"
trap 'rm -rf "$B"; echo "backup FAILED and was removed" >&2' ERR
$NFT list ruleset > "$B/ruleset.nft"
$NFT list table inet vidfetch_https_test_ingress > "$B/ingress-table.nft"
grep -q 'table inet vidfetch_https_test_ingress' "$B/ingress-table.nft"
for f in Caddyfile Caddyfile.bootstrap ingress.nft auth.caddy; do cp -p "$BASE/$f" "$B/public-https-test/$f"; done
TARGET=$(readlink "$BASE/current"); echo "$TARGET" > "$B/current.target"
[ -f "$B/public-https-test/$TARGET" ] || cp -p "$BASE/$TARGET" "$B/public-https-test/$TARGET"   # whatever the pointer serves is saved too
# the WHOLE /etc/vidfetch tree (env files, guard, gates, public-https-test), owner/mode/links preserved, then verified
cp -a /etc/vidfetch "$B/etc-vidfetch-tree"
diff -r /etc/vidfetch "$B/etc-vidfetch-tree" >/dev/null
[ -e /etc/vidfetch/ci-media-test-profile.json ] && echo present > "$B/ci-profile.state" || echo absent > "$B/ci-profile.state"
cp -p /etc/systemd/system/$CADDY_UNIT "$B/systemd/"; if [ -d /etc/systemd/system/$CADDY_UNIT.d ]; then cp -a /etc/systemd/system/$CADDY_UNIT.d "$B/systemd/"; fi
for u in $PROTECTED vidfetch-https-test-ingress.service $WEB_UNIT; do printf '%s %s %s\n' "$u" "$($SYSTEMCTL is-active $u)" "$($SYSTEMCTL show $u -pMainPID --value)"; done > "$B/units.txt"
readlink -f /opt/vidfetch-web-preproduction-20261013/current > "$B/frontend-release.path"
tar -C /var/lib -czf "$B/caddy-state.tgz" vidfetch-proxy   # ACME account + certificates (private keys): stays 0600
echo "$TOOLKIT_REVISION" > "$B/toolkit-revision"
install -m 0700 "$(dirname "$0")/restore-network.sh" "$B/restore-network.sh"
install -m 0700 "$(dirname "$0")/07-restore-full.sh" "$B/restore-full.sh"
( cd "$B" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )
# No chmod -R: copied files must keep their ORIGINAL owner/mode so a restore is exact. They are protected by the
# root-only 0700 top directory (umask 077 made it and every file this script writes itself).
chmod 0600 "$B/MANIFEST.sha256" "$B/caddy-state.tgz"
trap - ERR
ln -sfn "$B" "$BACKUPS/vidfetch-media-test-latest"
log "backup complete: $B ($(du -sh "$B" | cut -f1)), $(wc -l < "$B/MANIFEST.sha256") files, root-only (0700). It contains secrets: never copy it off the VPS unencrypted."
