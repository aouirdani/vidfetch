#!/usr/bin/env bash
# Throwaway-container test (python:3.12-slim, root; writes under /etc/vidfetch). The observation gate of PR B
# (docs/VIDFETCH-MOTEUR-REVUE-SPEC.md v3 §3 B4): downloads reopen (11-downloads.sh open, set-ready.sh 1) only if the
# LATEST observation record is a full (>= 900 s) successful observation of the engine and gateway bundles in service,
# and no reviewed engine or gateway operation ran after it started. A close and reopen without any bundle change, or a
# crash restart on the same bundle, needs no new observation. Closing is never blocked.
# Written before the implementation: the gate cases fail until common.sh defines observation_problem and set-ready.sh 1
# calls it; the cases that must already hold (closing, a valid record) pass.
set -uo pipefail
[ -f /.dockerenv ] || { echo "SKIP: run inside the Docker wrapper"; exit 77; }
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
cp -R /r/deploy/ovh/media/admin "$W/admin"; A=$W/admin
mkdir -p "$W/bin" "$W/state" "$W/bk" /etc/vidfetch
cat > "$W/bin/systemctl" <<'S'
#!/bin/sh
echo "systemctl $*" >> "$STATE/calls.log"
case "$1" in
  is-active) exit 0 ;;
  show) case "$2 $4" in
      "vidfetch.service ExecStart") echo "{ path=/usr/bin/node ; argv[]=/usr/bin/node $RUN_DIR/engine.cjs ; ignore_errors=no }" ;;
      "vidfetch-gateway.service ExecStart") echo "{ path=/usr/bin/node ; argv[]=/usr/bin/node $RUN_DIR/gateway.cjs ; ignore_errors=no }" ;;
      "vidfetch.service MainPID") cat "$STATE/engine-pid" ;;
      "vidfetch-gateway.service MainPID") cat "$STATE/gateway-pid" ;;
      *) echo 4242 ;; esac ;;
  *) exit 0 ;;
esac
S
chmod +x "$W/bin/systemctl"
export STATE="$W/state" RUN_DIR="$W/run" PATH="$W/bin:$PATH" VM_SYSTEMCTL="$W/bin/systemctl" VM_SKIP_ROOT=1 VM_BACKUPS="$W/bk" \
  VM_LOCK="$W/lock" VM_LOCK_WAIT=1 VM_WEB_ENV=/etc/vidfetch/web.env VM_MANIFEST="$W/release/manifest.json" VM_PROC="$W/proc" \
  VM_OBSERVATIONS="$W/obs"
fail=0; n=0; ok() { n=$((n+1)); echo "ok $n - $1"; }; bad() { n=$((n+1)); echo "not ok $n - $1"; fail=1; }
sha() { sha256sum "$1" | cut -c1-64; }
iso() { date -u -d "@$1" +%FT%TZ; }
NOW=$(date +%s)
# fakeproc PID BUNDLE START: the process as release_drift reads it from /proc (cmdline, start time)
fakeproc() { mkdir -p "$W/proc/$1"; printf '/usr/bin/node\0%s\0' "$2" > "$W/proc/$1/cmdline"
  printf '%s (node) S%s %s 0 0\n' "$1" "$(printf ' 0%.0s' $(seq 18))" $(( ($3 - 1000000000) * $(getconf CLK_TCK) )) > "$W/proc/$1/stat"; }
