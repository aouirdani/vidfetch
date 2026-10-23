#!/usr/bin/env bash
# Controlled upgrade of the running gateway to the bundle recorded in the active frontend release (main).
# Specific to the current OVH layout: engine and gateway run from /opt/vidfetch/releases/<dir>, started by
# vidfetch.service / vidfetch-gateway.service, and do NOT follow the frontend release pointer.
#
#   08-gateway.sh check    EXPECTED_SHA256                  read-only comparison and endpoint probe
#   08-gateway.sh upgrade  EXPECTED_SHA256 [--origin-dl]     one controlled gateway stop/start
#   08-gateway.sh rollback                                   back to the bundle, drop-in and environment saved by upgrade
#
# EXPECTED_SHA256 is the SHA-256 of backend/vidfetch-gateway.cjs built from main. upgrade proceeds only if the
# copy inside the active frontend release, that release's manifest and this value all agree.
# --origin-dl also sets VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app, so the audience change of the recette
# uses the same restart. Nothing else in the environment file changes; keys and secrets are never printed.
# The engine is left alone (it must already be the release's engine) and is not restarted.
# Not touched: sudoers, the CI account and its upload directory, nftables, Caddy, DNS, the CI guard.
# Any failure after the switch triggers the rollback automatically. upgrade and rollback refuse while downloads are open
# (ready=1): close them with 11-downloads.sh close first; 11-downloads.sh open refuses until the gateway matches the release.
#
# Path safety: the only directory this script creates or empties is the drop-in directory of
# vidfetch-gateway.service, validated below; it removes exactly one file there (its own drop-in), by name, and
# removes the directory only with rmdir, only if this script created it and it is empty.
. "$(dirname "$0")/common.sh"; need_root
ACTION=${1:-}; EXPECTED=${2:-}; OPTION=${3:-}

# "-" (not ":-"): a set-but-empty override stays empty and is refused by ":?" instead of silently becoming a default.
GW_UNIT=${VM_GW_UNIT-vidfetch-gateway.service}
SYSD=${VM_SYSD-/etc/systemd/system}
ENGINE_UNIT=vidfetch.service
[ "${GW_UNIT:?GW_UNIT is empty}" = vidfetch-gateway.service ] || die "this script only manages vidfetch-gateway.service, not '$GW_UNIT'"
GW_DROPIN_DIR=$(dropin_dir "${SYSD:?SYSD is empty}" "${GW_UNIT:?GW_UNIT is empty}")
[ "$GW_DROPIN_DIR" = "${SYSD:?}/vidfetch-gateway.service.d" ] || die "drop-in directory '$GW_DROPIN_DIR' is not the one of vidfetch-gateway.service"
# Outside the tests there is exactly one acceptable location.
if [ -z "${VM_SYSD+set}" ]; then [ "$GW_DROPIN_DIR" = /etc/systemd/system/vidfetch-gateway.service.d ] || die "unexpected drop-in directory: $GW_DROPIN_DIR"; fi
GW_DROPIN_NAME=20-gateway-release.conf
GW_DROPIN="${GW_DROPIN_DIR:?}/${GW_DROPIN_NAME:?}"
GW_UNIT_FILE="${SYSD:?}/${GW_UNIT:?}"

RELEASES=${VM_RELEASES-/opt/vidfetch/releases}
MANIFEST=${VM_MANIFEST-/opt/vidfetch-web-preproduction-20261013/current/manifest.json}
STATE_LINK="${BACKUPS:?}/vidfetch-gateway-upgrade-latest"
SETTLE=${VM_GATEWAY_SETTLE:-12}     # seconds the new process must stay up without a restart

