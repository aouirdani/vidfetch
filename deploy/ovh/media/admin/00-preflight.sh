#!/usr/bin/env bash
# READ-ONLY. Prints state and names/hashes only: never environment values, keys or hashes of passwords.
. "$(dirname "$0")/common.sh"; need_root; set +e; export LC_ALL=C
echo "== toolkit revision $TOOLKIT_REVISION (must be 2 or later: older copies have a confirmation step that cannot work with OpenSSH 10)"
( cd "$(dirname "$0")" && sha256sum *.sh guard-update.py | cut -c1-16,65- | tr '\n' ' ' ); echo
LATEST=$(readlink -f "$BACKUPS/vidfetch-media-test-latest" 2>/dev/null)
if [ -n "$LATEST" ] && [ -d "$LATEST" ]; then if WHY=$(backup_problem "$LATEST"); then echo "  latest backup $LATEST: NOT usable ($WHY) -> run 01-backup.sh again before 03-network.sh"; else echo "  latest backup $LATEST: usable with this toolkit"; fi; else echo "  latest backup: none yet"; fi
echo "== time/host"; date -u +%FT%TZ; hostname; . /etc/os-release; echo "$PRETTY_NAME $(uname -r)"
echo "== SSH client as seen by the VPS: ${SSH_CONNECTION:-unknown}  (client_ip client_port server_ip port; empty under plain sudo: use sudo --preserve-env=SSH_CONNECTION)"
echo "== protected units (active / MainPID)"
for u in $PROTECTED vidfetch-https-test-ingress.service $WEB_UNIT; do printf '%-48s %-8s %s\n' "$u" "$($SYSTEMCTL is-active $u)" "$($SYSTEMCTL show $u -pMainPID --value)"; done
echo "== listeners on guarded ports"; ss -ltn | awk 'NR==1||$4 ~ /:(22|80|443|3000|3001|8788|8789)$/'
echo "== frontend release + health"
readlink -f /opt/vidfetch-web-preproduction-20261013/current
curl -s -m 5 http://127.0.0.1:3001/api/health | python3 -c 'import sys,json;d=json.load(sys.stdin);print("ok=%s release=%s downloads=%s"%(d.get("ok"),d.get("release"),d.get("downloads")))'
echo "== code actually running vs the active frontend release manifest (the CI guard compares manifests, not running files)"
MANIFEST=${VM_MANIFEST:-/opt/vidfetch-web-preproduction-20261013/current/manifest.json}
for pair in "vidfetch.service:backend/vidfetch-ovh.cjs:engine" "vidfetch-gateway.service:backend/vidfetch-gateway.cjs:gateway"; do
  unit=${pair%%:*}; rest=${pair#*:}; entry=${rest%%:*}; label=${rest#*:}
  file=$($SYSTEMCTL show "$unit" -p ExecStart --value 2>/dev/null | grep -o '/[^ ;]*\.cjs' | head -1)
  want=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["files"].get(sys.argv[2], ""))' "$MANIFEST" "$entry" 2>/dev/null)
  if [ -z "$file" ] || [ ! -r "$file" ]; then echo "  $label: running file not found from the unit"; continue; fi
  got=$(sha256sum "$file" | cut -c1-64)
  if [ "$got" = "$want" ]; then echo "  $label: running bundle = release manifest (${got:0:12})"
  else echo "  $label: DIFFERENT. running ${got:0:12} ($file), release manifest ${want:0:12}: the service does not run the code recorded in the release"; fi
done
echo "== frontend capability needed for the MP4/MP3 recette (key names only)"
curl -s -m 5 http://127.0.0.1:3001/api/download-access | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: print("  could not read /api/download-access from the frontend"); raise SystemExit
print("  runtime media origin supported by this release:", "yes" if "gatewayOrigin" in d else "NO")
if "gatewayOrigin" not in d: print("  NO-GO for the recette: this frontend predates the runtime media configuration. Deploy the current main (ready=0) through CI first.")
print("  downloads announced as available:", d.get("available"), "(must be False before activation)")'
echo "== non-secret settings"
grep -hE '^(VIDFETCH_CONNECTION_READY|VIDFETCH_TARGET|VIDFETCH_MEDIA_ORIGIN|VIDFETCH_GATEWAY_ORIGIN|VIDFETCH_SITE_ORIGINS)=' /etc/vidfetch/*.env 2>/dev/null | sed 's/^/  /' || true
for f in /etc/vidfetch/*.env; do [ -f "$f" ] && echo "  $f variable NAMES: $(grep -oE '^[A-Za-z0-9_]+=' "$f" | tr -d '=' | tr '\n' ' ')"; done
echo "== CI frontend deployment gate (must be open to deploy the frontend through CI, closed otherwise)"
if [ "$(cat /etc/vidfetch/ci-web-test-ready 2>/dev/null)" = APPROVED_FRONTEND_TEST ]; then echo "  gate: open"; else echo "  gate: closed"; fi
echo "== media-test files (absent before the first run; staged files may exist if 02-stage.sh already ran)"
for f in /etc/vidfetch/ci-media-test-profile.json $BASE/Caddyfile.media-test $BASE/ingress.nft.media-test $BASE/media-test-ips.env /etc/systemd/system/$CADDY_UNIT.d/media-test.conf; do [ -e "$f" ] && echo "  EXISTS $f" || echo "  absent $f"; done
echo "== Caddy: config pointer, unit, version, storage"
readlink "$BASE/current" || true; grep -E '^(ExecStart|ExecReload|EnvironmentFile)=' /etc/systemd/system/$CADDY_UNIT; ls /etc/systemd/system/$CADDY_UNIT.d/ 2>/dev/null; $CADDY version | head -1; du -sh /var/lib/vidfetch-proxy 2>/dev/null
echo "== firewall helper + ingress file (hash) + live table"
[ -x "$FW" ] && echo "firewall helper present: $FW" || echo "MISSING firewall helper $FW"; sha256sum "$BASE/ingress.nft" | cut -c1-16
$NFT list table inet vidfetch_https_test_ingress | sed -n '1,40p'
echo "== all nft tables"; $NFT list tables
echo "== sshd effective (no secrets)"; sshd -T 2>/dev/null | grep -E '^(port|passwordauthentication|permitrootlogin|pubkeyauthentication|allowusers|allowgroups) '
echo "== SSH login proof source (exactly what 04-confirm.sh reads: root sshd / sshd-session journal entries)"
PROOF=$($JOURNALCTL _UID=0 _COMM=sshd _COMM=sshd-session --since "-120min" --no-pager -o short-unix 2>/dev/null | grep -c 'Accepted publickey for ')
echo "  public-key logins logged by the SSH daemon in the last 120 min: $PROOF   (your own login must be counted: >= 1)"
[ "${PROOF:-0}" -ge 1 ] || echo "  NO-GO: 04-confirm.sh would find no proof on this system. Do NOT run 03-network.sh; send this output."
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
