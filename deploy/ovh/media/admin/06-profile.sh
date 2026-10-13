#!/usr/bin/env bash
# install | remove the CI media-test profile (root-owned, exact content the promoter accepts).
. "$(dirname "$0")/common.sh"; need_root
P=${VM_PROFILE-/etc/vidfetch/ci-media-test-profile.json}
[ "${P:?profile path is empty}" != "${P%/ci-media-test-profile.json}" ] || die "unexpected profile path: $P"
case "${1:-}" in
  install) [ ! -e "$P" ] || die "already present"
    printf '%s\n' '{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}' > "$P.new"; chown root:root "$P.new"; chmod 0644 "$P.new"; mv "$P.new" "$P"; log "installed $P" ;;
  remove) remove_expected_file "${P%/ci-media-test-profile.json}" ci-media-test-profile.json; log "removed: CI back to the closed profile" ;;
  *) die "install|remove" ;;
esac
