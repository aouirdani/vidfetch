#!/usr/bin/env bash
# Transactional activation of the engine and gateway from one verified CI release.
# Downloads remain closed and serialized against the public open/close switch throughout the transaction.
# Usage: 12-engine-release.sh check RELEASE_SHA ARCHIVE_SHA256
#        12-engine-release.sh apply RELEASE_SHA ARCHIVE_SHA256
#        12-engine-release.sh rollback
#
# The CI archive is first checked in /var/lib/vidfetch-deploy/ci-incoming, copied into
# /opt/vidfetch-ci-web/releases, and used as the frontend current release. The engine and
# gateway are installed as immutable files in /opt/vidfetch/releases/ci-<release>. Drop-ins
# change only ExecStart. guard-update.py adds the four new protected runtime files only after
# health checks. Nothing here changes secrets, environments, Caddy, firewall or sudo policy.
set -Eeuo pipefail
umask 077
. "$(dirname "$0")/common.sh"
need_root

ACTION=${1:-}
RELEASE=${2:-}
ARCHIVE_SHA=${3:-}
SYSTEMD=${VM_SYSD-/etc/systemd/system}
CI_STORE=${VM_CI_STORE-/opt/vidfetch-ci-web}
CI_INCOMING=${VM_CI_INCOMING-/var/lib/vidfetch-deploy/ci-incoming}
PROD_RELEASES=${VM_RELEASES-/opt/vidfetch/releases}
WEB_BASE=${VM_WEB_BASE-/opt/vidfetch-web-preproduction-20261013}
GUARD=${VM_GUARD-/etc/vidfetch/ci-web-test-guard.json}
GUARD_UPDATE=${VM_GUARD_UPDATE-$(dirname "$0")/guard-update.py}
RELEASE_LIB=${VM_RELEASE_LIB-/usr/local/libexec/vidfetch-ci/release-lib.py}
BACKUPS=${VM_BACKUPS-/var/backups}
SYSTEMCTL=${VM_SYSTEMCTL-${SYSTEMCTL:-systemctl}}
NODE=${VM_NODE-/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node}
WEB_UNIT=vidfetch-web-preproduction-20261013.service
ENGINE_UNIT=vidfetch.service
GATEWAY_UNIT=vidfetch-gateway.service
ENGINE_DROPIN_NAME=30-ci-engine-release.conf
GATEWAY_DROPIN_NAME=30-ci-gateway-release.conf
ENGINE_PATH_KEY=backend/vidfetch-ovh.cjs
GATEWAY_PATH_KEY=backend/vidfetch-gateway.cjs
# Serialize against promote.py, which uses the same lock file.
LOCK=${VM_LOCK-/opt/vidfetch-ci-web/lock}
DOWNLOADS_LOCK=${VM_DOWNLOADS_LOCK-/run/vidfetch-media-test.lock}
SETTLE=${VM_SETTLE_SECONDS:-5}

