#!/usr/bin/env bash
# install | install-public | remove the CI profile (root-owned, exact content the promoter accepts).
# The profile must match the live Caddy configuration, otherwise every CI deploy and rollback check fails:
#   install         media-test profile: Caddy must not be on the public configuration
#   install-public  public profile: normally written by 05-confirm.sh; here only to repair, once the public window
#                   was confirmed (Caddy on Caddyfile.public and the confirmation recorded)
. "$(dirname "$0")/common.sh"; need_root
P=${VM_PROFILE-/etc/vidfetch/ci-media-test-profile.json}
[ "${P:?profile path is empty}" != "${P%/ci-media-test-profile.json}" ] || die "unexpected profile path: $P"
case "${1:-}" in
  install) [ ! -e "$P" ] || die "already present"
    [ "$(readlink "$BASE/current")" != Caddyfile.public ] || die "Caddy serves the public configuration: the media-test profile would contradict it"
    printf '%s\n' '{"profile":"media-test","apex":"basic-auth-noindex","dl":"testers-only"}' > "$P.new"; chown root:root "$P.new"; chmod 0644 "$P.new"; mv "$P.new" "$P"; log "installed $P" ;;
  install-public) [ "$P" = "$CI_PROFILE" ] || die "unexpected profile path"
    [ "$(readlink "$BASE/current")" = Caddyfile.public ] || die "Caddy does not serve the public configuration"
    [ -e "$(latest_backup)/caddy-confirmed" ] || die "the public window is not confirmed: use 05-confirm.sh"
    [ "$(ci_profile_name)" = closed ] || [ "$(ci_profile_name)" = public ] || die "another profile is installed"
    write_public_profile; log "installed the public profile in $P" ;;
  remove) remove_expected_file "${P%/ci-media-test-profile.json}" ci-media-test-profile.json; log "removed: CI back to the closed profile" ;;
  *) die "install|install-public|remove" ;;
esac
