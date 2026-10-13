#!/usr/bin/env bash
# install | remove the CI media-test profile (root-owned, exact content the promoter accepts).
. "$(dirname "$0")/common.sh"; need_root
P=${VM_PROFILE:-/etc/vidfetch/ci-media-test-profile.json}
case "${1:-}" in
  install) [ ! -e "$P" ] || die "already present"
    printf '%s\n' '{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}' > "$P.new"; chown root:root "$P.new"; chmod 0644 "$P.new"; mv "$P.new" "$P"; log "installed $P" ;;
  remove) rm -f "$P"; log "removed: CI back to the closed profile" ;;
  *) die "install|remove" ;;
esac