die() { echo "REFUSED: $*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
take_downloads_lock() {
  [[ "$DOWNLOADS_LOCK" == /* && "$DOWNLOADS_LOCK" != *..* && "$DOWNLOADS_LOCK" != *//* ]] || die "unsafe downloads lock path: $DOWNLOADS_LOCK"
  exec 8>"$DOWNLOADS_LOCK"
  flock -w 20 8 || die "another downloads or engine/gateway operation is active"
}
require_downloads_closed() {
  [ -f "$WEB_ENV" ] && [ ! -L "$WEB_ENV" ] || die "frontend environment is missing or unsafe: $WEB_ENV"
  local ready
  ready=$(ready_value 2>/dev/null || true)
  [ "$ready" = 0 ] || die "downloads must be closed (VIDFETCH_CONNECTION_READY=${ready:-unset}); run 11-downloads.sh close first"
}
sha() { sha256sum -- "$1" | cut -c1-64; }
root_file() {
  local f=$1
  [ -f "$f" ] && [ ! -L "$f" ] && [ "$(stat -c '%u' "$f")" = 0 ] && [ $(( 8#$(stat -c '%a' "$f") & 8#022 )) -eq 0 ]
}
safe_release_id() { [[ "${1:-}" =~ ^[a-f0-9]{40}$ ]]; }
safe_hash() { [[ "${1:-}" =~ ^[a-f0-9]{64}$ ]]; }
safe_root_dir() {
  local d=$1
  [[ "$d" == /* && "$d" != / && "$d" != */ && "$d" != *//* && "$d" != *..* ]] || die "unsafe directory path: $d"
  [ -d "$d" ] && [ ! -L "$d" ] || die "directory missing or symlinked: $d"
  [ "$(stat -c '%u' "$d")" = 0 ] && [ $(( 8#$(stat -c '%a' "$d") & 8#022 )) -eq 0 ] || die "directory must be root-owned and not group/world-writable: $d"
}
manifest_release() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release"])' "$1/manifest.json"; }
manifest_hash() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["files"].get(sys.argv[2], ""))' "$1/manifest.json" "$2"; }
manifest_check() {
  python3 - "$1" "$2" <<'PY'
import hashlib, json, pathlib, re, sys
root=pathlib.Path(sys.argv[1]); release=sys.argv[2]
data=json.loads((root/'manifest.json').read_text()); files=data.get('files',{})
if data.get('schema')!=1 or data.get('platform')!='linux-x64' or data.get('release')!=release: raise SystemExit('bad release manifest identity')
if not {'app/server.js','backend/vidfetch-ovh.cjs','backend/vidfetch-gateway.cjs'} <= set(files): raise SystemExit('required frontend/engine/gateway file missing')
actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name!='manifest.json'}
if actual!=set(files): raise SystemExit('manifest does not cover the complete release')
for name,want in files.items():
 if not re.fullmatch(r'[a-f0-9]{64}',want): raise SystemExit('invalid manifest checksum')
 h=hashlib.sha256((root/name).read_bytes()).hexdigest()
 if h!=want: raise SystemExit('release file checksum mismatch: '+name)
PY
}
archive_check() {
  local archive=$1 release=$2 expected=$3
  [ -f "$archive" ] && [ ! -L "$archive" ] || die "CI archive is missing or not a regular file: $archive"
  [ "$(stat -c '%s' "$archive")" -le $((350*1024*1024)) ] || die "CI archive exceeds 350 MiB"
  [ "$(sha "$archive")" = "$expected" ] || die "CI archive SHA-256 differs from the CI summary"
  python3 - "$archive" "$release" <<'PY'
import hashlib, json, re, sys, tarfile
archive, expected=sys.argv[1:]
with tarfile.open(archive,'r:gz') as tar:
 members=tar.getmembers()
 if len(members)>20000 or sum(m.size for m in members)>1200*1024**2: raise SystemExit('archive extraction bounds exceeded')
 names=[]
 for m in members:
  name=m.name.removeprefix('./').rstrip('/')
  if name in ('','.') and m.isdir(): continue
  if name.startswith('/') or '..' in name.split('/') or '\\' in name or name in names: raise SystemExit('unsafe or duplicate archive path')
  if not (m.isfile() or m.isdir()) or any(p.startswith('.env') for p in name.split('/')) or m.mode&0o6000: raise SystemExit('unsafe archive member')
  names.append(name)
 manifest_entry=next((m for m in members if m.name.removeprefix('./').rstrip('/')=='manifest.json'),None)
 if manifest_entry is None: raise SystemExit('manifest missing')
 manifest_member=tar.extractfile(manifest_entry)
 if manifest_member is None: raise SystemExit('manifest missing')
 data=json.load(manifest_member); files=data.get('files',{})
 if data.get('schema')!=1 or data.get('platform')!='linux-x64' or data.get('release')!=expected: raise SystemExit('manifest identity mismatch')
 if not {'app/server.js','backend/vidfetch-ovh.cjs','backend/vidfetch-gateway.cjs'}<=set(files): raise SystemExit('required frontend/engine/gateway file missing')
 actual={m.name.removeprefix('./').rstrip('/') for m in members if m.isfile() and m.name.removeprefix('./').rstrip('/')!='manifest.json'}
 if actual!=set(files): raise SystemExit('manifest does not cover complete archive: files='+repr(sorted(set(files)-actual))+' extra='+repr(sorted(actual-set(files))))
 for name,want in files.items():
  if not re.fullmatch(r'[a-f0-9]{64}',want): raise SystemExit('bad manifest checksum')
  entry=next((m for m in members if m.name.removeprefix('./').rstrip('/')==name),None)
  stream=tar.extractfile(entry) if entry is not None else None
  if stream is None: raise SystemExit('manifest file missing: '+name)
  h=hashlib.sha256()
  for chunk in iter(lambda:stream.read(65536),b''): h.update(chunk)
  if h.hexdigest()!=want: raise SystemExit('archive member checksum mismatch: '+name)
PY
}
secure_archive_copy() {
  local source=$1 destination
  destination=$(mktemp "$CI_STORE/staging/engine-archive-${RELEASE}.XXXXXX")
  python3 - "$source" "$destination" "$ARCHIVE_SHA" <<'PY'
import hashlib,os,pwd,stat,sys
source,target,expected=sys.argv[1:]
try: owner=pwd.getpwnam('vidfetch-deploy').pw_uid
except KeyError: owner=None
fd=os.open(source,os.O_RDONLY|os.O_NOFOLLOW)
try:
 st=os.fstat(fd)
 if not stat.S_ISREG(st.st_mode) or st.st_size>350*1024**2: raise SystemExit('incoming CI archive is not a bounded regular file')
 if owner is not None and st.st_uid!=owner: raise SystemExit('incoming archive owner is not vidfetch-deploy')
 out=os.open(target,os.O_WRONLY|os.O_TRUNC|os.O_NOFOLLOW)
 try:
  h=hashlib.sha256()
  while True:
   b=os.read(fd,65536)
   if not b: break
   h.update(b)
   view=memoryview(b)
   while view:
    n=os.write(out,view); view=view[n:]
  os.fsync(out)
 finally: os.close(out)
 if h.hexdigest()!=expected: raise SystemExit('incoming CI archive SHA-256 differs from the CI summary')
finally: os.close(fd)
PY
  chmod 0600 "$destination"
  printf '%s' "$destination"
}
unit_file() { printf '%s/%s' "$SYSTEMD" "$1"; }
dropin_dir() { printf '%s/%s.d' "$SYSTEMD" "$1"; }
effective_bundle() {
  local output
  output=$("$SYSTEMCTL" show "$1" -p ExecStart --value)
  grep -oE '/[^ ;}]+\.cjs' <<<"$output" | head -1
}
base_exec_line() {
  local f=$1 count line
  root_file "$f" || die "unit file is missing or unsafe: $f"
  count=$(grep -c '^ExecStart=' "$f" || true)
  [ "$count" = 1 ] || die "expected exactly one ExecStart in $f"
  line=$(grep '^ExecStart=' "$f")
  printf '%s' "$line"
}
replace_exec() {
  local line=$1 old=$2 new=$3 changed
  [[ "$old" == /opt/vidfetch/releases/*/*.cjs && "$old" != *[[:space:]]* ]] || die "unexpected existing executable path: $old"
  changed=${line/"$old"/"$new"}
  [ "$changed" != "$line" ] || die "unit ExecStart does not contain its release bundle path"
  [[ "$changed" != *"$old"* ]] || die "unit ExecStart path replacement was ambiguous"
  printf '%s' "$changed"
}
idle_check() {
  local count
  count=$(ss -Htn state established '( sport = :8789 or dport = :8789 )' 2>/dev/null | wc -l)
  [ "$count" = 0 ] || die "$count established gateway connection(s); retry after transfers finish"
  if pgrep -x 'yt-dlp|yt-dlp_linux|ffmpeg|ffprobe' >/dev/null 2>&1; then die "a media process is active; retry after it exits"; fi
}
python_health() {
  local expected=$1
python3 - "$expected" "${VM_SKIP_PUBLIC_ORIGIN:-0}" "${VM_GATEWAY_ORIGIN:-}" <<'PY'
import http.client,json,socket,ssl,sys,time
expected,skip_origin,gateway_origin=sys.argv[1:]
def get(port,path,headers=None):
 c=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
 try:
  c.request('GET',path,headers=headers or {}); r=c.getresponse(); body=r.read(262145); return r.status,body
 finally:c.close()
status,body=get(8788,'/api/health',{'Host':'127.0.0.1:8788'})
e=json.loads(body)
if status!=200 or e.get('ok') is not True or (e.get('engine') or {}).get('isolationProfile')!='vidfetch-uid-nft-v1': raise SystemExit('engine health/isolation check failed')
host=gateway_origin.split('://',1)[-1].split('/',1)[0] if gateway_origin else 'api.vidfetch.app'
status,body=get(8789,'/download-helper?lang=fr',{'Host':host})
if status!=200 or b'<html lang="fr"' not in body: raise SystemExit('gateway helper health check failed')
status,_=get(8789,'/api/health',{'Host':host})
if status not in (401,403): raise SystemExit('gateway anonymous health route was not refused')
status,body=get(3001,'/api/health')
w=json.loads(body)
if status!=200 or w.get('ok') is not True or w.get('release')!=expected or not isinstance((w.get('downloads') or {}).get('available'),bool): raise SystemExit('frontend release health check failed')
if get(3001,'/')[0]!=200: raise SystemExit('frontend homepage health check failed')
if skip_origin!='1':
 raw=socket.create_connection(('127.0.0.1',443),timeout=8)
 conn=http.client.HTTPSConnection('vidfetch.app',timeout=8)
 conn.sock=ssl.create_default_context().wrap_socket(raw,server_hostname='vidfetch.app')
 try:
  conn.request('GET','/'); r=conn.getresponse(); page=r.read(262144)
  if r.status!=200 or b'<meta name="robots" content="index, follow"' not in page or b'<link rel="canonical"' not in page or b'hreflang=' not in page: raise SystemExit('public Caddy/SEO health check failed')
 finally:conn.close()
print('health: engine=ok gateway=ok frontend='+expected+' public_indexing='+('skipped-test' if skip_origin=='1' else 'ok'))
PY
}
health_wait() {
  local expected=$1 output='' attempt
  for attempt in $(seq 1 30); do
    if output=$(VM_GATEWAY_ORIGIN=$(sed -n 's/^VIDFETCH_GATEWAY_ORIGIN=//p' /etc/vidfetch/gateway.env | tail -n1) python_health "$expected" 2>&1); then
      printf '%s\n' "$output"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "$output" >&2
  return 1
}
atomic_pointer() {
  local base=$1 target=$2 temp="$1/.current-engine-release-$$"
  ln -s -- "$target" "$temp"
  mv -Tf -- "$temp" "$base/current"
}
guard_list_clean() {
  local result
  result=$(python3 "$GUARD_UPDATE" --guard "$GUARD" list) || die "guard-update.py list failed"
  grep -q '0 differing$' <<<"$result" || die "CI guard has pre-existing differences: $result"
}
guard_reconcile() {
  local path current wanted
  local -a additions=() acceptances=()
  for path in "$@"; do
    current=$(python3 - "$GUARD" "$path" <<'PY'
import json,sys
print(json.load(open(sys.argv[1])).get('files',{}).get(sys.argv[2],''))
PY
)
    wanted=$(sha "$path")
    if [ -z "$current" ]; then additions+=("$path");
    elif [ "$current" != "$wanted" ]; then acceptances+=("$path");
    fi
  done
  ((${#additions[@]}==0)) || python3 "$GUARD_UPDATE" --guard "$GUARD" add "${additions[@]}"
  for path in "${acceptances[@]}"; do python3 "$GUARD_UPDATE" --guard "$GUARD" accept "$path"; done
}
write_dropin() {
  local unit=$1 name=$2 line=$3 dir="$SYSTEMD/$1.d" tmp
  [ ! -L "$dir" ] || die "unit drop-in directory is symlinked: $dir"
  if [ -e "$dir" ]; then [ -d "$dir" ] || die "unit drop-in path is not a directory: $dir"; else install -d -o root -g root -m 0755 -- "$dir"; fi
  [ ! -L "$dir/$name" ] || die "drop-in is a symlink: $dir/$name"
  tmp="$dir/.${name}.new.$$"
  { printf '# Installed by 12-engine-release.sh\n[Service]\nExecStart=\n'; printf '%s\n' "$line"; } > "$tmp"
  chown root:root "$tmp"; chmod 0644 "$tmp"; mv -f -- "$tmp" "$dir/$name"
}
restore_dropin() {
  local unit=$1 name=$2 backup=$3 dir="$SYSTEMD/$1.d" saved="$backup/systemd/$1.d/$2"
  if [ -f "$saved" ] && [ ! -L "$saved" ]; then install -o root -g root -m 0644 -- "$saved" "$dir/$name";
  else remove_expected_file "$dir" "$name"; fi
  if [ "$(cat "$backup/$unit-dropin-dir.state")" = absent ] && [ -d "$dir" ]; then rmdir -- "$dir" 2>/dev/null || true; fi
}
start_all() {
  "$SYSTEMCTL" daemon-reload
  "$SYSTEMCTL" reset-failed "$ENGINE_UNIT" "$GATEWAY_UNIT" "$WEB_UNIT" 2>/dev/null || true
  "$SYSTEMCTL" start "$ENGINE_UNIT"
  "$SYSTEMCTL" start "$GATEWAY_UNIT"
  "$SYSTEMCTL" restart "$WEB_UNIT"
}
stop_all() {
  "$SYSTEMCTL" stop "$GATEWAY_UNIT" || true
  "$SYSTEMCTL" stop "$ENGINE_UNIT" || true
}
restore_transaction() {
  local backup=$1 old_target old_release
  log "restoring backup $backup"
  safe_root_dir "$backup"
  (cd "$backup" && sha256sum --check --quiet MANIFEST.sha256) || die "transaction backup integrity check failed"
  old_target=$(cat "$backup/web-current.path"); old_release=$(cat "$backup/web-release")
  stop_all
  restore_dropin "$ENGINE_UNIT" "$ENGINE_DROPIN_NAME" "$backup"
  restore_dropin "$GATEWAY_UNIT" "$GATEWAY_DROPIN_NAME" "$backup"
  atomic_pointer "$WEB_BASE" "$old_target"
  if ! cmp -s "$GUARD" "$backup/ci-web-test-guard.json"; then
    install -o root -g root -m 0600 -- "$backup/ci-web-test-guard.json" "$GUARD"
  fi
  start_all
  health_wait "$old_release"
  guard_list_clean
  date -u +%FT%TZ > "$backup/rolled-back"
  log "ROLLBACK VERIFIED: previous engine, gateway and frontend release are healthy"
}
auto_rollback() {
  local status=$?
  trap - ERR INT TERM
  if [ -n "${ACTIVE_BACKUP:-}" ] && [ -d "$ACTIVE_BACKUP" ]; then
    if restore_transaction "$ACTIVE_BACKUP"; then
      echo "APPLY FAILED; ROLLBACK VERIFIED" >&2
    else
      echo "APPLY FAILED; ROLLBACK NOT VERIFIED. Keep services and backup for operator diagnosis: $ACTIVE_BACKUP" >&2
    fi
  else
    echo "APPLY FAILED before a transaction backup was created" >&2
  fi
  exit "$status"
}
release_archive() {
  [ -n "$RELEASE" ] && safe_release_id "$RELEASE" || die "release must be a 40-character lowercase CI SHA"
  safe_hash "$ARCHIVE_SHA" || die "archive SHA-256 must be 64 lowercase hexadecimal characters"
  printf '%s/%s.tgz' "$CI_INCOMING" "$RELEASE"
}
validate_common() {
  safe_root_dir "$SYSTEMD"; safe_root_dir "$CI_STORE"; safe_root_dir "$CI_STORE/releases"; safe_root_dir "$CI_STORE/staging"
  safe_root_dir "$PROD_RELEASES"; safe_root_dir "$WEB_BASE"; safe_root_dir "$BACKUPS"
  root_file "$GUARD" || die "CI guard missing or unsafe: $GUARD"
  root_file "$GUARD_UPDATE" || die "guard-update.py missing or unsafe: $GUARD_UPDATE"
  root_file "$RELEASE_LIB" || die "installed CI release validator missing or unsafe"
  root_file /etc/vidfetch/gateway.env || die "gateway environment file missing or unsafe"
  root_file "$(unit_file "$ENGINE_UNIT")" || die "engine unit file missing or unsafe"
  root_file "$(unit_file "$GATEWAY_UNIT")" || die "gateway unit file missing or unsafe"
  [ -L "$WEB_BASE/current" ] || die "frontend current pointer is not a symlink"
  local active
  active=$(readlink -f "$WEB_BASE/current")
  [[ "$active" == "$CI_STORE/releases/"* ]] || die "frontend current pointer is outside the CI release store: $active"
  [ -f "$active/manifest.json" ] || die "active frontend release has no manifest"
  local unit
  for unit in "$ENGINE_UNIT" "$GATEWAY_UNIT" "$WEB_UNIT"; do
    "$SYSTEMCTL" is-active --quiet "$unit" || die "service is inactive: $unit"
  done
}
check_release() {
  local archive=$1 target="$CI_STORE/releases/$RELEASE" active old_engine old_gateway
  archive_check "$archive" "$RELEASE" "$ARCHIVE_SHA"
  if [ -e "$target" ]; then
    [ -d "$target" ] && [ ! -L "$target" ] || die "CI release target exists but is not a directory"
    manifest_check "$target" "$RELEASE"
  fi
  active=$(readlink -f "$WEB_BASE/current")
  old_engine=$(effective_bundle "$ENGINE_UNIT"); old_gateway=$(effective_bundle "$GATEWAY_UNIT")
  [ -f "$old_engine" ] && [ -f "$old_gateway" ] || die "cannot locate running engine/gateway bundles"
  [ "$(sha "$old_engine")" = "$(manifest_hash "$active" "$ENGINE_PATH_KEY")" ] || die "running engine does not match active CI manifest"
  [ "$(sha "$old_gateway")" = "$(manifest_hash "$active" "$GATEWAY_PATH_KEY")" ] || die "running gateway does not match active CI manifest"
  guard_list_clean
  echo "VERDICT: CI archive verified; current engine/gateway match the active frontend manifest; CI guard clean"
  echo "current_frontend_release=$(manifest_release "$active")"
  echo "target_release=$RELEASE"
  echo "target_engine_sha256=$(manifest_hash_from_archive "$archive" "$ENGINE_PATH_KEY")"
  echo "target_gateway_sha256=$(manifest_hash_from_archive "$archive" "$GATEWAY_PATH_KEY")"
  echo "running_engine_sha256=$(sha "$old_engine")"
  echo "running_gateway_sha256=$(sha "$old_gateway")"
  echo "running_services=active; check operation made no changes"
}
manifest_hash_from_archive() {
  python3 - "$1" "$2" <<'PY'
import json,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as t:
 m=next((x for x in t.getmembers() if x.name.removeprefix('./').rstrip('/')=='manifest.json'),None)
 if m is None: raise SystemExit('manifest missing')
 d=json.load(t.extractfile(m))
 print(d['files'][sys.argv[2]])
PY
}
stage_ci_release() {
  local archive=$1 stage target
  target="$CI_STORE/releases/$RELEASE"
  if [ -e "$target" ]; then
    [ -d "$target" ] && [ ! -L "$target" ] || die "release target has unsafe type"
    manifest_check "$target" "$RELEASE"
    python3 - "$archive" "$target/manifest.json" <<'PY'
import json,sys,tarfile
with tarfile.open(sys.argv[1],'r:gz') as archive:
 member=next((m for m in archive.getmembers() if m.name.removeprefix('./').rstrip('/')=='manifest.json'),None)
 if member is None or json.load(archive.extractfile(member))!=json.load(open(sys.argv[2])): raise SystemExit('existing CI release differs from archive')
PY
    printf '%s\n' "$target"
    return 0
  fi
  stage=$(mktemp -d "$CI_STORE/staging/engine-release-${RELEASE}.XXXXXX")
  mkdir -m 0755 "$stage/release"
  python3 - "$RELEASE_LIB" "$archive" "$stage/release" "$RELEASE" <<'PY'
import runpy,sys
core=runpy.run_path(sys.argv[1])
core['extract_checked'](sys.argv[2], __import__('pathlib').Path(sys.argv[3]), sys.argv[4])
PY
  mv -- "$stage/release" "$target"
  rmdir -- "$stage"
  echo "$target"
}
install_runtime_bundles() {
  local source=$1 target="$PROD_RELEASES/ci-$RELEASE" engine gateway
  if [ -e "$target" ]; then
    [ -d "$target" ] && [ ! -L "$target" ] || die "runtime release target has unsafe type"
    [ "$(sha "$target/vidfetch-ovh.cjs")" = "$(manifest_hash "$source" "$ENGINE_PATH_KEY")" ] || die "existing runtime engine release differs"
    [ "$(sha "$target/vidfetch-gateway.cjs")" = "$(manifest_hash "$source" "$GATEWAY_PATH_KEY")" ] || die "existing runtime gateway release differs"
  else
    install -d -o root -g root -m 0755 -- "$target"
    install -o root -g root -m 0644 -- "$source/backend/vidfetch-ovh.cjs" "$target/vidfetch-ovh.cjs"
    install -o root -g root -m 0644 -- "$source/backend/vidfetch-gateway.cjs" "$target/vidfetch-gateway.cjs"
    install -o root -g root -m 0644 -- "$source/manifest.json" "$target/manifest.json"
  fi
  root_file "$target/vidfetch-ovh.cjs" && root_file "$target/vidfetch-gateway.cjs" || die "installed runtime bundles are unsafe"
  [ "$(sha "$target/vidfetch-ovh.cjs")" = "$(manifest_hash "$source" "$ENGINE_PATH_KEY")" ] || die "engine copy checksum mismatch"
  [ "$(sha "$target/vidfetch-gateway.cjs")" = "$(manifest_hash "$source" "$GATEWAY_PATH_KEY")" ] || die "gateway copy checksum mismatch"
  "$NODE" --check "$target/vidfetch-ovh.cjs"
  "$NODE" --check "$target/vidfetch-gateway.cjs"
  printf '%s\n' "$target"
}
make_backup() {
  local active=$1 engine=$2 gateway=$3 id
  id="vidfetch-engine-release-${RELEASE}-$(date -u +%Y%m%dT%H%M%SZ)"
  ACTIVE_BACKUP="$BACKUPS/$id"
  [ ! -e "$ACTIVE_BACKUP" ] || die "backup path already exists"
  install -d -o root -g root -m 0700 -- "$ACTIVE_BACKUP" "$ACTIVE_BACKUP/bundles" "$ACTIVE_BACKUP/systemd"
  cp -p -- "$engine" "$ACTIVE_BACKUP/bundles/vidfetch-ovh.cjs"
  cp -p -- "$gateway" "$ACTIVE_BACKUP/bundles/vidfetch-gateway.cjs"
  cp -p -- "$active/manifest.json" "$ACTIVE_BACKUP/active-manifest.json"
  cp -p -- "$GUARD" "$ACTIVE_BACKUP/ci-web-test-guard.json"
  readlink -f "$WEB_BASE/current" > "$ACTIVE_BACKUP/web-current.path"
  manifest_release "$active" > "$ACTIVE_BACKUP/web-release"
  printf '%s\n' "$RELEASE" > "$ACTIVE_BACKUP/target-release"
  local unit dir name
  for unit in "$ENGINE_UNIT" "$GATEWAY_UNIT"; do
    dir=$(dropin_dir "$unit"); name=$([ "$unit" = "$ENGINE_UNIT" ] && echo "$ENGINE_DROPIN_NAME" || echo "$GATEWAY_DROPIN_NAME")
    if [ -d "$dir" ]; then
      [ ! -L "$dir" ] || die "drop-in directory is symlinked: $dir"
      if [ -f "$dir/$name" ] && [ ! -L "$dir/$name" ]; then
        mkdir -p "$ACTIVE_BACKUP/systemd/$unit.d"; cp -p -- "$dir/$name" "$ACTIVE_BACKUP/systemd/$unit.d/$name"; echo present > "$ACTIVE_BACKUP/$unit-dropin.state"
      else echo absent > "$ACTIVE_BACKUP/$unit-dropin.state"; fi
      echo present > "$ACTIVE_BACKUP/$unit-dropin-dir.state"
    else echo absent > "$ACTIVE_BACKUP/$unit-dropin.state"; echo absent > "$ACTIVE_BACKUP/$unit-dropin-dir.state"; fi
  done
  { printf 'release=%s\n' "$RELEASE"; printf 'engine=%s\n' "$engine"; printf 'gateway=%s\n' "$gateway"; } > "$ACTIVE_BACKUP/before.txt"
  (cd "$ACTIVE_BACKUP" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256)
  chmod 0600 "$ACTIVE_BACKUP/MANIFEST.sha256"
  ln -sfn "$ACTIVE_BACKUP" "$BACKUPS/vidfetch-engine-release-latest"
  log "backup prepared at $ACTIVE_BACKUP"
}
apply_release() {
  local incoming archive active source runtime engine_old gateway_old engine_line gateway_line engine_new gateway_new
  take_downloads_lock
  require_downloads_closed
  incoming=$(release_archive)
  validate_common
  if why=$(release_drift); then die "engine/gateway process state is incompatible with the active release: $why"; fi
  archive=$(secure_archive_copy "$incoming")
  archive_check "$archive" "$RELEASE" "$ARCHIVE_SHA"
  active=$(readlink -f "$WEB_BASE/current")
  engine_old=$(effective_bundle "$ENGINE_UNIT"); gateway_old=$(effective_bundle "$GATEWAY_UNIT")
  [ -f "$engine_old" ] && [ -f "$gateway_old" ] || die "running engine/gateway paths cannot be resolved"
  [ "$(sha "$engine_old")" = "$(manifest_hash "$active" "$ENGINE_PATH_KEY")" ] || die "running engine differs from active CI release"
  [ "$(sha "$gateway_old")" = "$(manifest_hash "$active" "$GATEWAY_PATH_KEY")" ] || die "running gateway differs from active CI release"
  guard_list_clean
  if [ "$(manifest_release "$active")" = "$RELEASE" ] \
    && [ "$(sha "$engine_old")" = "$(manifest_hash_from_archive "$archive" "$ENGINE_PATH_KEY")" ] \
    && [ "$(sha "$gateway_old")" = "$(manifest_hash_from_archive "$archive" "$GATEWAY_PATH_KEY")" ]; then
    echo "ALREADY APPLIED: release $RELEASE is active; no services restarted"
    return 0
  fi
  idle_check
  source=$(stage_ci_release "$archive")
  runtime=$(install_runtime_bundles "$source")
  engine_line=$(base_exec_line "$(unit_file "$ENGINE_UNIT")")
  gateway_line=$(base_exec_line "$(unit_file "$GATEWAY_UNIT")")
  engine_new="$runtime/vidfetch-ovh.cjs"; gateway_new="$runtime/vidfetch-gateway.cjs"
  engine_line=$(replace_exec "$engine_line" "$(grep -oE '/[^ ;]+\.cjs' <<<"$engine_line" | head -1)" "$engine_new")
  gateway_line=$(replace_exec "$gateway_line" "$(grep -oE '/[^ ;]+\.cjs' <<<"$gateway_line" | head -1)" "$gateway_new")
  [ "$(manifest_release "$source")" = "$RELEASE" ] || die "CI release id does not match the requested sha"
  make_backup "$active" "$engine_old" "$gateway_old"
  trap auto_rollback ERR INT TERM
  stop_all
  idle_check
  write_dropin "$ENGINE_UNIT" "$ENGINE_DROPIN_NAME" "$engine_line"
  write_dropin "$GATEWAY_UNIT" "$GATEWAY_DROPIN_NAME" "$gateway_line"
  atomic_pointer "$WEB_BASE" "$source"
  "$SYSTEMCTL" daemon-reload
  "$SYSTEMCTL" reset-failed "$ENGINE_UNIT" "$GATEWAY_UNIT" "$WEB_UNIT" 2>/dev/null || true
  "$SYSTEMCTL" start "$ENGINE_UNIT"
  "$SYSTEMCTL" start "$GATEWAY_UNIT"
  "$SYSTEMCTL" restart "$WEB_UNIT"
  health_wait "$RELEASE"
  if why=$(release_drift); then die "engine/gateway processes do not match the activated release: $why"; fi
  # The guard update makes these installed bundles and narrow ExecStart drop-ins part of the protected baseline.
  guard_reconcile "$engine_new" "$gateway_new" \
    "$(dropin_dir "$ENGINE_UNIT")/$ENGINE_DROPIN_NAME" "$(dropin_dir "$GATEWAY_UNIT")/$GATEWAY_DROPIN_NAME"
  guard_list_clean
  # The same root helper used by automatic deploys must now accept this aligned release and guarded state.
  if [ "${VM_SKIP_PROMOTER_READY:-0}" != 1 ]; then
    [ -x "${VM_PROMOTER-/usr/local/libexec/vidfetch-ci/promote.py}" ] || die "installed CI promoter missing"
    "${VM_PROMOTER-/usr/local/libexec/vidfetch-ci/promote.py}" status
  fi
  sleep "$SETTLE"
  local unit
  for unit in "$ENGINE_UNIT" "$GATEWAY_UNIT" "$WEB_UNIT"; do "$SYSTEMCTL" is-active --quiet "$unit"; done
  [ "$(effective_bundle "$ENGINE_UNIT")" = "$engine_new" ] || die "engine ExecStart does not point at the new release"
  [ "$(effective_bundle "$GATEWAY_UNIT")" = "$gateway_new" ] || die "gateway ExecStart does not point at the new release"
  date -u +%FT%TZ > "$ACTIVE_BACKUP/applied"
  rm -f -- "$archive"
  trap - ERR INT TERM
  log "APPLIED: release $RELEASE; engine and gateway active; frontend current aligned; CI guard updated"
  echo "backup=$ACTIVE_BACKUP"
  echo "runtime_release=$runtime"
  echo "frontend_release=$source"
  echo "engine_sha256=$(sha "$engine_new")"
  echo "gateway_sha256=$(sha "$gateway_new")"
  echo "guard=clean"
  echo "Rollback: sudo bash $0 rollback"
}
main() {
  case "$ACTION" in
    check)
      [ $# = 3 ] || die "usage: $0 check RELEASE_SHA ARCHIVE_SHA256"
      RELEASE_ARCHIVE=$(release_archive); validate_common; check_release "$RELEASE_ARCHIVE"
      ;;
    apply)
      [ $# = 3 ] || die "usage: $0 apply RELEASE_SHA ARCHIVE_SHA256"
      exec 9>"$LOCK"; flock -w 20 9 || die "another engine-release operation is active"
      apply_release
      ;;
    rollback)
      [ $# = 1 ] || die "usage: $0 rollback"
      exec 9>"$LOCK"; flock -w 20 9 || die "another engine-release operation is active"
      take_downloads_lock
      require_downloads_closed
      local backup
      backup=$(readlink -f "$BACKUPS/vidfetch-engine-release-latest" 2>/dev/null) || die "no engine-release backup found"
      safe_root_dir "$backup"
      (cd "$backup" && sha256sum --check --quiet MANIFEST.sha256) || die "engine-release backup integrity check failed"
      local target
      target=$(cat "$backup/target-release")
      [ "$(manifest_release "$(readlink -f "$WEB_BASE/current")")" = "$target" ] || die "frontend has moved since this backup; refusing stale rollback"
      idle_check
      restore_transaction "$backup"
      ;;
    *) die "usage: $0 check RELEASE_SHA ARCHIVE_SHA256 | apply RELEASE_SHA ARCHIVE_SHA256 | rollback" ;;
  esac
}
main "$@"
