"""Serve only the local verification app and its fictional sample."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/src/app.mjs": "src/app.mjs",
    "/src/calculation.mjs": "src/calculation.mjs",
    "/src/styles.css": "src/styles.css",
    "/samples/employee-001.json": "samples/employee-001.json",
}


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript; charset=utf-8",
                      ".json": "application/json; charset=utf-8"}

    def do_GET(self):
        route = urlsplit(self.path).path
        target = PUBLIC_FILES.get(route)
        if target is None:
            self.send_error(404)
            return
        self.path = "/" + target
        super().do_GET()

    def do_HEAD(self):
        route = urlsplit(self.path).path
        target = PUBLIC_FILES.get(route)
        if target is None:
            self.send_error(404)
            return
        self.path = "/" + target
        super().do_HEAD()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; script-src 'self'; style-src 'self'; "
                         "connect-src 'self'; img-src 'self' data:; "
                         "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8871), AppHandler)
    print("Local app: http://127.0.0.1:8871", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
