#!/bin/sh
# Runs in the server container (NET_ADMIN, own network namespace). Never touches the host.
apk add -q nftables python3 >/dev/null 2>&1
cp /src/public-test/ingress.nft /tmp/original.nft
python3 - <<PY
import importlib.util, ipaddress, json
spec = importlib.util.spec_from_file_location('ri', '/src/media/render-ingress.py'); r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
ranges = json.load(open('/src/public-test/cloudflare-ranges.json'))['ranges']
# Docker addresses are private, so the production validator would (rightly) refuse them: render directly.
for name, port80 in (('closed80', False), ('open80', True)):
    open('/tmp/%s.nft' % name, 'w').write(r.render([ipaddress.ip_network('$TESTER_IP/32')], ranges['4'], ranges['6'], port80))
PY
# The public-download table is derived from the live open80 one by the same tool the administrator runs.
python3 /src/media/public-dl-ingress.py /tmp/open80.nft /tmp/public-dl.nft
cat > /tmp/listen.py <<'PY'
import socket, sys, threading
def hold(c):
    # Like a real HTTPS server: a client that sends something stays connected until IT closes; a bare probe that
    # sends nothing is closed after a moment. So concurrent-connection limits measure live connections only.
    c.settimeout(1.5)
    try:
        while c.recv(64):
            c.settimeout(None)
    except OSError:
        pass
    c.close()
def serve(port):
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('0.0.0.0', port)); s.listen(256)
    while True:
        c, _ = s.accept()
        threading.Thread(target=hold, args=(c,), daemon=True).start() if port == 443 else c.close()
for p in (22, 80, 443, 3001, 8788, 8789):
    threading.Thread(target=serve, args=(p,), daemon=True).start()
threading.Event().wait()
PY
python3 /tmp/listen.py &
cat > /tmp/apply.sh <<'SH'
# Same transaction as firewall.py: delete the table if present, then create it; --check first.
f=/tmp/$1.nft
{ nft list table inet vidfetch_https_test_ingress >/dev/null 2>&1 && echo 'delete table inet vidfetch_https_test_ingress'; cat "$f"; } > /tmp/tx.nft
nft --check --file /tmp/tx.nft && nft --file /tmp/tx.nft
SH
sh /tmp/apply.sh open80 && nft list table inet vidfetch_https_test_ingress > /tmp/table-open80.txt
sh /tmp/apply.sh original && nft list table inet vidfetch_https_test_ingress > /tmp/table-original.txt && echo READY > /tmp/ready
sleep 600