sha() { sha256sum "$1" | cut -c1-64; }
unit_bundle() { $SYSTEMCTL show "$1" -p ExecStart --value | grep -o '/[^ ;]*\.cjs' | head -1; }
manifest_hash() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["files"].get(sys.argv[2], ""))' "${MANIFEST:?}" "$1"; }
env_file() { $SYSTEMCTL show "$GW_UNIT" -p EnvironmentFiles --value | awk '{print $1}'; }
pid_of() { $SYSTEMCTL show "$1" -p MainPID --value; }
root_owned() { [ -f "$1" ] && [ ! -L "$1" ] && [ "$(stat -c %u "$1")" = 0 ] && [ $(( 8#$(stat -c %a "$1") & 8#022 )) -eq 0 ]; }
running_bundle_of_pid() { tr '\0' '\n' < "/proc/$1/cmdline" 2>/dev/null | grep '\.cjs$' | head -1; }

# Endpoint probe on the loopback listener. Reads the origin and the signing key from the environment file to sign
# the service request; prints statuses and booleans only.
probe() {
  python3 - "$(env_file)" <<'PY'
import base64, hashlib, hmac, http.client, json, sys, time, uuid
env = {}
for line in open(sys.argv[1]):
    line = line.rstrip('\n')
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1); env[k.strip()] = v.strip().strip('"')
host = env.get('VIDFETCH_GATEWAY_ORIGIN', '').split('://', 1)[-1]
def req(path, extra=None, method='GET', body=None):
    try:
        c = http.client.HTTPConnection('127.0.0.1', 8789, timeout=6)
        h = {'Host': host, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1'}; h.update(extra or {})
        c.request(method, path, body=body, headers=h); r = c.getresponse(); data = r.read(262144); c.close()
        return r.status, data
    except OSError:
        return 0, b''
def signed():
    try: key = base64.urlsafe_b64decode(env.get('VIDFETCH_ACCESS_SIGNING_KEY', '') + '=')
    except ValueError: key = b''
    ts, nonce = str(int(time.time() * 1000)), str(uuid.uuid4())
    digest = base64.urlsafe_b64encode(hashlib.sha256(b'').digest()).decode().rstrip('=')
    payload = json.dumps({'timestamp': ts, 'nonce': nonce, 'body': digest}, separators=(',', ':')).encode()
    mac = base64.urlsafe_b64encode(hmac.new(key, payload, hashlib.sha256).digest()).decode().rstrip('=')
    return {'X-VidFetch-Service-Time': ts, 'X-VidFetch-Service-Nonce': nonce, 'X-VidFetch-Service-MAC': mac}
def js(data):
    try: return json.loads(data)
    except ValueError: return {}
# The gateway's own /api/health needs a signed grant, so an anonymous call must be refused: that refusal, together
# with the public helper page answering, is the liveness signal that works for the old and the new gateway alike.
print('api_health_anonymous=%d' % req('/api/health')[0])
try:
    e = http.client.HTTPConnection('127.0.0.1', 8788, timeout=6); e.request('GET', '/api/health', headers={'Host': '127.0.0.1:8788'}); r = e.getresponse(); j = js(r.read(65536)); e.close()
    print('engine_health=%d ok=%s isolation=%s' % (r.status, j.get('ok'), (j.get('engine') or {}).get('isolationProfile')))
except OSError:
    print('engine_health=0 ok=None isolation=None')
s, d = req('/auth/deployment', signed()); j = js(d)
print('deployment_signed=%d draining=%s active=%s waiting=%s' % (s, j.get('draining'), j.get('active'), j.get('waiting')))
print('deployment_unsigned=%d' % req('/auth/deployment')[0])
s, d = req('/download-helper?lang=fr')
print('helper_fr=%d localized=%s' % (s, b'<html lang="fr"' in d))
print('alive=%s' % (s == 200 and req('/api/health')[0] in (401, 403)))
print('unknown_path=%d' % req('/internal/nothing')[0])
print('fetch_info_anonymous=%d' % req('/api/fetch-info', {'Content-Type': 'application/json'}, 'POST', b'{}')[0])
print('origin_host=%s' % host)
PY
}
idle() {  # no client connection on the gateway port, no media process
  local c; c=$(ss -Htn state established '( sport = :8789 or dport = :8789 )' 2>/dev/null | wc -l)
  [ "$c" = 0 ] || { echo "$c established connection(s) on port 8789"; return 1; }
  if pgrep -x 'yt-dlp|yt-dlp_linux|ffmpeg|ffprobe' >/dev/null 2>&1; then echo "a media process (yt-dlp/ffmpeg/ffprobe) is running"; return 1; fi
}

report() {
  local run eng src
  run=$(unit_bundle "$GW_UNIT"); eng=$(unit_bundle "$ENGINE_UNIT"); src="$(dirname "$MANIFEST")/backend/vidfetch-gateway.cjs"
  echo "gateway running : $run"
  echo "    sha256      : $(sha "$run")"
  echo "expected        : $EXPECTED"
  echo "release copy    : $src"
  echo "    sha256      : $( [ -f "$src" ] && sha "$src" || echo MISSING)   manifest: $(manifest_hash backend/vidfetch-gateway.cjs)"
  echo "engine running  : $eng"
  echo "    sha256      : $(sha "$eng")   manifest: $(manifest_hash backend/vidfetch-ovh.cjs)"
  echo "units           : gateway $($SYSTEMCTL is-active "$GW_UNIT") pid $(pid_of "$GW_UNIT"), engine $($SYSTEMCTL is-active "$ENGINE_UNIT") pid $(pid_of "$ENGINE_UNIT")"
  echo "environment     : $(env_file) (variable names: $(grep -oE '^[A-Za-z0-9_]+=' "$(env_file)" | tr -d '=' | tr '\n' ' '))"
  echo "drop-in         : $GW_DROPIN $([ -e "$GW_DROPIN" ] && echo present || echo absent)"
  echo "idle            : $(idle && echo yes || true)"
  echo "endpoints       :"; probe | sed 's/^/    /'
}

# The running gateway changes only while downloads are closed (ready=0): during an upgrade or a rollback, the frontend
# and the gateway may come from different releases, and a frontend must never use an older gateway than its own.
# An unreadable or missing setting counts as open.
downloads_closed() { [ "$(ready_value 2>/dev/null)" = 0 ]; }

# Preconditions shared by check and upgrade; prints the first reason it cannot proceed and returns 0, else returns 1.
blocker() {
  local run src
  [[ "$EXPECTED" =~ ^[a-f0-9]{64}$ ]] || { echo "EXPECTED_SHA256 must be 64 hexadecimal characters"; return 0; }
  run=$(unit_bundle "$GW_UNIT"); src="$(dirname "$MANIFEST")/backend/vidfetch-gateway.cjs"
  [ -n "$run" ] && [ -r "$run" ] || { echo "cannot find the bundle the gateway unit runs"; return 0; }
  root_owned "$src" || { echo "release copy missing or not root-owned and read-only: $src"; return 0; }
  [ "$(sha "$src")" = "$EXPECTED" ] || { echo "the release copy does not have the expected SHA-256"; return 0; }
  [ "$(manifest_hash backend/vidfetch-gateway.cjs)" = "$EXPECTED" ] || { echo "the release manifest does not list the expected SHA-256"; return 0; }
  [ "$(sha "$(unit_bundle "$ENGINE_UNIT")")" = "$(manifest_hash backend/vidfetch-ovh.cjs)" ] || { echo "the running engine is not the engine of the release: out of scope for this script"; return 0; }
  $SYSTEMCTL is-active --quiet "$GW_UNIT" && $SYSTEMCTL is-active --quiet "$ENGINE_UNIT" || { echo "gateway or engine is not active"; return 0; }
  root_owned "$(env_file)" || { echo "gateway environment file missing or unsafe"; return 0; }
  root_owned "$GW_UNIT_FILE" || { echo "gateway unit file missing or unsafe: $GW_UNIT_FILE"; return 0; }
  return 1
}

# Puts back the drop-in state and the environment saved in backup $1, then one stop/start, then verification.
# It removes at most ONE file: this script's own drop-in.
restore_from() {
  local b=${1:?backup directory is empty} env prev saved
  safe_dir "$b" "backup directory"
  env=$(cat "$b/env-file.path"); prev=$(cat "$b/previous-bundle.path"); saved="$b/systemd/$GW_UNIT.d/$GW_DROPIN_NAME"
  [ "$env" = "$(env_file)" ] || { log "ROLLBACK REFUSED: the unit no longer uses the environment file recorded in the backup"; return 1; }
  log "ROLLBACK: restoring the drop-in state and the environment saved in $b"
  if [ -f "$saved" ] && [ ! -L "$saved" ]; then install -o root -g root -m 0644 -- "$saved" "$GW_DROPIN"      # an earlier drop-in of this script existed: put it back
  else remove_expected_file "$GW_DROPIN_DIR" "$GW_DROPIN_NAME"; fi
  if [ "$(cat "$b/dropin-dir.state" 2>/dev/null)" = absent ]; then remove_dir_if_empty "$GW_DROPIN_DIR"; fi
  cp -p -- "$b/env/${env##*/}" "$env.restore" && mv -f -- "$env.restore" "$env"
  $SYSTEMCTL daemon-reload
  $SYSTEMCTL stop "$GW_UNIT" || true
  $SYSTEMCTL reset-failed "$GW_UNIT" 2>/dev/null || true
  $SYSTEMCTL start "$GW_UNIT" || true
  local i=0 pid=""
  while [ $i -lt 20 ]; do pid=$(pid_of "$GW_UNIT"); if [ "${pid:-0}" != 0 ] && probe | grep -q '^alive=True'; then break; fi; i=$((i+1)); sleep 1; done
  pid=$(pid_of "$GW_UNIT")
  if [ "${pid:-0}" != 0 ] && [ "$(running_bundle_of_pid "$pid")" = "$prev" ] && [ "$(sha "$prev")" = "$(cat "$b/previous-bundle.sha256")" ] \
     && cmp -s "$b/env/${env##*/}" "$env" && probe | grep -q '^alive=True'; then
    date -u +%FT%TZ > "$b/rolled-back"; log "ROLLBACK VERIFIED: previous gateway running ($prev), environment identical to the backup, answering on 127.0.0.1:8789"
    return 0
  fi
  log "ROLLBACK NOT VERIFIED: inspect 'systemctl status $GW_UNIT' and 'journalctl -u $GW_UNIT'"; return 1
}

case "$ACTION" in
check)
  report
  if why=$(blocker); then echo "VERDICT: cannot upgrade: $why"; exit 1; fi
  if [ "$(sha "$(unit_bundle "$GW_UNIT")")" = "$EXPECTED" ]; then echo "VERDICT: the running gateway already is the expected bundle"; else echo "VERDICT: upgrade needed and possible"; fi
  ;;
upgrade)
  [ -z "$OPTION" ] || [ "$OPTION" = --origin-dl ] || die "unknown option $OPTION"
  take_lock
  if why=$(blocker); then die "$why"; fi
  downloads_closed || die "downloads are open (ready=$(ready_value)): close them first (11-downloads.sh close); the gateway only changes while no frontend can use it"
  safe_dir "${RELEASES:?RELEASES is empty}" "release directory"
  $SYSTEMCTL is-active --quiet $TIMER.timer && die "the network dead-man timer is armed: finish that step first"
  PREV=$(unit_bundle "$GW_UNIT"); ENV=$(env_file)
  if [ "$(sha "$PREV")" = "$EXPECTED" ] && { [ -z "$OPTION" ] || grep -q '^VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app$' "$ENV"; }; then log "nothing to do: the running gateway already is the expected bundle"; exit 0; fi
  if ! why=$(idle); then die "not idle: $why"; fi
  GW_PID=$(pid_of "$GW_UNIT"); ENGINE_PID=$(pid_of "$ENGINE_UNIT")
  # ---- backup: unit, drop-ins, environment, the release directory in use, state of things
  B=$(mktemp -d "$BACKUPS/vidfetch-gateway-upgrade-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX"); mkdir -m 0700 "$B/systemd" "$B/env" "$B/release" "$B/data"
  cp -p -- "$GW_UNIT_FILE" "$B/systemd/"
  if [ -d "$GW_DROPIN_DIR" ]; then cp -a -- "$GW_DROPIN_DIR" "$B/systemd/"; echo present > "$B/dropin-dir.state"; else echo absent > "$B/dropin-dir.state"; fi
  cp -p -- "$ENV" "$B/env/"; echo "$ENV" > "$B/env-file.path"
  cp -a -- "$(dirname "$PREV")/." "$B/release/"
  echo "$PREV" > "$B/previous-bundle.path"; sha "$PREV" > "$B/previous-bundle.sha256"; echo "$EXPECTED" > "$B/expected.sha256"
  cp -p -- "$MANIFEST" "$B/release-manifest.json"
  { echo "gateway_pid=$GW_PID engine_pid=$ENGINE_PID"; $SYSTEMCTL show "$GW_UNIT" -p ExecStart --value; } > "$B/before.txt"
  ( cd "$B" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 ); chmod 0600 "$B/MANIFEST.sha256"
  ln -sfn "$B" "$STATE_LINK"
  log "backup: $B (root only; contains the environment file)"
  # ---- new bundle in its own root-owned directory, never overwriting anything
  NEW_DIR="${RELEASES:?}/gateway-${EXPECTED:0:16}"; NEW="$NEW_DIR/vidfetch-gateway.cjs"
  if [ -e "$NEW" ]; then root_owned "$NEW" && [ "$(sha "$NEW")" = "$EXPECTED" ] || die "$NEW exists with other content or unsafe ownership"
  else install -d -o root -g root -m 0755 -- "$NEW_DIR"; install -o root -g root -m 0644 -- "$(dirname "$MANIFEST")/backend/vidfetch-gateway.cjs" "$NEW.new"; [ "$(sha "$NEW.new")" = "$EXPECTED" ] || die "copy verification failed"; mv -- "$NEW.new" "$NEW"; fi
  NODE=$($SYSTEMCTL show "$GW_UNIT" -p ExecStart --value | grep -o 'path=[^ ;]*' | head -1 | cut -d= -f2)
  "$NODE" --check "$NEW" || die "the new bundle does not parse with $NODE"
  # ---- the new ExecStart is the unit's own command line with only the bundle path replaced
  LINE=$(grep '^ExecStart=' "$GW_UNIT_FILE" | tail -1); ORIGINAL=$(grep -o '/[^ ]*\.cjs' <<< "$LINE" | head -1)
  [ -n "$ORIGINAL" ] || die "cannot find the bundle path in the unit file"
  NEWLINE=${LINE//"$ORIGINAL"/"$NEW"}
  [ "$(grep -o -- "$NEW" <<< "$NEWLINE" | wc -l)" = 1 ] || die "cannot derive the new ExecStart from the unit file"
  failed() { trap - ERR INT TERM; log "FAILED: $*"; restore_from "$B" || true; exit 1; }
  trap 'failed "interrupted or unexpected error"' ERR INT TERM
  # ---- switch: drop-in written next to its final name and moved into place, optional audience change, one stop/start
  [ -d "$GW_DROPIN_DIR" ] || install -d -o root -g root -m 0755 -- "${GW_DROPIN_DIR:?}"
  printf '# Installed by 08-gateway.sh on %s. Previous bundle: %s\n[Service]\nExecStart=\n%s\n' "$(date -u +%FT%TZ)" "$PREV" "$NEWLINE" > "$GW_DROPIN.new"
  chmod 0644 "$GW_DROPIN.new"; mv -f -- "$GW_DROPIN.new" "$GW_DROPIN"
  if [ "$OPTION" = --origin-dl ]; then      # one variable, same owner and mode; the upgrade backup holds the original
    T=$(mktemp "${ENV:?}.new.XXXXXX")
    grep -v '^VIDFETCH_GATEWAY_ORIGIN=' "$ENV" > "$T" || [ $? -le 1 ]
    echo 'VIDFETCH_GATEWAY_ORIGIN=https://dl.vidfetch.app' >> "$T"
    chown --reference="$ENV" "$T"; chmod --reference="$ENV" "$T"; mv -f -- "$T" "$ENV"
  fi
  $SYSTEMCTL daemon-reload
  $SYSTEMCTL stop "$GW_UNIT"
  DB=$(sed -n 's/^VIDFETCH_QUOTA_DB=//p' "$ENV" | tail -1)
  if [ -n "$DB" ] && [ -f "$DB" ]; then for part in "$DB" "$DB-wal" "$DB-shm"; do if [ -f "$part" ]; then cp -p -- "$part" "$B/data/"; fi; done; fi   # quota ledger, copied while nothing writes to it
  $SYSTEMCTL reset-failed "$GW_UNIT" 2>/dev/null || true     # an earlier attempt must not count against StartLimitBurst
  $SYSTEMCTL start "$GW_UNIT"
  # ---- verification; anything wrong rolls back
  i=0; OUT=""
  while [ $i -lt 25 ]; do OUT=$(probe); if grep -q '^alive=True' <<< "$OUT"; then break; fi; i=$((i+1)); sleep 1; done
  NEW_PID=$(pid_of "$GW_UNIT")
  [ "${NEW_PID:-0}" != 0 ] && [ "$NEW_PID" != "$GW_PID" ] || failed "the gateway did not start a new process"
  [ "$(running_bundle_of_pid "$NEW_PID")" = "$NEW" ] || failed "the running process does not execute $NEW"
  grep -q '^alive=True' <<< "$OUT" || failed "the gateway does not answer as expected: $(grep -E '^(helper_fr|api_health_anonymous)' <<< "$OUT" | tr '\n' ' ')"
  grep -q '^engine_health=200 ok=True' <<< "$OUT" || failed "the engine no longer answers its health check: $(grep '^engine_health' <<< "$OUT")"
  grep -q '^deployment_signed=200 draining=False active=False' <<< "$OUT" || failed "authenticated /auth/deployment not as expected: $(grep '^deployment_signed' <<< "$OUT")"
  grep -Eq '^deployment_unsigned=(401|403)$' <<< "$OUT" || failed "/auth/deployment must refuse an unauthenticated request: $(grep '^deployment_unsigned' <<< "$OUT")"
  grep -q '^helper_fr=200 localized=True' <<< "$OUT" || failed "translated download helper missing"
  grep -q '^unknown_path=404' <<< "$OUT" || failed "unknown paths must stay 404"
  grep -Eq '^fetch_info_anonymous=(401|403)$' <<< "$OUT" || failed "anonymous /api/fetch-info must be refused"
  [ "$(pid_of "$ENGINE_UNIT")" = "$ENGINE_PID" ] || failed "the engine was restarted"
  LISTEN=$(ss -Hltn | awk '{print $4}' | grep -E ':8789$' || true)
  [ "$LISTEN" = 127.0.0.1:8789 ] || failed "the gateway must listen on 127.0.0.1:8789 only (found: ${LISTEN:-nothing})"
  if [ "$OPTION" = --origin-dl ]; then
    cmp -s <(grep -v '^VIDFETCH_GATEWAY_ORIGIN=' "$B/env/${ENV##*/}") <(grep -v '^VIDFETCH_GATEWAY_ORIGIN=' "$ENV") || failed "the environment file changed beyond the gateway origin"
    grep -q '^origin_host=dl\.vidfetch\.app$' <<< "$OUT" || failed "audience not switched to dl.vidfetch.app"
  else cmp -s "$B/env/${ENV##*/}" "$ENV" || failed "the environment file changed"; fi
  [ "$(stat -c '%u:%g %a' "$ENV")" = "$(stat -c '%u:%g %a' "$B/env/${ENV##*/}")" ] || failed "owner or mode of the environment file changed"
  sleep "$SETTLE"
  [ "$(pid_of "$GW_UNIT")" = "$NEW_PID" ] && $SYSTEMCTL is-active --quiet "$GW_UNIT" || failed "the gateway restarted or stopped within ${SETTLE}s"
  trap - ERR INT TERM
  date -u +%FT%TZ > "$B/upgraded"
  log "UPGRADED: gateway pid $NEW_PID runs $NEW (sha256 ${EXPECTED:0:16}…), engine pid $ENGINE_PID untouched"
  echo "$OUT" | sed 's/^/    /'
  echo "Reconcile the CI guard ONLY after you are satisfied (this script did not change it):"
  echo "  sudo python3 $(dirname "$0")/guard-update.py add $GW_DROPIN $NEW"
  if [ "$OPTION" = --origin-dl ]; then echo "  sudo python3 $(dirname "$0")/guard-update.py accept $ENV"; fi
  echo "Rollback at any time: sudo bash $0 rollback"
  ;;
rollback)
  take_lock
  B=$(readlink -f "$STATE_LINK" 2>/dev/null) || true; [ -n "$B" ] && [ -f "$B/previous-bundle.path" ] || die "no gateway upgrade backup found"
  ( cd "$B" && sha256sum --check --quiet MANIFEST.sha256 ) || die "the backup fails its integrity check"
  downloads_closed || die "downloads are open (ready=$(ready_value)): close them first (11-downloads.sh close), so that no frontend ever uses an older gateway than its own"
  if ! why=$(idle); then die "not idle: $why"; fi
  restore_from "$B" || exit 1
  echo "If the CI guard had already been reconciled, put back its previous version (guard-update.py kept ci-web-test-guard.json.bak.<time>)."
  ;;
*) die "usage: $0 check EXPECTED_SHA256 | upgrade EXPECTED_SHA256 [--origin-dl] | rollback" ;;
esac
