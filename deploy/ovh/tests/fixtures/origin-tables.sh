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
  # Caddyfile.public: what the public apex answers (three sitemap URLs are enough for the stub; the real frontend
  # has sixteen, checked by scripts/i18n/verify-site.mjs and public-indexing.test.sh).
  mkdir -p "$dir/bodies"
  printf '<urlset><url><loc>https://vidfetch.app/</loc></url><url><loc>https://vidfetch.app/fr/</loc></url><url><loc>https://vidfetch.app/ar/%%D8%%A7%%D9%%84</loc></url></urlset>\n' > "$dir/bodies/sitemap"
  printf 'User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: https://vidfetch.app/sitemap.xml\n' > "$dir/bodies/robots"
  for page in home:https://vidfetch.app fr:https://vidfetch.app/fr/ ar:https://vidfetch.app/ar/%D8%A7%D9%84; do
    printf '<html><head><link rel="canonical" href="%s"/><meta name="robots" content="index, follow"/></head><body>ok</body></html>\n' "${page#*:}" > "$dir/bodies/${page%%:*}"
  done
  printf '{"ok":true,"frontend":{"ready":true},"downloads":{"available":false}}\n' > "$dir/bodies/health"
  {
    printf 'vidfetch.app GET /sitemap.xml 200 BODY=sitemap\nvidfetch.app GET /robots.txt 200 BODY=robots\n'
    printf 'vidfetch.app GET / 200 BODY=home\nvidfetch.app GET /fr/ 200 BODY=fr\nvidfetch.app GET /ar/%%D8%%A7%%D9%%84 200 BODY=ar\n'
    printf 'vidfetch.app GET /fr 308 location: /fr/\n'
    for p in /api/download /api/fetch-info /api/queue /auth/transfer /download-helper; do printf 'vidfetch.app GET %s 503 %s\n' "$p" "$robots"; done
    printf 'vidfetch.app POST /api/download-access 503 %s\n' "$robots"
    printf 'vidfetch.app GET /auth/admission 404 %s\nvidfetch.app GET /internal/state 404 %s\n' "$robots" "$robots"
    printf 'vidfetch.app GET /api/health 200 %s|BODY=health\n' "$robots"
    for r in 'GET /' 'GET /api/fetch-info' 'POST /api/download'; do printf 'dl.vidfetch.app %s 403 %s\n' "$r" "$dl"; done
  } > "$dir/Caddyfile.public"
  # Caddyfile.public-dl: the same public apex; dl now answers anyone (loopback included): gateway routes demand a grant.
  printf '{"ok":true,"frontend":{"ready":true},"downloads":{"available":true}}\n' > "$dir/bodies/health-open"
  printf '{"ok":true,"available":true,"siteKey":"0x4AAAAAAA-test-site-key","gatewayOrigin":"https://dl.vidfetch.app"}\n' > "$dir/bodies/access-open"
  printf '{"ok":true,"available":false,"siteKey":"","gatewayOrigin":""}\n' > "$dir/bodies/access-closed"
  {
    grep -v '^dl.vidfetch.app ' "$dir/Caddyfile.public"
    printf 'vidfetch.app GET /api/download-access 200 %s|BODY=access-closed\n' "$robots"
    printf '127.0.0.1:3001 GET /api/health 200 BODY=health\n'
    for r in 'POST /api/fetch-info' 'POST /api/download'; do printf 'dl.vidfetch.app %s 401 %s\n' "$r" "$dl"; done
    for r in 'GET /' 'GET /api/health' 'GET /auth/admission'; do printf 'dl.vidfetch.app %s 404 %s\n' "$r" "$dl"; done
  } > "$dir/Caddyfile.public-dl"
  # ...and once ready=1: grants are offered to the site's browser origin only, the frontend reports downloads.
  sed -e 's#^vidfetch.app POST /api/download-access 503#vidfetch.app POST /api/download-access 403#' \
      -e 's#BODY=health$#BODY=health-open#' -e 's#|BODY=health$#|BODY=health-open#' -e 's#BODY=access-closed#BODY=access-open#' \
      "$dir/Caddyfile.public-dl" > "$dir/Caddyfile.public-dl.open"
}
