#!/usr/bin/env bash
# verify-outsider.sh against a modelled production (verify-outsider/world.py stands in for curl, nc and openssl):
#  - the public-dl world answers as the real gateway does (anonymous JSON POST 401 INVALID_ACCESS, POST without a body
#    400 INVALID_JSON): every check passes, and the requests really are the JSON ones;
#  - the public world (dl tester-only) still passes --public unchanged;
#  - each broken security property, one at a time, makes the run fail (FAILURES PRESENT, exit 1, never ALL ... PASSED).
set -u
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../../.." && pwd)
script="$root/deploy/ovh/media/admin/verify-outsider.sh"; world="$here/verify-outsider/world.py"
fail=0; work=$(mktemp -d); bin="$work/bin"; mkdir "$bin"
for tool in curl nc openssl; do printf '#!/bin/sh\nexec python3 %s %s "$@"\n' "$world" "$tool" > "$bin/$tool"; chmod +x "$bin/$tool"; done
pass() { echo "ok - $1"; }; flunk() { echo "not ok - $1"; fail=1; }
# run WORLD MODE [FAULT] [PATH]: output in $work/out, exit code in $rc, curl calls in $work/curl.log
run() {
  : > "$work/curl.log"
  WORLD=$1 FAULT=${3:-} CURL_LOG="$work/curl.log" PATH="${4:-$bin:$PATH}" bash "$script" "$2" > "$work/out" 2>&1; rc=$?
}

# 1. The real behaviour observed on 2026-10-19 (body-less POST 400, JSON POST 401): --public-dl passes in full
run public-dl --public-dl
if [ $rc = 0 ] && grep -qx 'ALL 40 CHECKS PASSED' "$work/out" && ! grep -q '^NOT OK' "$work/out"; then pass "--public-dl: production gateway behaviour gives ALL 40 CHECKS PASSED"; else flunk "--public-dl healthy run: rc=$rc"; cat "$work/out"; fi
for p in /api/fetch-info /api/download; do
  grep -q "^ok [0-9]* - public dl: anonymous JSON POST $p with {} refused by the gateway (401 INVALID_ACCESS), engine not reached$" "$work/out" && pass "$p: anonymous JSON {} must be refused with the gateway's INVALID_ACCESS code" || flunk "$p: JSON {} check line"
  grep -q "^ok [0-9]* - public dl: anonymous JSON POST $p with a sample request refused by the gateway (401 INVALID_ACCESS), engine not reached$" "$work/out" && pass "$p: a realistic anonymous request is refused the same way" || flunk "$p: sample check line"
  grep -q "^ok [0-9]* - public dl: POST $p without a body refused by the gateway (400 INVALID_JSON)$" "$work/out" && pass "$p: a POST without a body must be refused with 400 INVALID_JSON" || flunk "$p: empty POST check line"
done
# what was really sent: JSON with the right header, and the body-less POSTs without any body
python3 - "$work/curl.log" <<'PY' && pass "requests sent: 4 JSON POSTs (Content-Type application/json, {} and the sample), 2 POSTs without a body, headers checked on a JSON POST" || flunk "requests sent do not match"
import json, sys
calls = [json.loads(l) for l in open(sys.argv[1])]
dl = [c for c in calls if c['url'].startswith('https://dl.vidfetch.app/api/') and c['method'] == 'POST']
json_posts = [c for c in dl if c['data'] is not None]
empty = [c for c in dl if c['data'] is None]
assert all(c['headers'] == ['Content-Type: application/json'] for c in json_posts), json_posts
assert sorted((c['url'], c['data'] == '{}') for c in json_posts) == sorted(
    [(u, b) for u in ('https://dl.vidfetch.app/api/fetch-info', 'https://dl.vidfetch.app/api/download') for b in (True, False)]
    + [('https://dl.vidfetch.app/api/fetch-info', True)]), json_posts  # + the header check, itself a JSON {} POST
