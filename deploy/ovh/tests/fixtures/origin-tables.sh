# Sourced by the stub tests. origin_tables DIR writes what origin-curl-stub.py answers for each Caddy configuration:
#   Caddyfile             the live Phase 5 configuration: apex protected, /api/download-access closed (503), no dl site
#   Caddyfile.media-test  the staged configuration: same apex protections, /api/download-access behind Basic Auth,
#                         dl served with a certificate and refusing a non-tester (loopback) with 403
origin_tables() {
  local dir=${1:?} auth='x-robots-tag: noindex, nofollow|www-authenticate: Basic realm="restricted"' robots='x-robots-tag: noindex, nofollow'
  local dl='x-robots-tag: noindex, nofollow|referrer-policy: no-referrer|cache-control: private, no-store, max-age=0'
  mkdir -p "$dir"
  {
    printf 'vidfetch.app GET / 401 %s\n' "$auth"; printf 'vidfetch.app GET /fr/ 401 %s\n' "$auth"
    for p in /api/download /api/fetch-info /api/queue /auth/transfer /download-helper; do printf 'vidfetch.app GET %s 503 %s\n' "$p" "$robots"; done
    printf 'vidfetch.app GET /sitemap.xml 404 %s\n' "$robots"
  } > "$dir/common"
  { cat "$dir/common"; printf 'vidfetch.app GET /api/download-access 503 %s\nvidfetch.app POST /api/download-access 503 %s\n' "$robots" "$robots"; } > "$dir/Caddyfile"
  { cat "$dir/common"; printf 'vidfetch.app GET /api/download-access 401 %s\nvidfetch.app POST /api/download-access 401 %s\n' "$auth" "$auth"
    for r in 'GET /' 'GET /api/fetch-info' 'POST /api/download'; do printf 'dl.vidfetch.app %s 403 %s\n' "$r" "$dl"; done; } > "$dir/Caddyfile.media-test"
  rm -f -- "$dir/common"
}