# the active release, the bundles in service and their processes: everything release_drift accepts
fixture() {  # fixture ENGINE_CONTENT GATEWAY_CONTENT
  rm -rf "$W/run" "$W/release" "$W/proc" "$W/obs" "$W/bk"; mkdir -p "$W/run" "$W/release/backend" "$W/proc" "$W/bk"
  install -d -m 0700 "$W/obs"
  printf '%s' "$1" > "$W/run/engine.cjs"; printf '%s' "$2" > "$W/run/gateway.cjs"
  python3 -c 'import hashlib,json,sys; d=sys.argv[1]; h=lambda f: hashlib.sha256(open(f,"rb").read()).hexdigest()
json.dump({"schema":1,"release":"a"*40,"platform":"linux-x64","files":{"backend/vidfetch-ovh.cjs":h(d+"/run/engine.cjs"),"backend/vidfetch-gateway.cjs":h(d+"/run/gateway.cjs")}},open(d+"/release/manifest.json","w"))' "$W"
  echo "btime 1000000000" > "$W/proc/stat"; echo 4244 > "$STATE/engine-pid"; echo 4243 > "$STATE/gateway-pid"
  fakeproc 4244 "$W/run/engine.cjs" $((NOW + 3600)); fakeproc 4243 "$W/run/gateway.cjs" $((NOW + 3600))
  printf 'VIDFETCH_TARGET=ovh\nVIDFETCH_MEDIA_ORIGIN=https://dl.vidfetch.app\nTURNSTILE_SITE_KEY=s\nTURNSTILE_SECRET_KEY=CANARY-SECRET\nVIDFETCH_ACCESS_SIGNING_KEY=k\nVIDFETCH_CONNECTION_READY=0\n' > /etc/vidfetch/web.env
  chmod 600 /etc/vidfetch/web.env; rm -f /etc/vidfetch/web.env.bak.*
  echo '{"profile":"public","apex":"public-indexable","dl":"public"}' > /etc/vidfetch/ci-media-test-profile.json
  : > "$STATE/calls.log"
}
# record RESULT DURATION STARTED [ENGINE_SHA GATEWAY_SHA]: one observation record as 13-engine.sh observe writes it
# (spec v3 §3 B3): named after its end, root-owned 0600, in a root-only 0700 directory.
record() {
  local result=$1 duration=$2 started=$3 e=${4:-$(sha "$W/run/engine.cjs")} g=${5:-$(sha "$W/run/gateway.cjs")} ended name
  ended=$((started + duration)); name="$W/obs/$(date -u -d "@$ended" +%Y%m%dT%H%M%S).$(printf '%09d' $((RANDOM * 1000)))Z-$result.json"
  python3 - "$name" "$result" "$duration" "$(iso "$started")" "$(iso "$ended")" "$e" "$g" "$W" <<'PY'
import json, sys
name, result, duration, started, ended, e, g, w = sys.argv[1:]
json.dump({'schema': 1, 'result': result, 'duration_s': int(duration), 'started': started, 'ended': ended, 'rounds': int(duration) // 30,
           'failed_check': None if result == 'ok' else 'O1 engine restarted',
           'engine': {'unit': 'vidfetch.service', 'pid': 4244, 'bundle': w + '/run/engine.cjs', 'sha256': e},
           'gateway': {'unit': 'vidfetch-gateway.service', 'pid': 4243, 'bundle': w + '/run/gateway.cjs', 'sha256': g}}, open(name, 'w'))
PY
  chmod 600 "$name"; echo "$name"
}
# marker KIND WHAT TIME: the dated files 08-gateway.sh (upgraded, rolled-back) and 13-engine.sh leave in their latest backup
marker() { local d="$W/bk/vidfetch-$1-upgrade-x"; mkdir -p "$d"; iso "$3" > "$d/$2"; ln -sfn "$d" "$W/bk/vidfetch-$1-upgrade-latest"; }
# gate EXPECT LABEL [WANT]: EXPECT=open (no problem: status 1) or refuse (a reason: status 0, containing WANT)
gate() {
  local expect=$1 label=$2 want=${3:-} out rc
  out=$( . "$A/common.sh"; observation_problem 2>&1 ); rc=$?
  if [ $rc = 127 ] || grep -q 'observation_problem: command not found' <<< "$out"; then bad "$label (observation_problem is not implemented yet)"; return; fi
  case "$expect" in
    open) [ $rc = 1 ] && ok "$label" || bad "$label: refused ($out)" ;;
    refuse) [ $rc = 0 ] && grep -q -- "$want" <<< "$out" && ok "$label" || bad "$label: rc=$rc out=$out" ;;
  esac
}
OLD=$((NOW - 7200))   # an observation two hours ago, long after the last operation

echo "# 1. the decisive cases"
fixture engine-1 gateway-1; gate refuse "no observation record at all: reopening refused" "no observation record"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; marker gateway upgraded $((OLD - 86400))
gate open "a full observation of the bundles in service, after the last operation: reopening allowed (administrative close, no bundle change)"
echo 5555 > "$STATE/engine-pid"; fakeproc 5555 "$W/run/engine.cjs" $((NOW + 3600))
gate open "the engine restarted on its own (crash, same bundle): no new observation required"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; printf 'engine-2' > "$W/run/engine.cjs"
python3 -c 'import hashlib,json,sys; p=sys.argv[1]+"/release/manifest.json"; d=json.load(open(p)); d["files"]["backend/vidfetch-ovh.cjs"]=hashlib.sha256(b"engine-2").hexdigest(); json.dump(d,open(p,"w"))' "$W"
gate refuse "the engine bundle in service changed since the last observation" "changed since the last observation"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; printf 'gateway-2' > "$W/run/gateway.cjs"
python3 -c 'import hashlib,json,sys; p=sys.argv[1]+"/release/manifest.json"; d=json.load(open(p)); d["files"]["backend/vidfetch-gateway.cjs"]=hashlib.sha256(b"gateway-2").hexdigest(); json.dump(d,open(p,"w"))' "$W"
gate refuse "the gateway bundle in service changed since the last observation (08-gateway.sh, unmodified)" "changed since the last observation"
fixture engine-1 gateway-1; record failed 300 $OLD >/dev/null
gate refuse "the latest observation failed: downloads stay closed" "latest observation failed"
fixture engine-1 gateway-1; record ok 899 $OLD >/dev/null
gate refuse "an observation shorter than 900 s does not count" "900"
fixture engine-1 gateway-1; record ok 900 $((OLD - 3600)) >/dev/null; record ok 900 $OLD "$(printf other | sha256sum | cut -c1-64)" >/dev/null
gate refuse "only the LATEST record counts (an older one for the same bundles does not)" "changed since the last observation"

