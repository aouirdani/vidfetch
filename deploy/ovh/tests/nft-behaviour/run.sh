#!/bin/sh
# Host side: needs Docker with NET_ADMIN containers. Two clients (tester / other) probe a server
# container that loads the REAL nft rules in its own netns. Nothing touches the host's firewall.
set -u
here=$(cd "$(dirname "$0")" && pwd); src=$(cd "$here/../.." && pwd)
id=$$; net=vidfetch-nft-$id; fail=0
cleanup() { docker rm -f nft-srv-$id nft-a-$id nft-b-$id >/dev/null 2>&1; docker network rm $net >/dev/null 2>&1; }
trap cleanup EXIT
docker network create $net >/dev/null || exit 2
img=alpine:3.20
ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$1"; }
docker run -d --name nft-a-$id --network $net $img sleep 600 >/dev/null
docker run -d --name nft-b-$id --network $net $img sleep 600 >/dev/null
A=$(ip_of nft-a-$id)
docker run -d --name nft-srv-$id --network $net --cap-add NET_ADMIN -e TESTER_IP=$A -v "$src":/src:ro -v "$here/setup.sh":/setup.sh:ro $img sh /setup.sh >/dev/null
S=$(ip_of nft-srv-$id)
i=0; until docker exec nft-srv-$id test -f /tmp/ready 2>/dev/null; do i=$((i+1)); [ $i -gt 90 ] && { echo "server did not start"; docker logs nft-srv-$id | tail -5; exit 2; }; sleep 1; done
probe() { # client port -> open | closed (reset or drop: both mean no service)
  out=$(docker exec nft-$1-$id sh -c "nc -z -w 2 $S $2 2>&1; echo rc=\$?")
  case "$out" in *rc=0) echo open;; *) echo closed;; esac; }
expect() { [ "$1" = "$2" ] && echo "ok - $3" || { echo "not ok - $3 (got $1, want $2)"; fail=1; }; }
apply() { docker exec nft-srv-$id sh /tmp/apply.sh "$1" >/dev/null 2>&1 || { echo "not ok - apply $1 failed"; fail=1; }; }

echo "# original table (Cloudflare only): neither client may use 80/443; SSH open; internal ports refused"
for who in a b; do
  expect "$(probe $who 22)" open "original: $who reaches ssh 22"
  expect "$(probe $who 443)" closed "original: $who refused on 443"
  expect "$(probe $who 80)" closed "original: $who refused on 80"
  for p in 3001 8788 8789; do expect "$(probe $who $p)" closed "original: $who refused on internal $p"; done
done
echo "# media-test table, port 80 Cloudflare-only"
apply closed80
expect "$(probe a 443)" open "tester A reaches 443"
expect "$(probe b 443)" closed "other B refused on 443"
expect "$(probe a 80)" closed "tester A refused on 80 (not opened)"
expect "$(probe b 80)" closed "other B refused on 80"
for who in a b; do
  expect "$(probe $who 22)" open "$who still reaches ssh 22"
  for p in 3001 8788 8789; do expect "$(probe $who $p)" closed "$who refused on internal $p, tester included"; done
done
echo "# media-test table, --open-port-80 (HTTP-01)"
apply open80
expect "$(probe b 80)" open "other B reaches 80 (ACME redirect only)"
expect "$(probe b 443)" closed "other B still refused on 443"
expect "$(probe a 443)" open "tester A still reaches 443"
expect "$(probe b 8789)" closed "other B refused on 8789"
echo "# atomic restore of the original table"
apply original
docker exec nft-srv-$id sh -c 'nft list table inet vidfetch_https_test_ingress > /tmp/table-restored.txt; cmp /tmp/table-original.txt /tmp/table-restored.txt' && echo "ok - restored table identical to original" || { echo "not ok - restore differs"; fail=1; }
expect "$(probe a 443)" closed "after restore: tester A refused on 443 again"
expect "$(probe b 80)" closed "after restore: B refused on 80 again"
expect "$(probe a 22)" open "after restore: ssh 22 open"
exit $fail
