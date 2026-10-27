"""JgSaw local dev server (http://localhost:4000).

Serves the static site with no caching and the same /api routes that run on Vercel
(the logic lives in api/_gtm.py). Deals are saved to deals.jsonl here.
"""
import http.server
import os
import socketserver
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "api"))
import _gtm  # noqa: E402

PORT = 4000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, code, obj):
        data = _gtm.json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.startswith("/api/deal"):
            n = min(int(self.headers.get("Content-Length") or 0), 20_000)
            return self.send_json(*_gtm.save_deal(self.rfile.read(n), local_file=os.path.join(ROOT, "deals.jsonl")))
        self.send_error(404)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        for name in ("logo", "analyze"):
            if u.path.rstrip("/") == "/api/" + name:
                return self.send_json(*_gtm.api_get(name, urllib.parse.parse_qs(u.query)))
        if u.path.startswith("/api/") or u.path.startswith("/.tools") or u.path.endswith((".py", ".jsonl")):
            return self.send_error(404)   # never serve code or saved deals
        return super().do_GET()

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"JgSaw dev server on http://localhost:{PORT}")
    Server(("", PORT), Handler).serve_forever()
