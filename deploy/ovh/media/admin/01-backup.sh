#!/usr/bin/env bash
# Dated, root-only backup of everything the activation can change. Read-only on the system.
. "$(dirname "$0")/common.sh"; need_root
TS=$(date -u +%Y%m%dT%H%M%SZ); B="$BACKUPS/vidfetch-media-test-$TS"
[ ! -e "$B" ] || die "$B exists"; mkdir -m 0700 "$B" "$B/public-https-test" "$B/etc-vidfetch" "$B/systemd"
$NFT list ruleset > "$B/ruleset.nft"
$NFT list table inet vidfetch_https_test_ingress > "$B/ingress-table.nft"
cp -p "$BASE"/Caddyfile "$BASE"/Caddyfile.bootstrap "$BASE"/ingress.nft "$BASE"/auth.caddy "$B/public-https-test/"
readlink "$BASE/current" > "$B/current.target"
cp -p /etc/vidfetch/*.env /etc/vidfetch/*.json /etc/vidfetch/ci-web-test-ready "$B/etc-vidfetch/" 2>/dev/null || true
cp -p /etc/systemd/system/$CADDY_UNIT "$B/systemd/"; cp -a /etc/systemd/system/$CADDY_UNIT.d "$B/systemd/" 2>/dev/null || true
for u in $PROTECTED vidfetch-https-test-ingress.service $WEB_UNIT; do printf '%s %s %s\n' "$u" "$($SYSTEMCTL is-active $u)" "$($SYSTEMCTL show $u -pMainPID --value)"; done > "$B/units.txt"
readlink -f /opt/vidfetch-web-preproduction-20261013/current > "$B/frontend-release.path"
tar -C /var/lib -czf "$B/caddy-state.tgz" vidfetch-proxy   # ACME account + certificates (private keys): stays 0600
install -m 0700 "$(dirname "$0")/restore-network.sh" "$B/restore-network.sh"
( cd "$B" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )
ln -sfn "$B" "$BACKUPS/vidfetch-media-test-latest"
log "backup complete: $B ($(du -sh "$B" | cut -f1)), $(wc -l < "$B/MANIFEST.sha256") files, mode 0700. Contains secrets: keep root-only."