echo "# 2. reviewed operations after the observation (back on the same bundles, but restarted by a tool)"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; marker gateway rolled-back $((OLD + 1200))
gate refuse "08-gateway.sh rolled back after the observation started" "after the last observation"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; marker engine upgraded $((OLD + 60))
gate refuse "13-engine.sh upgraded after the observation started" "after the last observation"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; marker engine rolled-back $((OLD - 30)); marker gateway upgraded $((OLD - 600))
gate open "operations that ended before the observation started: reopening allowed (the normal end of a window)"

echo "# 3. only trusted records count"
fixture engine-1 gateway-1; r=$(record ok 900 $OLD); chmod 644 "$r"
gate refuse "a record readable or writable by others is ignored" "no observation record"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; chmod 755 "$W/obs"
gate refuse "a record directory other than 0700 is not trusted" "observation"
fixture engine-1 gateway-1; r=$(record ok 900 $OLD); mv "$r" "$W/elsewhere.json"; ln -s "$W/elsewhere.json" "$r"
gate refuse "a symbolic link is not a record" "no observation record"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null; printf '{not json' > "$W/obs/29991231T235959.000000000Z-ok.json"; chmod 600 "$W/obs/29991231T235959.000000000Z-ok.json"
gate refuse "an unreadable latest record refuses (never falls back to an older one)" "observation"

echo "# 4. set-ready.sh: 1 goes through the gate, 0 never does"
fixture engine-1 gateway-1
out=$(bash "$A/set-ready.sh" 1 2>&1); rc=$?
[ $rc != 0 ] && grep -q "observation" <<< "$out" && [ "$(sed -n 's/^VIDFETCH_CONNECTION_READY=//p' /etc/vidfetch/web.env)" = 0 ] && ! ls /etc/vidfetch/web.env.bak.* >/dev/null 2>&1 && ! grep -q 'restart' "$STATE/calls.log" \
  && ok "set-ready.sh 1 without an observation: refused, ready stays 0, nothing written, nothing restarted" || bad "set-ready.sh 1 without an observation (rc=$rc): $(echo "$out" | tail -2 | tr '\n' ' ')"
fixture engine-1 gateway-1; record ok 900 $OLD >/dev/null
out=$(bash "$A/set-ready.sh" 1 2>&1); rc=$?
[ $rc = 0 ] && [ "$(sed -n 's/^VIDFETCH_CONNECTION_READY=//p' /etc/vidfetch/web.env)" = 1 ] && ok "set-ready.sh 1 after a full observation: ready=1" || bad "set-ready.sh 1 with a valid record (rc=$rc): $(echo "$out" | tail -2 | tr '\n' ' ')"
for setup in none failed; do
  fixture engine-1 gateway-1; [ $setup = failed ] && record failed 120 $OLD >/dev/null
  sed -i 's/^VIDFETCH_CONNECTION_READY=0$/VIDFETCH_CONNECTION_READY=1/' /etc/vidfetch/web.env
  out=$(bash "$A/set-ready.sh" 0 2>&1); rc=$?
  [ $rc = 0 ] && [ "$(sed -n 's/^VIDFETCH_CONNECTION_READY=//p' /etc/vidfetch/web.env)" = 0 ] && ok "set-ready.sh 0 is never blocked by the gate (observation: $setup)" || bad "set-ready.sh 0 blocked (observation: $setup, rc=$rc): $out"
done
grep -rq CANARY-SECRET "$W/obs" "$STATE" 2>/dev/null && bad "a secret reached a record or a log" || ok "no secret in the records or the logs"
echo "# $n checks"
exit $fail
