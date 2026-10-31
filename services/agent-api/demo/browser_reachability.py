"""Prove host loopback reachability from the current Docker runtime, without credentials."""

import json
import secrets
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


def main():
    nonce = secrets.token_hex(16)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/" + nonce:
                self.send_error(404)
                return
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"cortex-loopback-fixture")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        result = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--read-only",
                "--network",
                "bridge",
                "--entrypoint",
                "python",
                "python:3.12-slim",
                "-c",
                f'import urllib.request; print(urllib.request.urlopen("http://host.docker.internal:{port}/{nonce}",timeout=5).read().decode())',
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        context = subprocess.run(
            ["docker", "context", "show"], capture_output=True, text=True, check=True
        ).stdout.strip()
        print(
            json.dumps(
                {
                    "runtime": context,
                    "host_binding": "127.0.0.1",
                    "container_host": "host.docker.internal",
                    "success": result.returncode == 0
                    and "cortex-loopback-fixture" in result.stdout,
                    "error": result.stderr[-1000:] if result.returncode else None,
                },
                indent=2,
            )
        )
        return result.returncode
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
