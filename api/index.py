"""Vercel serverless function for every /api route (vercel.json rewrites /api/<name> here as ?fn=<name>)."""
import json
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _gtm  # noqa: E402


def _route(path):
    u = urllib.parse.urlparse(path)
    q = urllib.parse.parse_qs(u.query)
    name = (q.pop("fn", [""])[0] or u.path.rstrip("/").rsplit("/", 1)[-1]).lower()
    return name, q


class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        name, q = _route(self.path)
        return self._send(*_gtm.api_get(name, q))

    def do_POST(self):
        name, _ = _route(self.path)
        if name != "deal":
            return self._send(404, {"error": "Not found"})
        n = min(int(self.headers.get("Content-Length") or 0), 20_000)
        return self._send(*_gtm.save_deal(self.rfile.read(n)))
