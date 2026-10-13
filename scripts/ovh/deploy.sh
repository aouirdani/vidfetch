#!/bin/sh
set -eu
# Forced command accepts only status, verify and gated receive.
: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_KNOWN_HOSTS:?}" "${GITHUB_SHA:?}"
case "$GITHUB_SHA" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#GITHUB_SHA}" -eq 40 ]
[ "$DEPLOY_HOST" = '15.235.127.165' ]
[ "$DEPLOY_USER" = 'vidfetch-deploy' ]
operation=${DEPLOY_OPERATION:-receive}
case "$operation" in verify|receive) ;; *) exit 2;; esac
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
printf '%s\n' "$DEPLOY_SSH_KEY" > "$work/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$work/known_hosts"
# No keyscan or trust-on-first-use in CI. The administrator verifies this out of band.
ssh-keygen -F "$DEPLOY_HOST" -f "$work/known_hosts" >/dev/null
checksum=$(sha256sum "release-$GITHUB_SHA.tgz" | cut -d ' ' -f1)
ssh -T -i "$work/key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 "$DEPLOY_USER@$DEPLOY_HOST" "$operation $GITHUB_SHA $checksum" < "release-$GITHUB_SHA.tgz"
