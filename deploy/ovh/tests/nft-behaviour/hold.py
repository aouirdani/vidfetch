"""Client side of the connection-limit check: opens COUNT connections to HOST:443 one by one and keeps them open.
Prints "refused at N" for the first one that fails, then "accepted K"; optionally holds them SECONDS more."""
import socket
import sys
import time

host, count = sys.argv[1], int(sys.argv[2])
held, ok = [], 0
for i in range(count):
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect((host, 443))
        s.send(b'x')
        time.sleep(0.05)
        s.send(b'x')  # a reset connection fails here at the latest
        held.append(s)
        ok += 1
    except OSError:
        print('refused at', i + 1)
        break
print('accepted', ok)
if len(sys.argv) > 3:
    time.sleep(int(sys.argv[3]))
