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
DROPIN=${VM_DROPIN:-/etc/systemd/system/vidfetch-caddy.service.d/media-test.conf}
CONFIRM_MARGIN=${VM_CONFIRM_MARGIN:-3}   # seconds after the rules went live before a login can count
CADDY_UNIT=vidfetch-caddy.service
WEB_UNIT=vidfetch-web-preproduction-20261013.service
TIMER=vidfetch-media-rollback
PROTECTED="ssh.service vidfetch.service vidfetch-gateway.service vidfetch-web-candidate.service vidfetch-caddy.service"
need_root() { [ "${VM_SKIP_ROOT:-0}" = 1 ] || [ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }; }
log() { printf '[%s] %s\n' "$(date -u +%T)" "$*"; }
die() { echo "REFUSED: $*" >&2; exit 1; }
latest_backup() { local b; b=$(readlink -f "$BACKUPS/vidfetch-media-test-latest" 2>/dev/null) || true; [ -n "$b" ] && [ -d "$b" ] || die "no backup: run 01-backup.sh first"; echo "$b"; }
# One media-test operation at a time (03, 05, confirm, cancel, backup, and the dead-man restore itself).
take_lock() { exec 9>"$LOCKFILE" || die "cannot open $LOCKFILE"; flock -w "$LOCK_WAIT" 9 || die "another media-test operation (or the automatic restore) is running; wait for it"; }
# Set by restore-network.sh once it ran (fully or partially): the window is over, nothing may continue it.
restored_marker() { [ -e "$1/restore-started" ] || [ -e "$1/restored" ]; }
