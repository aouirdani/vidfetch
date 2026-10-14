# Sourced by the administrator scripts. Paths come from the installed Phase 5 / CI layout.
# The VM_* overrides exist ONLY for the offline tests; sudo resets the environment by default.
set -euo pipefail
umask 077
BASE=${VM_BASE:-/etc/vidfetch/public-https-test}
FW=${VM_FW:-/usr/local/libexec/vidfetch-https-test-firewall}
CADDY=${VM_CADDY:-/opt/vidfetch/tools/caddy-2.11.7/caddy}
GUARD=${VM_GUARD:-/etc/vidfetch/ci-web-test-guard.json}
BACKUPS=${VM_BACKUPS:-/var/backups}
SYSTEMCTL=${VM_SYSTEMCTL:-systemctl}
NFT=${VM_NFT:-nft}
JOURNALCTL=${VM_JOURNALCTL:-journalctl}
LOCKFILE=${VM_LOCK:-/run/vidfetch-media-test.lock}
LOCK_WAIT=${VM_LOCK_WAIT:-15}
# Caddy's media-test drop-in. "-" (not ":-"): a set-but-empty override stays empty and is refused where it is used.
DROPIN=${VM_DROPIN-/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf}
[[ "${DROPIN:?DROPIN is empty}" == /*/vidfetch-caddy.service.d/media-test.conf && "$DROPIN" != *..* && "$DROPIN" != *//* ]] || { echo "REFUSED: unexpected Caddy drop-in path: $DROPIN" >&2; exit 1; }
CONFIRM_MARGIN=${VM_CONFIRM_MARGIN:-3}   # seconds after the rules went live before a login can count
CADDY_UNIT=vidfetch-caddy.service
WEB_UNIT=vidfetch-web-preproduction-20261013.service
TIMER=vidfetch-media-rollback
# Caddy window (05-caddy.sh): its own dead-man timer, armed only once the network window is confirmed.
CADDY_TIMER=vidfetch-caddy-rollback
CURL=${VM_CURL:-curl}
# Bumped whenever the backup layout or the restore logic changes. Revision 1 = scripts merged with PR #4.
# The Caddy window changed neither (restore-caddy.sh is copied into the backup when 05-caddy.sh arms it): a
# revision 2 backup taken before 03-network.sh stays valid for 05-caddy.sh.
TOOLKIT_REVISION=2
PROTECTED="ssh.service vidfetch.service vidfetch-gateway.service vidfetch-web-candidate.service vidfetch-caddy.service"
need_root() { [ "${VM_SKIP_ROOT:-0}" = 1 ] || [ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }; }
log() { printf '[%s] %s\n' "$(date -u +%T)" "$*"; }
die() { echo "REFUSED: $*" >&2; exit 1; }
latest_backup() { local b; b=$(readlink -f "$BACKUPS/vidfetch-media-test-latest" 2>/dev/null) || true; [ -n "$b" ] && [ -d "$b" ] || die "no backup: run 01-backup.sh first"; echo "$b"; }
# ---- path safety -------------------------------------------------------------------------------------------
# Nothing is created or removed at a path built from an empty or unexpected value. Callers pass variables as
# "${VAR:?}" so an empty one stops the script before any path is assembled.
# safe_dir PATH [WHAT]: absolute, normalised (no "..", "//", trailing "/"), not "/", an existing real directory.
safe_dir() {
  local value=${1:?safe_dir: empty path} what=${2:-directory}
  [[ "$value" == /* && "$value" != / && "$value" != */ && "$value" != *//* && "$value" != *..* && "$value" != *$'\n'* ]] || die "unexpected $what path: '$value'"
  [ -d "$value" ] && [ ! -L "$value" ] || die "$what is not a real directory: $value"
}
# dropin_dir SYSTEMD_DIR UNIT: prints SYSTEMD_DIR/UNIT.d after checking both parts and the assembled result.
dropin_dir() {
  local sysd=${1:?dropin_dir: systemd directory is empty} unit=${2:?dropin_dir: unit name is empty} dir
  [[ "$unit" =~ ^[a-z0-9][a-z0-9-]*\.service$ ]] || die "unexpected unit name: '$unit'"
  safe_dir "$sysd" "systemd directory"
  dir="$sysd/$unit.d"
  [ "${dir%/*}" = "$sysd" ] && [ "${dir##*/}" = "$unit.d" ] || die "unexpected drop-in path: $dir"
  if [ -e "$dir" ] || [ -L "$dir" ]; then [ -d "$dir" ] && [ ! -L "$dir" ] || die "drop-in path is not a real directory: $dir"; fi
  printf '%s' "$dir"
}
# remove_expected_file DIR NAME: removes that one regular file and nothing else. A directory or a symlink at that
# name is refused; an absent file is fine. There is deliberately no recursive removal anywhere in these scripts.
remove_expected_file() {
  local dir=${1:?remove_expected_file: directory is empty} name=${2:?remove_expected_file: file name is empty}
  [[ "$name" != */* && "$name" != . && "$name" != .. && "$name" != *$'\n'* ]] || die "unexpected file name: '$name'"
  [[ "$dir" == /* && "$dir" != / && "$dir" != */ && "$dir" != *//* && "$dir" != *..* ]] || die "unexpected directory: '$dir'"
  [ -d "$dir" ] || return 0
  [ ! -L "$dir" ] || die "refusing to remove inside a symlinked directory: $dir"
  if [ -e "$dir/$name" ] || [ -L "$dir/$name" ]; then
    [ -f "$dir/$name" ] && [ ! -L "$dir/$name" ] || die "refusing to remove $dir/$name: not a regular file"
    rm -f -- "$dir/$name"
  fi
}
# remove_dir_if_empty DIR: rmdir only; a directory that still holds anything is left alone and reported.
remove_dir_if_empty() {
  local dir=${1:?remove_dir_if_empty: directory is empty}
  [[ "$dir" == /* && "$dir" != / && "$dir" != */ && "$dir" != *//* && "$dir" != *..* ]] || die "unexpected directory: '$dir'"
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 0
  rmdir -- "$dir" 2>/dev/null || log "left in place (not empty): $dir"
}

# One media-test operation at a time (03, 05, confirm, cancel, backup, and the dead-man restore itself).
take_lock() { exec 9>"$LOCKFILE" || die "cannot open $LOCKFILE"; flock -w "$LOCK_WAIT" 9 || die "another media-test operation (or the automatic restore) is running; wait for it"; }
# Set by restore-network.sh once it ran (fully or partially): the window is over, nothing may continue it.
restored_marker() { [ -e "$1/restore-started" ] || [ -e "$1/restored" ]; }
# The dead-man timer runs the restore script stored INSIDE the backup. A backup taken by an older copy of these
# scripts would therefore run the older restore: refuse it and ask for a fresh backup.
backup_problem() {
  [ "$(cat "$1/toolkit-revision" 2>/dev/null)" = "$TOOLKIT_REVISION" ] || { echo "it was made by another revision of these scripts (expected revision $TOOLKIT_REVISION)"; return 0; }
  cmp -s "$1/restore-network.sh" "$(dirname "$0")/restore-network.sh" || { echo "its restore script differs from the one in this directory"; return 0; }
  [ -d "$1/etc-vidfetch-tree" ] && [ -f "$1/restore-full.sh" ] && [ -f "$1/ingress-table.nft" ] || { echo "it is incomplete"; return 0; }
  return 1
}
require_current_backup() { local why; if why=$(backup_problem "$1"); then die "backup $1 cannot be used: $why. Run 01-backup.sh again (the system must still be in its original state)."; fi; }

# ---- Caddy window (05-caddy.sh, 05-confirm.sh, 05-cancel.sh, restore-caddy.sh) ------------------------------
# Set by restore-caddy.sh once it ran: that Caddy window is over.
caddy_restored_marker() { [ -e "$1/caddy-restore-started" ] || [ -e "$1/caddy-restored" ]; }
dropin_text() { printf '[Service]\nEnvironmentFile=%s/media-test-ips.env\n' "$BASE"; }
# tester_list: the validated /32 IPv4 list from the staged tester configuration (same rules as 04-confirm.sh).
tester_list() {
  local list
  [ -f "$BASE/media-test-ips.env" ] || die "tester configuration missing: run 02-stage.sh"
  list=$(sed -n 's/^VIDFETCH_MEDIA_TEST_IPS=//p' "$BASE/media-test-ips.env" | tail -n1)
  [[ "$list" =~ ^([0-9]{1,3}(\.[0-9]{1,3}){3}/32)( [0-9]{1,3}(\.[0-9]{1,3}){3}/32)*$ ]] || die "tester list must be /32 IPv4 entries"
  [ "$list" != "192.0.2.1/32" ] || die "placeholder tester list"
  printf '%s' "$list"
}
# network_window_problem BACKUP: prints why the network rules are NOT confirmed and live (status 0), else status 1.
network_window_problem() {
  local b=$1 table
  if restored_marker "$b"; then echo "the network rules were restored (dead-man timer or 04-cancel.sh): redo 03-network.sh, the new SSH login and 04-confirm.sh"; return 0; fi
  if $SYSTEMCTL is-active --quiet $TIMER.timer; then echo "the network dead-man timer is still armed: new SSH login from the tester IP, then run 04-confirm.sh first"; return 0; fi
  if $SYSTEMCTL is-active --quiet $TIMER.service; then echo "the network restore is running"; return 0; fi
  [ -e "$b/confirmed" ] || { echo "the network window is not confirmed: open a NEW SSH connection from the tester IP, then run 04-confirm.sh"; return 0; }
  cmp -s "$BASE/ingress.nft" "$BASE/ingress.nft.media-test" || { echo "the live ingress.nft is not the staged media-test ingress"; return 0; }
  table=$($NFT list table inet vidfetch_https_test_ingress 2>/dev/null) || { echo "cannot read the live nft table"; return 0; }
  grep -q 'testers4' <<< "$table" || { echo "the live nft table has no tester set"; return 0; }
  return 1
}
# origin HOST METHOD PATH: response headers, then "STATUS:<code>", from the REAL origin on this VPS (127.0.0.1:443)
# under its public hostname with strict TLS (system CA store and hostname check), as the CI promoter probes it.
# STATUS:000 means no HTTP answer, e.g. no trusted certificate for HOST yet.
origin() {
  local host=${1:?} method=${2:?} path=${3:?} data=()
  [ "$method" != POST ] || data=(-H 'Content-Type: application/json' --data '{}')
  $CURL -s -m 10 -o /dev/null -D - -w 'STATUS:%{http_code}' -X "$method" "${data[@]}" --resolve "$host:443:127.0.0.1" "https://$host$path" 2>/dev/null || true
}
# Apex protections. BASE holds on both Caddy configurations (the CI promoter's list); MEDIA is what the media-test
# configuration adds (the promoter's media-test list): /api/download-access reaches the site only behind Basic Auth.
APEX_BASE="GET:/:401 GET:/fr/:401 GET:/api/download:503 GET:/api/fetch-info:503 GET:/sitemap.xml:404"
APEX_MEDIA="POST:/api/download-access:401 GET:/api/download-access:401 GET:/api/queue:503 GET:/auth/transfer:503 GET:/download-helper:503"
# apex_protected base|media: every listed route answers as expected with noindex (and a Basic challenge on 401).
apex_protected() {
  local list=$APEX_BASE spec method path want out code fails=0
  [ "${1:?base or media}" = base ] || list="$APEX_BASE $APEX_MEDIA"
  for spec in $list; do
    IFS=: read -r method path want <<< "$spec"
    out=$(origin vidfetch.app "$method" "$path"); code=${out##*STATUS:}
    if [ "$code" != "$want" ]; then echo "  apex $method $path: HTTP $code, expected $want"; fails=1; continue; fi
    grep -qi '^x-robots-tag:.*noindex' <<< "$out" || { echo "  apex $method $path: no noindex header"; fails=1; }
    [ "$want" != 401 ] || grep -qi '^www-authenticate: *basic' <<< "$out" || { echo "  apex $method $path: 401 without a Basic Auth challenge"; fails=1; }
  done
  return $fails
}
# dl_gated: dl.vidfetch.app presents a publicly trusted certificate and refuses this VPS (loopback is never a
# tester) on every route, gateway routes included, with its own noindex / no-referrer headers.
dl_gated() {
  local spec method path want out code fails=0
  for spec in GET:/:403 GET:/api/fetch-info:403 POST:/api/download:403; do
    IFS=: read -r method path want <<< "$spec"
    out=$(origin dl.vidfetch.app "$method" "$path"); code=${out##*STATUS:}
    if [ "$code" = 000 ]; then echo "  dl: no HTTPS answer with a trusted certificate (not issued yet? journalctl -u $CADDY_UNIT)"; return 1; fi
    if [ "$code" != "$want" ]; then echo "  dl $method $path from a non-tester: HTTP $code, expected $want"; fails=1; continue; fi
    grep -qi '^x-robots-tag:.*noindex' <<< "$out" && grep -qi '^referrer-policy: *no-referrer' <<< "$out" || { echo "  dl $method $path: noindex / no-referrer headers missing"; fails=1; }
  done
  return $fails
}

# ---- public launch (05-caddy.sh --public) ----------------------------------------------------------------------
# The CI promoter reads one root-owned profile file; its content selects the profile (absent = closed).
CI_PROFILE=${VM_PROFILE-/etc/vidfetch/ci-media-test-profile.json}
CI_HELPER=${VM_CI_HELPER-/usr/local/libexec/vidfetch-ci/promote.py}
MEDIA_PROFILE_JSON='{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}'
PUBLIC_PROFILE_JSON='{"profile":"public","apex":"public-indexable","dl":"testers-only"}'
ci_profile_path() {
  [[ "${CI_PROFILE:?CI profile path is empty}" == /*/ci-media-test-profile.json && "$CI_PROFILE" != *..* && "$CI_PROFILE" != *//* ]] || die "unexpected CI profile path: $CI_PROFILE"
  printf '%s' "$CI_PROFILE"
}
# ci_profile_name: closed | media-test | public | unknown
ci_profile_name() {
  local p; p=$(ci_profile_path)
  if [ ! -e "$p" ] && [ ! -L "$p" ]; then echo closed; return; fi
  [ -f "$p" ] && [ ! -L "$p" ] || { echo unknown; return; }
  case "$(cat "$p")" in "$MEDIA_PROFILE_JSON") echo media-test ;; "$PUBLIC_PROFILE_JSON") echo public ;; *) echo unknown ;; esac
}
# write_public_profile: atomic, root-owned 0644, exactly what the promoter accepts.
write_public_profile() {
  local p; p=$(ci_profile_path)
  printf '%s\n' "$PUBLIC_PROFILE_JSON" > "$p.new" && chown root:root "$p.new" && chmod 0644 "$p.new" && mv -f "$p.new" "$p"
}
# remove_public_profile: removes the profile file only when it is exactly the public one (never a media-test one).
remove_public_profile() {
  local p; p=$(ci_profile_path)
  [ "$(ci_profile_name)" = public ] || return 0
  remove_expected_file "${p%/*}" "${p##*/}"
}
urldecode() { local s=${1//+/ }; printf '%b' "${s//%/\\x}"; }
# origin_page HOST METHOD PATH: like origin(), with the body between the headers and "STATUS:<code>".
origin_page() {
  local host=${1:?} method=${2:?} path=${3:?} data=()
  [ "$method" != POST ] || data=(-H 'Content-Type: application/json' --data '{}')
  $CURL -s -m 15 -D - -w '\nSTATUS:%{http_code}' -X "$method" "${data[@]}" --resolve "$host:443:127.0.0.1" "https://$host$path" 2>/dev/null || true
}
# apex_public: the public apex as a search engine sees it, on the real origin (loopback, strict TLS). Prints one
# summary line per check group, and "  ..." lines for failures; status 1 if anything is wrong.
apex_public() {
  local fails=0 out code locs loc path n=0 canonical spec method want
  out=$(origin_page vidfetch.app GET /sitemap.xml); code=${out##*STATUS:}
  if [ "$code" != 200 ]; then echo "  sitemap.xml: HTTP $code, expected 200"; return 1; fi
  locs=$(grep -o '<loc>[^<]*</loc>' <<< "$out" | sed 's#</*loc>##g')
  [ -n "$locs" ] || { echo "  sitemap.xml lists no URL"; return 1; }
  while IFS= read -r loc; do
    n=$((n+1))
    case "$loc" in https://vidfetch.app/*) path=${loc#https://vidfetch.app} ;; *) echo "  sitemap URL outside https://vidfetch.app/: $loc"; fails=1; continue ;; esac
    out=$(origin_page vidfetch.app GET "$path"); code=${out##*STATUS:}
    if [ "$code" != 200 ]; then echo "  $path: HTTP $code, expected 200"; fails=1; continue; fi
    if grep -qi '^x-robots-tag:.*noindex' <<< "$out"; then echo "  $path: X-Robots-Tag noindex"; fails=1; fi
    if grep -qi '^www-authenticate:' <<< "$out"; then echo "  $path: asks for credentials"; fails=1; fi
    if grep -qiE '<meta name="robots" content="[^"]*noindex' <<< "$out"; then echo "  $path: robots meta noindex"; fails=1; fi
    canonical=$(grep -o '<link rel="canonical" href="[^"]*"' <<< "$out" | head -n1 | sed 's/.*href="//; s/"$//')
    [ "$(urldecode "${canonical%/}")" = "$(urldecode "${loc%/}")" ] || { echo "  $path: canonical '$canonical' is not its sitemap URL"; fails=1; }
  done <<< "$locs"
  echo "sitemap: $n URL(s) checked: 200, no credentials, no noindex, self-canonical"
  out=$(origin_page vidfetch.app GET /robots.txt); code=${out##*STATUS:}
  if [ "$code" = 200 ] && grep -q '^Sitemap: https://vidfetch.app/sitemap.xml' <<< "$out" && ! grep -qiE '^Disallow: */[[:space:]]*$' <<< "$out" && ! grep -qi '^x-robots-tag:.*noindex' <<< "$out"; then
    echo "robots.txt: served by the frontend, publishes the sitemap, disallows only private paths"
  else echo "  robots.txt: HTTP $code or wrong content (Sitemap line missing, Disallow: / or noindex)"; fails=1; fi
  out=$(origin vidfetch.app GET /fr); code=${out##*STATUS:}
  if [ "$code" = 308 ] && grep -qiE '^location: (https://vidfetch\.app)?/fr/[[:space:]]*$' <<< "$out"; then echo "redirects: /fr -> /fr/ once (no loop)"
  else echo "  /fr: HTTP $code, expected one 308 to /fr/ (frontend fix deployed?)"; fails=1; fi
  for spec in GET:/api/download:503 GET:/api/fetch-info:503 GET:/api/queue:503 GET:/auth/transfer:503 GET:/download-helper:503 POST:/api/download-access:503 GET:/auth/admission:404 GET:/internal/state:404; do
    IFS=: read -r method path want <<< "$spec"
    out=$(origin vidfetch.app "$method" "$path"); code=${out##*STATUS:}
    if [ "$code" != "$want" ]; then echo "  $method $path: HTTP $code, expected $want"; fails=1; continue; fi
    grep -qi '^x-robots-tag:.*noindex' <<< "$out" || { echo "  $method $path: no noindex header"; fails=1; }
  done
  out=$(origin_page vidfetch.app GET /api/health)
  if grep -q '"downloads":{"available":false}' <<< "$out"; then echo "downloads: closed (media routes 503, grants refused, frontend reports unavailable)"
  else echo "  /api/health does not report downloads unavailable (ready must stay 0)"; fails=1; fi
  return $fails
}
