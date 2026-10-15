"""Client side of the new-connection rate check: 150 short connections to HOST:443 as fast as possible.
Prints "<accepted> <refused>"."""
import socket
import sys

host, ok, refused = sys.argv[1], 0, 0
for _ in range(150):
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((host, 443))
        ok += 1
    except OSError:
        refused += 1
    finally:
        s.close()
print(ok, refused)
