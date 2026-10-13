#!/usr/bin/env bash
# READ-ONLY. Prints state and names/hashes only: never environment values, keys or hashes of passwords.
. "$(dirname "$0")/common.sh"; need_root; set +e; export LC_ALL=C
echo "== time/host"; date -u +%FT%TZ; hostname; . /etc/os-release; echo "$PRETTY_NAME $(uname -r)"
echo "== SSH client as seen by the VPS: ${SSH_CONNECTION:-unknown}  (client_ip client_port server_ip port; empty under plain sudo: use sudo --preserve-env=SSH_CONNECTION)"
echo "== protected units (active / MainPID)"
for u in $PROTECTED vidfetch-https-test-ingress.service $WEB_UNIT; do printf '%-48s %-8s %s\n' "$u" "$($SYSTEMCTL is-active $u)" "$($SYSTEMCTL show $u -pMainPID --value)"; done
echo "== listeners on guarded ports"; ss -ltn | awk 'NR==1||$4 ~ /:(22|80|443|3000|3001|8788|8789)$/'
echo "== frontend release + health"
readlink -f /opt/vidfetch-web-preproduction-20261013/current
curl -s -m 5 http://127.0.0.1:3001/api/health | python3 -c 'import sys,json;d=json.load(sys.stdin);print("ok=%s release=%s downloads=%s"%(d.get("ok"),d.get("release"),d.get("downloads")))'
echo "== non-secret settings"
grep -hE '^(VIDFETCH_CONNECTION_READY|VIDFETCH_TARGET|VIDFETCH_MEDIA_ORIGIN|VIDFETCH_GATEWAY_ORIGIN|VIDFETCH_SITE_ORIGINS)=' /etc/vidfetch/*.env 2>/dev/null | sed 's/^/  /' || true
for f in /etc/vidfetch/*.env; do [ -f "$f" ] && echo "  $f variable NAMES: $(grep -oE '^[A-Za-z0-9_]+=' "$f" | tr -d '=' | tr '\n' ' ')"; done
echo "== media-test prerequisites (absent = good)"
for f in /etc/vidfetch/ci-media-test-profile.json /etc/vidfetch/ci-web-test-ready $BASE/Caddyfile.media-test $BASE/media-test-ips.env /etc/systemd/system/$CADDY_UNIT.d/media-test.conf; do [ -e "$f" ] && echo "  EXISTS $f" || echo "  absent $f"; done
echo "== Caddy: config pointer, unit, version, storage"
readlink "$BASE/current" || true; grep -E '^(ExecStart|ExecReload|EnvironmentFile)=' /etc/systemd/system/$CADDY_UNIT; ls /etc/systemd/system/$CADDY_UNIT.d/ 2>/dev/null; $CADDY version | head -1; du -sh /var/lib/vidfetch-proxy 2>/dev/null
echo "== firewall helper + ingress file (hash) + live table"
[ -x "$FW" ] && echo "firewall helper present: $FW" || echo "MISSING firewall helper $FW"; sha256sum "$BASE/ingress.nft" | cut -c1-16
$NFT list table inet vidfetch_https_test_ingress | sed -n '1,40p'
echo "== all nft tables"; $NFT list tables
echo "== sshd effective (no secrets)"; sshd -T 2>/dev/null | grep -E '^(port|passwordauthentication|permitrootlogin|pubkeyauthentication|allowusers|allowgroups) '
echo "== sessions"; who
echo "== guarded files (path, current hash matches guard?)"
python3 - "$GUARD" <<'PY'
import hashlib, json, sys
files = json.load(open(sys.argv[1]))['files']
bad = 0
for path, want in sorted(files.items()):
    try: got = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    except OSError as e: got = 'UNREADABLE'
    ok = got == want; bad += not ok
    print('  %-4s %s' % ('ok' if ok else 'DIFF', path))
print('guard entries: %d, differing: %d' % (len(files), bad))
PY
echo "== backups present"; ls -d $BACKUPS/vidfetch-* 2>/dev/null
echo "== disk/memory"; df -h / | tail -1; free -m | sed -n 2p
