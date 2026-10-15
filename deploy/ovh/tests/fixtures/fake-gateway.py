"""Stand-in for the download gateway in caddy-window-systemd.test.sh, on 127.0.0.1:PORT.
GET /api/fetch-info answers GATEWAY-REACHED (to prove a request got through Caddy); every POST answers 401, as the
real gateway does for a request without a grant (verified on the VPS: fetch_info_anonymous=401).
Usage: fake-gateway.py PORT"""
import http.server
import sys


class Gateway(http.server.BaseHTTPRequestHandler):
    def answer(self, status, body, kind='text/plain'):
        data = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.answer(200, 'GATEWAY-REACHED') if self.path.split('?')[0] == '/api/fetch-info' else self.answer(404, '')

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length:
            self.rfile.read(min(length, 65536))
        self.answer(401, '{"ok":false,"code":"UNAUTHORIZED"}', 'application/json')

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Gateway).serve_forever()
