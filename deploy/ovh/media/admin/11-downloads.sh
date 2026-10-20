#!/usr/bin/env bash
# Usage: 11-downloads.sh open | close
# The only switch that offers downloads to the public, and its exact reverse. ready and the CI profile always move
# together, so the CI promoter keeps checking what is really served:
#   open   requires the confirmed public dl.vidfetch.app (10-dl-confirm.sh), the Turnstile and signing secrets in
#          web.env (install-web-secrets.sh), the public-downloads-aware CI helper, and an engine and gateway in service
#          that are exactly those of the active frontend release (no older gateway behind a newer frontend); installs the public-downloads
#          profile, then ready=1 (frontend restart only), then checks the real origin. Any failed check closes again.
#   close  ready=0 first (no new grant from that instant), then the public profile; checks the origin.
# It never touches the network, Caddy, the engine or the gateway. The guard then needs:
#   python3 guard-update.py accept /etc/vidfetch/web.env   (web.env changed; CI deploys refuse until accepted)
. "$(dirname "$0")/common.sh"; need_root
ACTION=${1:-}; [ "$ACTION" = open ] || [ "$ACTION" = close ] || die "open|close"
take_lock
HERE=$(dirname "$0")
frontend_health() { $CURL -s -m 10 http://127.0.0.1:3001/api/health 2>/dev/null || true; }
close_now() {
  bash "$HERE/set-ready.sh" 0 >/dev/null || log "WARNING: set-ready.sh 0 failed: check $WEB_ENV and $WEB_UNIT by hand"
  write_public_profile public || log "WARNING: could not put back the public CI profile"
}
if [ "$ACTION" = close ]; then
  close_now
  [ "$(ready_value)" = 0 ] && [ "$(ci_profile_name)" = public ] || die "close incomplete: ready=$(ready_value), CI profile $(ci_profile_name)"
  if out=$(apex_public closed); then printf '%s\n' "$out"; else printf '%s\n' "$out" >&2; die "closed, but the origin checks fail: inspect before anything else"; fi
  log "downloads closed: ready=0, CI profile public. Then: python3 guard-update.py accept $WEB_ENV"
  exit 0
fi
# --- open: everything that must already be true
S=$(latest_dl_snapshot)
[ -e "$S/confirmed" ] && ! $SYSTEMCTL is-active --quiet $DL_TIMER.timer || die "dl.vidfetch.app is not confirmed public (10-dl-public.sh, then 10-dl-confirm.sh)"
[ "$(readlink "$BASE/current")" = Caddyfile.public-dl ] || die "Caddy does not serve Caddyfile.public-dl"
if why=$(public_dl_table_problem); then die "live table: $why"; fi
[ "$(ci_profile_name)" = public ] || die "the CI profile is '$(ci_profile_name)', expected public"
grep -q "^PUBLIC_DL_PROFILE = {'profile': 'public-downloads'," "$CI_HELPER" 2>/dev/null || die "the installed CI helper does not know the public-downloads profile: 09-ci-helper.sh install first"
for n in TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY VIDFETCH_ACCESS_SIGNING_KEY; do grep -q "^$n=." "$WEB_ENV" || die "$n missing from $WEB_ENV: install-web-secrets.sh first"; done
[ "$(sed -n 's/^VIDFETCH_MEDIA_ORIGIN=//p' "$WEB_ENV" | tail -n1)" = https://dl.vidfetch.app ] || die "VIDFETCH_MEDIA_ORIGIN must be https://dl.vidfetch.app in $WEB_ENV"
if why=$(release_drift); then die "the engine and gateway in service are not those of the active frontend release ($why): finish 08-gateway.sh upgrade (or roll the frontend back) first; nothing changed"; fi
if out=$(dl_public); then :; else printf '%s\n' "$out" >&2; die "dl.vidfetch.app is not as expected: nothing changed"; fi
# --- profile first (it also accepts ready=0), then ready; any failed check closes again
write_public_profile public-downloads || die "could not install the public-downloads CI profile: nothing else changed"
bash "$HERE/set-ready.sh" 1 >/dev/null || { close_now; die "set-ready.sh 1 failed: closed again"; }
fails=0
for i in 1 2 3 4 5 6 7 8 9 10; do grep -q '"downloads":{"available":true}' <<< "$(frontend_health)" && break; sleep 2; done
grep -q '"downloads":{"available":true}' <<< "$(frontend_health)" || { echo "  the frontend does not report downloads available" >&2; fails=1; }
cfg=$(origin_page vidfetch.app GET /api/download-access)
grep -q '"available":true' <<< "$cfg" && grep -q '"gatewayOrigin":"https://dl.vidfetch.app"' <<< "$cfg" && grep -qE '"siteKey":"[^"]+"' <<< "$cfg" \
  || { echo "  /api/download-access does not offer the Turnstile widget and dl.vidfetch.app" >&2; fails=1; }
if out=$(apex_public open); then printf '%s\n' "$out"; else printf '%s\n' "$out" >&2; fails=1; fi
if out=$(dl_public); then echo "dl: public; gateway routes demand a grant (401)"; else printf '%s\n' "$out" >&2; fails=1; fi
if [ "$fails" != 0 ]; then close_now; die "checks failed after opening: downloads closed again (ready=0, CI profile public)"; fi
log "downloads OPEN: ready=1, CI profile public-downloads. Test now in a browser (TikTok MP4 and MP3); if anything is wrong: 11-downloads.sh close"
log "then: python3 guard-update.py accept $WEB_ENV"