assert sorted(c['url'] for c in empty) == ['https://dl.vidfetch.app/api/download', 'https://dl.vidfetch.app/api/fetch-info'] and all(not c['headers'] for c in empty), empty
for c in json_posts:
    json.loads(c['data'])
PY

# 2. --public (dl tester-only) is unchanged
run public --public
[ $rc = 0 ] && grep -qx 'ALL 31 CHECKS PASSED' "$work/out" && pass "--public: unchanged, ALL 31 CHECKS PASSED while dl is tester-only" || { flunk "--public healthy run: rc=$rc"; cat "$work/out"; }
# and --public-dl must fail while dl is still tester-only (nothing answers: no false pass on connection failures)
run public --public-dl
[ $rc = 1 ] && grep -qx 'FAILURES PRESENT' "$work/out" && ! grep -q 'CHECKS PASSED' "$work/out" && pass "--public-dl fails while dl is not public (connection resets are never counted as refusals)" || { flunk "--public-dl in the tester-only world: rc=$rc"; cat "$work/out"; }

# 3. Each broken security property fails the whole run, with the check that caught it
while IFS='|' read -r fault expect; do
  run public-dl --public-dl "$fault"
  if [ $rc = 1 ] && grep -qx 'FAILURES PRESENT' "$work/out" && ! grep -q 'CHECKS PASSED' "$work/out" && grep -q "^NOT OK [0-9]* - .*$expect" "$work/out"; then
    pass "fault $fault: run fails (exit 1) on '$expect'"
  else flunk "fault $fault not caught (rc=$rc)"; cat "$work/out"; fi
done <<'EOF'
engine_reached_fetch_info|anonymous JSON POST /api/fetch-info with {} answered 200
engine_reached_download_sample|anonymous JSON POST /api/download with a sample request answered 200
foreign_401|anonymous JSON POST /api/fetch-info with {} answered 401, expected 401 with the gateway's INVALID_ACCESS refusal
empty_post_401|POST /api/fetch-info without a body answered 401
empty_post_200|POST /api/download without a body answered 200
dl_root_200|public dl: GET / answered 200, expected 404
dl_headers|public dl: headers
cert|public dl: certificate does not verify
apex_direct_200|apex direct answered 200
internal_port_open|internal port 3001 reachable
ssh_closed|SSH port unreachable
apex_noindex|public: / sends X-Robots-Tag noindex
apex_basic_auth|public: /fr/ answered 401
apex_download_open|public: /api/download answered 200
grant_issued|public: /api/download-access answered 200
health_available|public: downloads not reported unavailable
dl_unreachable|anonymous JSON POST /api/fetch-info with {} answered 000
EOF

# 4. A missing tool cannot produce a pass: without nc, SSH is reported unreachable and the run fails
mkdir "$work/nonc"; for tool in curl openssl; do cp "$bin/$tool" "$work/nonc/"; done
for t in bash python3 grep sed cut head wc tr cat sh env; do ln -s "$(command -v $t)" "$work/nonc/$t"; done
run public-dl --public-dl '' "$work/nonc"
[ $rc = 1 ] && grep -q '^NOT OK [0-9]* - SSH port unreachable' "$work/out" && ! grep -q 'CHECKS PASSED' "$work/out" && pass "without nc the run fails (SSH check), never a silent pass" || { flunk "missing nc: rc=$rc"; cat "$work/out"; }

for f in bin/curl bin/nc bin/openssl nonc/curl nonc/openssl out curl.log; do rm -f -- "${work:?}/$f"; done
for t in bash python3 grep sed cut head wc tr cat sh env; do rm -f -- "${work:?}/nonc/$t"; done
rmdir -- "$work/bin" "$work/nonc" "$work"
[ $fail = 0 ] && echo "verify-outsider: all tests passed" || echo "verify-outsider: FAILURES"
exit $fail
